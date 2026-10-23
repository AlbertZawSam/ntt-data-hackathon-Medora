import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import type { AppSyncIdentityCognito, AppSyncResolverEvent } from 'aws-lambda';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { callerFromClaims, canAnswerRequest } from '@medora/shared/logic/access';
import {
  MAX_MESSAGE,
  QUICK_REPLY_KEYS,
  couldTreat,
  decideNewRequest,
  transition,
  validateRequestInput,
  type RequestAction,
} from '@medora/shared/logic/care';
import { activeHolds, kindForNeed, newReservation, withHolds, type Reservation } from '@medora/shared/logic/reservations';
import { GROUPS } from '@medora/shared/logic/session';
import type { CareRequest, HospitalStatus, NeedKey } from '@medora/shared/logic/types';

type Result<T> = { data: T | null; errors?: unknown[] };
type Record_ = Record<string, unknown>;

interface Model<T> {
  get(input: { id: string }): Promise<Result<T>>;
  create(input: Record_): Promise<Result<T>>;
  update(input: Record_): Promise<Result<T>>;
}

type RequestRecord = Omit<CareRequest, 'patient'> & { patient: unknown };

interface Client {
  models: {
    CareRequest: Model<RequestRecord>;
    HospitalStatus: Model<{ id: string; status: unknown }>;
    HospitalProfile: Model<{ id: string; name: unknown }>;
    Message: Model<{ id: string }>;
    Reservation: Model<Reservation> & { list(input: Record_): Promise<{ data: Reservation[]; errors?: unknown[] }> };
    Activity: Model<{ id: string }>;
  };
}

async function dataClient(): Promise<Client> {
  const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(process.env as never);
  Amplify.configure(resourceConfig, libraryOptions);
  return generateClient() as unknown as Client;
}

/** Holds currently in force at a hospital: held beds count as not free for ranking and auto-accept. */
async function currentHolds(client: Client, hospitalId: string) {
  const list = await client.models.Reservation.list({ filter: { hospitalId: { eq: hospitalId } }, limit: 1000 });
  if (list.errors?.length) throw new Error('data-unavailable');
  return activeHolds(list.data, hospitalId, Date.now());
}

async function hold(client: Client, request: { id: string; hospitalId: string; needKey: string }): Promise<void> {
  const kind = kindForNeed(request.needKey);
  if (!kind) return;
  const r = await client.models.Reservation.create(newReservation(request.id, request.hospitalId, kind, Date.now()));
  if (r.errors?.length) console.error('care-actions: hold failed');
}

async function settle(client: Client, requestId: string, state: 'released' | 'converted'): Promise<Reservation | undefined> {
  const found = await client.models.Reservation.list({ filter: { requestId: { eq: requestId } }, limit: 10 });
  const open = found.data.find((r) => r.state === 'held');
  if (open) await client.models.Reservation.update({ id: open.id, state });
  return open;
}

const must = <T>(result: Result<T>, what: string): T => {
  if (result.errors?.length || !result.data) {
    console.error(`care-actions: ${what} failed`); // ids and statuses only, never descriptions or names
    throw new Error(what);
  }
  return result.data;
};

const parse = <T>(v: unknown): T => (typeof v === 'string' ? (JSON.parse(v) as T) : (v as T));

/** Every app decision goes to the activity log (AGENTS.md 4b.6): ids and statuses only. */
async function log(client: Client, hospitalId: string, ownerId: string | undefined, actor: string, actorTh: string, en: string, th: string): Promise<void> {
  const r = await client.models.Activity.create({
    hospitalId,
    ownerId,
    at: new Date().toISOString(),
    actor: JSON.stringify({ en: actor, th: actorTh }),
    text: JSON.stringify({ en, th }),
  });
  if (r.errors?.length) console.error('care-actions: activity log failed');
}

/**
 * Re-reads the request right before writing and refuses if its status changed since the first read, so a
 * patient's cancel and a staff accept (or two staff answers) can't both succeed on a stale view. This
 * narrows the race to a few milliseconds; the Amplify data client has no conditional write.
 */
async function stillSame(client: Client, request: RequestRecord): Promise<void> {
  const fresh = must(await client.models.CareRequest.get({ id: request.id }), 'no-request');
  if (fresh.status !== request.status) throw new Error('bad-state');
}

/** A patient: public-pool token with the `patients` group. Returns the user's id. */
function patientId(event: AppSyncResolverEvent<Record_>): string {
  const identity = event.identity as AppSyncIdentityCognito | null | undefined;
  const claims = identity?.claims as Record_ | undefined;
  const iss = claims?.iss;
  const groups = claims?.['cognito:groups'];
  const poolId = process.env.PUBLIC_USER_POOL_ID;
  if (!poolId || typeof iss !== 'string' || !iss.endsWith(`/${poolId}`) || !Array.isArray(groups) || !groups.includes(GROUPS.patients)) {
    throw new Error('not-patient');
  }
  if (typeof identity?.sub !== 'string' || !identity.sub) throw new Error('not-patient');
  return identity.sub;
}

