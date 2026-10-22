import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import type { AppSyncIdentityCognito, AppSyncResolverEvent } from 'aws-lambda';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { callerFromClaims, canStartReferral } from '@medora/shared/logic/access';
import { checkReferralDecision, type ReferralDecision } from '@medora/shared/logic/referral';

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
    CareRequest: Model<{ id: string; hospitalId: string; status: string }>;
    Transfer: Model<{ id: string }>;
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
  await log(client, me.hospitalId, me.userId, `Referral ${referral.id}: ${check.status}`, `การส่งต่อ ${referral.id}: ${check.status}`);
  console.info(`referral-actions decide ok: ${check.status}`);
  return check.status;
}

export const handler = async (event: AppSyncResolverEvent<Rec>): Promise<string> => {
  const client = await dataClient();
  switch (event.info.fieldName) {
    case 'openReferral':
      return openReferral(client, event);
    case 'decideReferral':
      return decide(client, event);
    default:
      throw new Error('unknown-action');
  }
};
