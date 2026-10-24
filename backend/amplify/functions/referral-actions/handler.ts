import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import type { AppSyncIdentityCognito, AppSyncResolverEvent } from 'aws-lambda';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { callerFromClaims, canStartReferral } from '@medora/shared/logic/access';
import { SET_ASIDE_TEXT, checkReferralDecision, isSetAsideReason, type ReferralDecision } from '@medora/shared/logic/referral';
import { kindForNeed, occupyOne } from '@medora/shared/logic/reservations';
import type { HospitalStatus } from '@medora/shared/logic/types';

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
  chosenId?: string | null;
  etaMin?: number | null;
}
interface Client {
  models: {
    Referral: Model<ReferralRow>;
    CareRequest: Model<{ id: string; hospitalId: string; status: string; needKey: string; referralId?: string | null }>;
    Transfer: Model<{ id: string; ownerId: string; status: string; referralId: string; toHospitalId: string }>;
    Reservation: Model<{ id: string; requestId: string; state: string }>;
    HospitalStatus: Model<{ id: string; status: unknown }>;
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
  const held = (await client.models.Reservation.list({ filter: { requestId: { eq: request.id } }, limit: 10 })).data.find((r) => r.state === 'held');
  if (held) await client.models.Reservation.update({ id: held.id, state: 'converted' });
  const kind = kindForNeed(request.needKey);
  if (!kind) return;
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
  await log(client, me.hospitalId, me.userId, `Transfer ${transfer.id}: arrived`, `การส่งต่อ ${transfer.id}: ถึงแล้ว`);
  return 'arrived';
}

export const handler = async (event: AppSyncResolverEvent<Rec>): Promise<string> => {
  const client = await dataClient();
  // Amplify Gen 2 function resolvers pass the field at the top level (event.fieldName); AppSync's
  // direct Lambda resolvers use event.info.fieldName. Accept both.
  switch ((event as { fieldName?: string }).fieldName ?? event.info?.fieldName) {
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