function staffCaller(event: AppSyncResolverEvent<Record_>) {
  const identity = event.identity as AppSyncIdentityCognito | null | undefined;
  const caller = callerFromClaims(identity?.claims as Record_ | undefined, process.env.STAFF_USER_POOL_ID);
  if (!caller?.hospitalId || !caller.groups.includes(GROUPS.staff)) throw new Error('not-staff');
  return { caller, sub: String(identity?.sub ?? '') };
}

async function submitRequest(client: Client, event: AppSyncResolverEvent<Record_>): Promise<string> {
  const ownerId = patientId(event);
  const a = event.arguments;
  const checked = validateRequestInput({
    hospitalId: a.hospitalId, needKey: a.needKey, etaMin: a.etaMin, mode: a.mode, name: a.name, phone: a.phone, description: a.description,
  });
  if (!checked.ok) throw new Error(`bad-${checked.issue}`);
  const input = checked.value;

  const statusRow = must(await client.models.HospitalStatus.get({ id: input.hospitalId }), 'no-status');
  const status = parse<HospitalStatus>(statusRow.status);
  const profile = await client.models.HospitalProfile.get({ id: input.hospitalId });
  const nowMs = Date.now();
  const decision = decideNewRequest(withHolds(status, await currentHolds(client, input.hospitalId)), input.needKey, nowMs);

  const created = must(
    await client.models.CareRequest.create({
      type: 'visit',
      hospitalId: input.hospitalId,
      ownerId,
      needKey: input.needKey,
      etaMin: input.etaMin,
      status: decision.status,
      auto: decision.auto,
      reason: decision.reason,
      overrideUntil: decision.overrideUntil,
      ...(decision.status === 'accepted' ? { acceptedAtMs: nowMs, couldTreat: couldTreat(status, input.needKey) } : {}),
      hospitalName: profile.data ? (typeof profile.data.name === 'string' ? profile.data.name : JSON.stringify(profile.data.name)) : undefined,
      patient: JSON.stringify({ name: input.name, phone: input.phone, mode: input.mode, description: input.description }),
      createdAtMs: nowMs,
    }),
    'create-failed',
  );
  if (decision.status === 'accepted') await hold(client, { id: created.id, hospitalId: input.hospitalId, needKey: input.needKey });
  await log(client, input.hospitalId, ownerId, 'Patient', 'ผู้ป่วย', `Request ${created.id}: ${decision.status}${decision.auto ? ' (rule)' : ''}`, `คำขอ ${created.id}: ${decision.status}${decision.auto ? ' (ตามกฎ)' : ''}`);
  console.info(`care-actions submit ok: status=${decision.status}`);
  return created.id;
}

async function patientCancel(client: Client, event: AppSyncResolverEvent<Record_>): Promise<string> {
  const ownerId = patientId(event);
  const request = must(await client.models.CareRequest.get({ id: String(event.arguments.requestId) }), 'no-request');
  if (request.ownerId !== ownerId) throw new Error('not-owner');
  const move = transition(request, 'cancel', Date.now());
  if (!move.ok) throw new Error(move.reason);
  await stillSame(client, request);
  must(await client.models.CareRequest.update({ id: request.id, status: move.status }), 'save-failed');
  await settle(client, request.id, 'released');
  await log(client, request.hospitalId, ownerId, 'Patient', 'ผู้ป่วย', `Request ${request.id}: cancelled`, `คำขอ ${request.id}: ยกเลิก`);
  return 'ok';
}

const STAFF_ACTIONS: readonly string[] = ['accept', 'decline', 'undo', 'arrived'];
const DECLINE_REASONS = ['nobed', 'busy', 'equip', 'divert'];

