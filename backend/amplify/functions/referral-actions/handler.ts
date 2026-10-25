import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import type { AppSyncIdentityCognito, AppSyncResolverEvent } from 'aws-lambda';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { callerFromClaims, canStartReferral } from '@medora/shared/logic/access';
import { SET_ASIDE_TEXT, checkReferralDecision, isSetAsideReason, type ReferralDecision } from '@medora/shared/logic/referral';
import { checkDirectReferral, referralTargets } from '@medora/shared/logic/directReferral';
import { activeHolds, holdKind, occupyOne, withHolds, type Reservation } from '@medora/shared/logic/reservations';
import { driveEstimate, haversineKm } from '@medora/shared/logic/ranking';
import type { SpecialistRecord } from '@medora/shared/logic/specialists';
import type { Bi, HospitalStatus, ReferralProgressStatus } from '@medora/shared/logic/types';

type Rec = Record<string, unknown>;
type Result<T> = { data: T | null; errors?: unknown[] };
interface Model<T> {
  get(i: { id: string }): Promise<Result<T>>;
  list(i: Rec): Promise<{ data: T[]; errors?: unknown[] }>;
  create(i: Rec): Promise<Result<T>>;
  update(i: Rec): Promise<Result<T>>;
}
interface ReferralRow {
  id: string;
  ownerId: string;
  fromHospitalId: string;
  status: string;
  sourceRequestId?: string | null;
  chosenId?: string | null;
  chosenName?: unknown;
  etaMin?: number | null;
}
interface Client {
  models: {
    Referral: Model<ReferralRow>;
    CareRequest: Model<{ id: string; hospitalId: string; status: string; needKey: string; type?: string; referralId?: string | null; patient?: unknown }>;
    Transfer: Model<{ id: string; ownerId: string; status: string; referralId: string; toHospitalId: string }>;
    Reservation: Model<Reservation & { requestId: string; state: string }> & {
      listReservationByRequestId(i: { requestId: string }): Promise<{ data: Array<Reservation & { requestId: string; state: string }> | null; errors?: unknown[] }>;
    };
    HospitalStatus: Model<{ id: string; hospitalId: string; status: unknown }>;
    HospitalProfile: Model<{ id: string; hospitalId: string; name: unknown; lat: number; lng: number; typicalWaitMin: number }>;
    Specialist: Model<Omit<SpecialistRecord, 'slots'> & { slots: unknown }>;
    Activity: Model<{ id: string }>;
  };
}

async function dataClient(): Promise<Client> {
  const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(process.env as never);
  Amplify.configure(resourceConfig, libraryOptions);
  return generateClient() as unknown as Client;
}

const must = <T>(r: Result<T>, what: string): T => {
  if (r.errors?.length || !r.data) {
    console.error(`referral-actions: ${what} failed`); // ids and statuses only
    throw new Error(what);
  }
  return r.data;
};

/** Doctors of the invite-only staff pool: the hospital and the user id come from the token, never the request. */
function doctor(event: AppSyncResolverEvent<Rec>): { groups: readonly string[]; hospitalId: string; unit?: string; userId: string } {
  const identity = event.identity as AppSyncIdentityCognito | null | undefined;
  const caller = callerFromClaims(identity?.claims as Rec | undefined, process.env.STAFF_USER_POOL_ID);
  if (!caller || !canStartReferral(caller) || typeof identity?.sub !== 'string' || !identity.sub) throw new Error('not-doctor');
  return { ...caller, hospitalId: caller.hospitalId as string, userId: identity.sub };
}

async function log(client: Client, hospitalId: string, ownerId: string, en: string, th: string): Promise<void> {
  const r = await client.models.Activity.create({
    hospitalId,
    ownerId,
    at: new Date().toISOString(),
    actor: JSON.stringify({ en: 'Doctor', th: 'แพทย์' }),
    text: JSON.stringify({ en, th }),
  });
  if (r.errors?.length) console.error('referral-actions: activity log failed');
}

async function openReferral(client: Client, event: AppSyncResolverEvent<Rec>): Promise<string> {
  const me = doctor(event);
  const { text, onsetMin, lang } = event.arguments;
  const clean = typeof text === 'string' ? text.trim() : '';
  if (!clean || clean.length > 2000) throw new Error('bad-description');
  if (onsetMin != null && (typeof onsetMin !== 'number' || !Number.isInteger(onsetMin) || onsetMin < 0 || onsetMin > 10_080)) throw new Error('bad-onset');
  const created = must(
    await client.models.Referral.create({
      fromHospitalId: me.hospitalId,
      ownerId: me.userId,
      text: clean,
      ...(typeof onsetMin === 'number' ? { onsetMin } : {}),
      lang: lang === 'th' ? 'th' : 'en',
      status: 'running',
      mode: 'ai',
      requestIds: [],
      startedAtMs: Date.now(),
    }),
    'create-failed',
  );
  await log(client, me.hospitalId, me.userId, `Referral ${created.id} started`, `เริ่มการส่งต่อ ${created.id}`);
  console.info('referral-actions create ok');
  return created.id;
}

