import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import type { AppSyncIdentityCognito, AppSyncResolverHandler } from 'aws-lambda';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { callerFromClaims, isUnitClaim } from '@medora/shared/logic/access';
import { GROUPS } from '@medora/shared/logic/session';
import { writeHospitalStatus } from '../../lib/hospitalStatus';
import { applyStatusChange, itemId, type StatusChange } from '@medora/shared/logic/statusUpdate';

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
  // Unit staff (with a unit) or the hospital's admin; the hospital always comes from the token. Refuse before any read.
  const admin = caller?.groups.includes(GROUPS.admins) === true;
  if (!caller?.hospitalId || (!admin && !isUnitClaim(caller.unit))) throw new Error('not-staff');

  const change = parseChange(event.arguments.change);
  if (!change) throw new Error('bad-change');

  const client = await dataClient();
  // Staff and the admin write the same status: writeHospitalStatus re-reads right before saving and applies the
  // change again on top of anyone else's newer version, then refreshes the public directory entry.
  const hospitalId = caller.hospitalId;
  const result = await writeHospitalStatus(
    client,
    hospitalId,
    (current) => applyStatusChange(current, change, caller, hospitalId, new Date().toISOString(), event.arguments.note ?? undefined),
    'update-status',
  );
  if (!result.ok) {
    console.warn(`update-status refused: ${result.reason}`);
    throw new Error(result.reason);
  }
  // Every app decision goes to the activity log (AGENTS.md 4b.6): ids and units only, never the note.
  const what = itemId(change);
  const logged = await client.models.Activity.create({
    hospitalId: caller.hospitalId,
    ownerId: typeof identity?.sub === 'string' ? identity.sub : undefined,
    at: new Date().toISOString(),
    actor: JSON.stringify(admin && !isUnitClaim(caller.unit) ? { en: 'Hospital admin', th: 'ผู้ดูแลโรงพยาบาล' } : { en: `Unit: ${caller.unit}`, th: `หน่วย: ${caller.unit}` }),
    text: JSON.stringify(
      change.kind === 'owner'
        ? { en: `Owner of ${change.item} set to ${change.unit}`, th: `กำหนดให้ ${change.unit} ดูแล ${change.item}` }
        : { en: `Status updated: ${what}`, th: `อัปเดตสถานะ: ${what}` },
    ),
  });
  if (logged.errors?.length) console.error('update-status: activity log failed');
  console.info(`update-status ok: kind=${change.kind} unit=${caller.unit ?? '-'}`);
  return 'ok';
};