async function answerRequest(client: Client, event: AppSyncResolverEvent<Record_>): Promise<string> {
  const { caller, sub } = staffCaller(event);
  const action = String(event.arguments.action);
  if (!STAFF_ACTIONS.includes(action)) throw new Error('bad-action');
  const request = must(await client.models.CareRequest.get({ id: String(event.arguments.requestId) }), 'no-request');
  // Staff answer only their own hospital's requests (docs/roles.md).
  if (!canAnswerRequest(caller, request)) throw new Error('not-staff');
  const move = transition(request, action as RequestAction, Date.now());
  if (!move.ok) throw new Error(move.reason);

  await stillSame(client, request);
  const reason = typeof event.arguments.reason === 'string' && DECLINE_REASONS.includes(event.arguments.reason) ? event.arguments.reason : undefined;
  const note = typeof event.arguments.note === 'string' ? event.arguments.note.trim().slice(0, 200) : undefined;
  must(
    await client.models.CareRequest.update({
      id: request.id,
      status: move.status,
      ...(action === 'decline' || action === 'undo' ? { reason: reason ?? (action === 'undo' ? 'undone_by_staff' : undefined) } : {}),
      ...(note ? { note } : {}),
      ...(action === 'accept' ? { reason: 'accepted_by_staff', auto: false, acceptedAtMs: Date.now(), couldTreat: await couldTreatNow(client, request) } : {}),
    }),
    'save-failed',
  );
  if (action === 'accept') await hold(client, request);
  if (action === 'decline' || action === 'undo') await settle(client, request.id, 'released');
  if (action === 'arrived') {
    // The patient now occupies the bed: the hold becomes a used bed, so the count goes down by one.
    const held = await settle(client, request.id, 'converted');
    if (held) await occupy(client, request.hospitalId, held.kind);
  }
  await log(client, request.hospitalId, sub, `Unit: ${caller.unit ?? '-'}`, `หน่วย: ${caller.unit ?? '-'}`, `Request ${request.id}: ${action}`, `คำขอ ${request.id}: ${action}`);
  console.info(`care-actions answer ok: action=${action}`);
  return 'ok';
}

/** Whether the hospital could treat this request's need at the moment staff accept it (success metric). */
async function couldTreatNow(client: Client, request: RequestRecord): Promise<boolean | undefined> {
  const row = await client.models.HospitalStatus.get({ id: request.hospitalId });
  if (!row.data || !['maternity', 'child', 'injury', 'general'].includes(request.needKey)) return undefined;
  return couldTreat(withHolds(parse<HospitalStatus>(row.data.status), await currentHolds(client, request.hospitalId)), request.needKey as NeedKey);
}

async function occupy(client: Client, hospitalId: string, kind: 'bed' | 'nicu'): Promise<void> {
  const row = await client.models.HospitalStatus.get({ id: hospitalId });
  if (!row.data) return;
  const status = parse<HospitalStatus>(row.data.status);
  const next = kind === 'nicu' ? { ...status, nicu: Math.max(0, status.nicu - 1) } : { ...status, beds: Math.max(0, status.beds - 1) };
  await client.models.HospitalStatus.update({ id: hospitalId, status: JSON.stringify(next) });
}

async function sendMessage(client: Client, event: AppSyncResolverEvent<Record_>): Promise<string> {
  const a = event.arguments;
  const key = typeof a.key === 'string' && a.key ? a.key : undefined;
  const text = typeof a.text === 'string' ? a.text.trim() : undefined;
  // Exactly one of a quick-reply key or free text.
  if ((key !== undefined) === Boolean(text)) throw new Error('bad-message');
  if (key !== undefined && !(QUICK_REPLY_KEYS as readonly string[]).includes(key)) throw new Error('bad-message');
  if (text && text.length > MAX_MESSAGE) throw new Error('bad-message');

  const request = must(await client.models.CareRequest.get({ id: String(a.requestId) }), 'no-request');
  if (request.status !== 'accepted' && request.status !== 'waiting') throw new Error('bad-state');

  // Decide which side is speaking from the token, never from an argument.
  let from: 'patient' | 'hospital';
  const identity = event.identity as AppSyncIdentityCognito | null | undefined;
  const staffClaims = callerFromClaims(identity?.claims as Record_ | undefined, process.env.STAFF_USER_POOL_ID);
  if (staffClaims) {
    if (!canAnswerRequest(staffClaims, request)) throw new Error('not-staff');
    from = 'hospital';
  } else {
    if (patientId(event) !== request.ownerId) throw new Error('not-owner');
    from = 'patient';
  }
  must(
    await client.models.Message.create({
      requestId: request.id,
      ownerId: request.ownerId,
      hospitalId: request.hospitalId,
      from,
      key,
      text: key ? undefined : text,
      createdAtMs: Date.now(),
    }),
    'save-failed',
  );
  console.info(`care-actions message ok: from=${from}`);
  return 'ok';
}

export const handler = async (event: AppSyncResolverEvent<Record_>): Promise<string> => {
  const client = await dataClient();
  switch (event.info.fieldName) {
    case 'submitRequest':
      return submitRequest(client, event);
    case 'cancelRequest':
      return patientCancel(client, event);
    case 'answerRequest':
      return answerRequest(client, event);
    case 'sendMessage':
      return sendMessage(client, event);
    default:
      throw new Error('unknown-action');
  }
};