async function decide(client: Client, event: AppSyncResolverEvent<Rec>): Promise<string> {
  const me = doctor(event);
  const decision = event.arguments.decision;
  if (decision !== 'confirm' && decision !== 'set_aside') throw new Error('bad-decision');
  const reason = event.arguments.reason;
  if (reason !== undefined && reason !== null && !isSetAsideReason(reason)) throw new Error('bad-reason');
  const referral = must(await client.models.Referral.get({ id: String(event.arguments.referralId) }), 'no-referral');

  const asked = await client.models.CareRequest.list({ filter: { referralId: { eq: referral.id } }, limit: 1000 });
  if (asked.errors?.length) throw new Error('data-unavailable');
  const accepted = asked.data.filter((r) => r.status === 'accepted').map((r) => r.hospitalId);

  const check = checkReferralDecision(me, referral, decision as ReferralDecision, accepted);
  if (!check.ok) {
    console.warn(`referral-actions refused: ${check.reason}`);
    throw new Error(check.reason);
  }

  // Re-read right before writing, so two quick taps can't both succeed.
  const fresh = must(await client.models.Referral.get({ id: referral.id }), 'no-referral');
  if (fresh.status !== 'awaiting') throw new Error('bad-state');
  // Setting a recommendation aside releases the chosen hospital: its accepted request is withdrawn first,
  // so a failure here leaves the referral open for a retry instead of closed with a bed still held.
  if (check.status === 'set_aside' && referral.chosenId) {
    for (const request of asked.data.filter((r) => r.hospitalId === referral.chosenId && r.status === 'accepted')) {
      must(await client.models.CareRequest.update({ id: request.id, status: 'cancelled' }), 'withdraw-failed');
    }
  }
  must(await client.models.Referral.update({ id: referral.id, status: check.status }), 'save-failed');

  if (check.status === 'confirmed' && referral.chosenId) {
    must(
      await client.models.Transfer.create({
        referralId: referral.id,
        hospitalIds: [referral.fromHospitalId, referral.chosenId],
        fromHospitalId: referral.fromHospitalId,
        toHospitalId: referral.chosenId,
        ownerId: me.userId,
        startedAt: Date.now(),
        etaMin: referral.etaMin ?? 0,
        status: 'in_progress',
      }),
      'transfer-failed',
    );
  }
  // Told only once the transfer exists, so "ambulance on its way" is true when the patient reads it.
  await tellPatient(client, referral, check.status);
  const why = check.status === 'set_aside' && isSetAsideReason(reason) ? SET_ASIDE_TEXT[reason] : null;
  await log(
    client,
    me.hospitalId,
    me.userId,
    `Referral ${referral.id}: ${check.status}${why ? ` (${why.en})` : ''}`,
    `การส่งต่อ ${referral.id}: ${check.status}${why ? ` (${why.th})` : ''}`,
  );
  console.info(`referral-actions decide ok: ${check.status}`);
  return check.status;
}

/**
 * Writes the referral's progress onto the patient's own request, the only record the patient can read, so
 * My requests shows where they are being referred. Hospital name and status only; a failure is logged and
 * never blocks the referral.
 */
async function tellPatient(client: Client, referral: { sourceRequestId?: string | null; chosenName?: unknown }, status: ReferralProgressStatus): Promise<void> {
  try {
    if (!referral.sourceRequestId || !referral.chosenName) return;
    // Only a patient's own visit request; an incoming referral belongs to another hospital's doctor.
    const source = await client.models.CareRequest.get({ id: referral.sourceRequestId });
    if (source.data?.type !== 'visit') return;
    const name = typeof referral.chosenName === 'string' ? JSON.parse(referral.chosenName) : referral.chosenName;
    const r = await client.models.CareRequest.update({ id: referral.sourceRequestId, referredTo: JSON.stringify({ name, status, atMs: Date.now() }) });
    if (r.errors?.length) console.error('referral-actions: patient progress update failed');
  } catch {
    console.error('referral-actions: patient progress update failed');
  }
}

const parseStatus = (v: unknown): HospitalStatus => (typeof v === 'string' ? (JSON.parse(v) as HospitalStatus) : (v as HospitalStatus));

