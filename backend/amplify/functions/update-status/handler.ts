import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import type { AppSyncIdentityCognito, AppSyncResolverHandler } from 'aws-lambda';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { callerFromClaims, isUnitClaim } from '@medora/shared/logic/access';
import { publicEntry } from '@medora/shared/logic/publicDirectory';
import { applyStatusChange, itemId, type StatusChange } from '@medora/shared/logic/statusUpdate';
import type { Bi, HospitalStatus } from '@medora/shared/logic/types';

interface Args {
  change: unknown;
  note?: string | null;
}

interface Result {
  errors?: unknown[];
}

interface StatusClient {
  models: {
    HospitalStatus: {
      get: (input: { id: string }) => Promise<Result & { data: { id: string; status: unknown } | null }>;
      update: (input: { id: string; status: string }) => Promise<Result>;
    };
    HospitalProfile: {
      get: (input: { id: string }) => Promise<Result & { data: { hospitalId: string; name: unknown; lat: number; lng: number; typicalWaitMin: number } | null }>;
    };
    PublicDirectory: {
      update: (input: { id: string; hospitalId: string; entry: string }) => Promise<Result & { data: unknown }>;
      create: (input: { id: string; hospitalId: string; entry: string }) => Promise<Result>;
    };
    Activity: {
      create: (input: Record<string, unknown>) => Promise<Result>;
    };
  };
}

const parseJson = (raw: unknown): unknown => (typeof raw === 'string' ? JSON.parse(raw) : raw);

/**
 * Refreshes the hospital's public labels from its new status, so patient screens change within
 * seconds (requirement 9.2). The status is already saved; a failure here is logged, not thrown.
 */
async function refreshPublicEntry(client: StatusClient, hospitalId: string, status: HospitalStatus): Promise<void> {
  const profile = await client.models.HospitalProfile.get({ id: hospitalId });
  if (profile.errors?.length || !profile.data) {
    console.error('update-status: no profile for the public directory');
    return;
  }
  const name = parseJson(profile.data.name) as Bi;
  const entry = JSON.stringify(
    publicEntry({ hospitalId, name, lat: profile.data.lat, lng: profile.data.lng, typicalWaitMin: profile.data.typicalWaitMin }, status),
  );
  const updated = await client.models.PublicDirectory.update({ id: hospitalId, hospitalId, entry });
  if (!updated.errors?.length && updated.data) return;
  // Hospitals registered before the directory existed have no row yet.
  const created = await client.models.PublicDirectory.create({ id: hospitalId, hospitalId, entry });
  if (created.errors?.length) console.error('update-status: public directory write failed');
}

async function dataClient(): Promise<StatusClient> {
  const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(process.env as never);
  Amplify.configure(resourceConfig, libraryOptions);
  return generateClient() as unknown as StatusClient;
}

/** AWSJSON arrives as a string; accept an already-parsed object too. Anything else is refused. */
function parseChange(raw: unknown): StatusChange | undefined {
  try {
    const value = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
    return value !== null && typeof value === 'object' && typeof (value as { kind?: unknown }).kind === 'string'
      ? (value as StatusChange)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Applies one status change for the caller's own hospital. The caller must hold a staff-pool token;
 * the hospital always comes from that token, never from the request. Ownership of the item is decided
 * by `applyStatusChange` (docs/roles.md). Logs only the outcome, never notes or names.
 */
export const handler: AppSyncResolverHandler<Args, string> = async (event) => {
  const identity = event.identity as AppSyncIdentityCognito | null | undefined;
  const caller = callerFromClaims(identity?.claims as Record<string, unknown> | undefined, process.env.STAFF_USER_POOL_ID);
  if (!caller?.hospitalId || !isUnitClaim(caller.unit)) throw new Error('not-staff'); // refuse before any read

  const change = parseChange(event.arguments.change);
  if (!change) throw new Error('bad-change');

  const client = await dataClient();
  const current = await client.models.HospitalStatus.get({ id: caller.hospitalId });
  if (current.errors?.length || !current.data) {
    console.error('update-status: no status for this hospital');
    throw new Error('no-status');
  }

  // AWSJSON comes back as a string from AppSync.
  const raw = current.data.status;
  const stored = (typeof raw === 'string' ? JSON.parse(raw) : raw) as HospitalStatus;
  const result = applyStatusChange(stored, change, caller, caller.hospitalId, new Date().toISOString(), event.arguments.note ?? undefined);
  if (!result.ok) {
    console.warn(`update-status refused: ${result.reason}`);
    throw new Error(result.reason);
  }

  const saved = await client.models.HospitalStatus.update({ id: caller.hospitalId, status: JSON.stringify(result.status) });
  if (saved.errors?.length) {
    console.error('update-status: save failed');
    throw new Error('save-failed');
  }
  await refreshPublicEntry(client, caller.hospitalId, result.status).catch(() => console.error('update-status: public directory refresh failed'));
  // Every app decision goes to the activity log (AGENTS.md 4b.6): ids and units only, never the note.
  const what = itemId(change);
  const logged = await client.models.Activity.create({
    hospitalId: caller.hospitalId,
    ownerId: typeof identity?.sub === 'string' ? identity.sub : undefined,
    at: new Date().toISOString(),
    actor: JSON.stringify({ en: `Unit: ${caller.unit}`, th: `หน่วย: ${caller.unit}` }),
    text: JSON.stringify({ en: `Status updated: ${what}`, th: `อัปเดตสถานะ: ${what}` }),
  });
  if (logged.errors?.length) console.error('update-status: activity log failed');
  console.info(`update-status ok: kind=${change.kind} unit=${caller.unit ?? '-'}`);
  return 'ok';
};