/**
 * The patient now occupies a bed at the receiving hospital (requirement 13.4): its accepted request is
 * completed (so it leaves the inbox) and one bed, or one NICU cot, is taken. A held bed is converted
 * rather than counted twice. If staff already marked the patient arrived, nothing changes.
 */
async function admitAtReceivingHospital(client: Client, transfer: { referralId: string; toHospitalId: string }): Promise<void> {
  const requests = await client.models.CareRequest.list({ filter: { referralId: { eq: transfer.referralId } }, limit: 50 });
  const request = requests.data.find((r) => r.hospitalId === transfer.toHospitalId && r.status === 'accepted');
  if (!request) return;
  must(await client.models.CareRequest.update({ id: request.id, status: 'completed' }), 'save-failed');
  const found = await client.models.Reservation.listReservationByRequestId({ requestId: request.id });
  const held = (found.data ?? []).find((r) => r.state === 'held');
  if (held) await client.models.Reservation.update({ id: held.id, state: 'converted' });
  const kind = holdKind(request.needKey);
  const row = await client.models.HospitalStatus.get({ id: transfer.toHospitalId });
  if (!row.data) return;
  await client.models.HospitalStatus.update({ id: transfer.toHospitalId, status: JSON.stringify(occupyOne(parseStatus(row.data.status), kind)) });
}

/** The owning doctor marks their simulated transfer as arrived (requirement 13.3). */
async function arrive(client: Client, event: AppSyncResolverEvent<Rec>): Promise<string> {
  const me = doctor(event);
  const transfer = must(await client.models.Transfer.get({ id: String(event.arguments.transferId) }), 'no-transfer');
  if (transfer.ownerId !== me.userId) {
    console.warn('referral-actions refused: not-owner');
    throw new Error('not-owner');
  }
  if (transfer.status !== 'in_progress') throw new Error('bad-state');
  must(await client.models.Transfer.update({ id: transfer.id, status: 'arrived' }), 'save-failed');
  await admitAtReceivingHospital(client, transfer);
  const referral = await client.models.Referral.get({ id: transfer.referralId });
  if (referral.data) await tellPatient(client, referral.data, 'arrived');
  await log(client, me.hospitalId, me.userId, `Transfer ${transfer.id}: arrived`, `การส่งต่อ ${transfer.id}: ถึงแล้ว`);
  return 'arrived';
}

const parseJson = <T>(v: unknown): T => (typeof v === 'string' ? (JSON.parse(v) as T) : (v as T));

/** Every hospital's public profile and live status (held beds counted as taken), for direct referrals. */
async function loadHospitals(client: Client) {
  const [profiles, statuses, holds, specialists] = await Promise.all([
    client.models.HospitalProfile.list({ limit: 1000 }),
    client.models.HospitalStatus.list({ limit: 1000 }),
    client.models.Reservation.list({ limit: 1000 }),
    client.models.Specialist.list({ limit: 1000 }),
  ]);
  if (profiles.errors?.length || statuses.errors?.length || holds.errors?.length) throw new Error('data-unavailable');
  const statusById = new Map(statuses.data.map((s) => [s.hospitalId, parseJson<HospitalStatus>(s.status)]));
  const now = Date.now();
  const hospitals = profiles.data.flatMap((p) => {
    const status = statusById.get(p.hospitalId);
    const profile = { hospitalId: p.hospitalId, name: parseJson<Bi>(p.name), lat: p.lat, lng: p.lng, typicalWaitMin: p.typicalWaitMin };
    return status ? [{ profile, status: withHolds(status, activeHolds(holds.data, p.hospitalId, now)) }] : [];
  });
  const records: SpecialistRecord[] = specialists.errors?.length ? [] : specialists.data.map((r) => ({ ...r, slots: parseJson<SpecialistRecord['slots']>(r.slots) ?? [] }));
  return { hospitals, specialists: records };
}

/** Doctors: the other hospitals they can refer to, nearest first, with the public details only. */
async function targets(client: Client, event: AppSyncResolverEvent<Rec>): Promise<string> {
  const me = doctor(event);
  const { hospitals, specialists } = await loadHospitals(client);
  const origin = hospitals.find((h) => h.profile.hospitalId === me.hospitalId);
  if (!origin) throw new Error('no-hospital');
  return JSON.stringify(referralTargets(origin.profile, hospitals, specialists, Date.now()));
}

/**
 * Doctors: refer a patient of their hospital to a hospital and department they chose. Creates the referral
 * (mode `direct`) and the request at the receiving hospital, routed to that department; the department
 * accepts or declines (care-actions), then the doctor confirms the transfer as usual.
 */
/** Longest note a referring doctor can add for the receiving team. */
const MAX_DOCTOR_NOTE = 500;

async function referPatient(client: Client, event: AppSyncResolverEvent<Rec>): Promise<string> {
  const me = doctor(event);
  const { requestId, toHospitalId, department } = event.arguments;
  // The referring doctor's details for the receiving team: plain text only, never sent to a model.
  const doctorNote = typeof event.arguments.note === 'string' ? event.arguments.note.trim().slice(0, MAX_DOCTOR_NOTE) : '';
  const source = must(await client.models.CareRequest.get({ id: String(requestId) }), 'no-request');
  const { hospitals } = await loadHospitals(client);
  const to = hospitals.find((h) => h.profile.hospitalId === toHospitalId);
  const from = hospitals.find((h) => h.profile.hospitalId === me.hospitalId);
  const check = checkDirectReferral(me.hospitalId, source, String(toHospitalId), to?.status, department);
  if (!check.ok || !to || !from) {
    console.warn(`referral-actions refused: ${check.ok ? 'no-hospital' : check.reason}`);
    throw new Error(check.ok ? 'no-hospital' : check.reason);
  }
  // One open referral per patient: a second tap, or sending the same patient elsewhere, waits for the first to end.
  const open = await client.models.Referral.list({ filter: { fromHospitalId: { eq: me.hospitalId }, sourceRequestId: { eq: source.id } }, limit: 100 });
  if (open.errors?.length) throw new Error('data-unavailable');
  if (open.data.some((r) => r.status === 'running' || r.status === 'awaiting')) {
    console.warn('referral-actions refused: already-referred');
    throw new Error('already-referred');
  }
  const patient = parseJson<{ name?: string; phone?: string; description?: string }>(source.patient) ?? {};
  const description = (patient.description ?? '').trim().slice(0, 2000) || 'Referred patient';
  const etaMin = Math.max(1, Math.round(driveEstimate(haversineKm(from.profile, to.profile), new Date())));
  const now = Date.now();
  const referral = must(
    await client.models.Referral.create({
      fromHospitalId: me.hospitalId,
      ownerId: me.userId,
      text: description,
      lang: 'en',
      status: 'running',
      mode: 'direct',
      sourceRequestId: source.id,
      chosenId: to.profile.hospitalId,
      chosenName: JSON.stringify(to.profile.name),
      etaMin,
      requestIds: [],
      startedAtMs: now,
    }),
    'create-failed',
  );
  const dept = typeof department === 'string' && department ? department : undefined;
  const created = must(
    await client.models.CareRequest.create({
      type: 'referral',
      hospitalId: to.profile.hospitalId,
      ownerId: me.userId,
      needKey: source.needKey || 'general',
      etaMin,
      status: 'waiting',
      auto: false,
      hospitalName: JSON.stringify(to.profile.name),
      patient: JSON.stringify({ name: patient.name, phone: patient.phone, mode: 'ambulance', description, referredFrom: from.profile.name, ...(doctorNote ? { doctorNote } : {}) }),
      fromHospitalId: me.hospitalId,
      referralId: referral.id,
      ...(dept ? { department: dept } : {}),
      createdAtMs: now,
    }),
    'create-failed',
  );
  must(await client.models.Referral.update({ id: referral.id, requestIds: [created.id] }), 'save-failed');
  await tellPatient(client, { sourceRequestId: source.id, chosenName: to.profile.name }, 'waiting');
  await log(client, me.hospitalId, me.userId, `Referral ${referral.id}: sent to ${to.profile.hospitalId}${dept ? ` (${dept})` : ''}`, `การส่งต่อ ${referral.id}: ส่งไปยัง ${to.profile.hospitalId}`);
  console.info(`referral-actions refer ok: department=${dept ?? '-'}`);
  return referral.id;
}

export const handler = async (event: AppSyncResolverEvent<Rec>): Promise<string> => {
  const client = await dataClient();
  // Amplify Gen 2 function resolvers pass the field at the top level (event.fieldName); AppSync's
  // direct Lambda resolvers use event.info.fieldName. Accept both.
  switch ((event as { fieldName?: string }).fieldName ?? event.info?.fieldName) {
    case 'referralTargets':
      return targets(client, event);
    case 'referPatient':
      return referPatient(client, event);
    case 'openReferral':
      return openReferral(client, event);
    case 'decideReferral':
      return decide(client, event);
    case 'arriveTransfer':
      return arrive(client, event);
    default:
      throw new Error('unknown-action');
  }
};
