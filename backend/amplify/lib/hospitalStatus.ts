/**
 * The one safe way for a Lambda to change a hospital's status: read it, apply a change, write it only if
 * nobody changed it meanwhile (up to three tries), then refresh the hospital's public directory entry so
 * patients see the new free-bed count within seconds (requirement 9.2). Used by update-status (unit staff),
 * care-actions (arrival), referral-actions (transfer admitted) and admin-settings (auto-accept rules).
 * Logs only statuses, never status contents.
 */
import { publicEntry } from '@medora/shared/logic/publicDirectory';
import type { Bi, HospitalStatus } from '@medora/shared/logic/types';

interface Result {
  errors?: unknown[];
}

/** The part of the Amplify data client this needs; every handler's client has these models. */
export interface StatusModels {
  models: {
    HospitalStatus: {
      get(input: { id: string }): Promise<Result & { data?: { status: unknown } | null }>;
      update(input: { id: string; status: string }): Promise<Result>;
    };
    HospitalProfile: {
      get(input: { id: string }): Promise<Result & { data?: { name: unknown; lat?: number | null; lng?: number | null; typicalWaitMin?: number | null } | null }>;
    };
    PublicDirectory: {
      update(input: { id: string; hospitalId: string; entry: string }): Promise<Result & { data?: unknown }>;
      create(input: { id: string; hospitalId: string; entry: string }): Promise<Result>;
    };
  };
}

/** What a change returns: the new status, or a refusal with its reason. Extra fields are passed back as they are. */
export type StatusWrite = { ok: true; status: HospitalStatus } | { ok: false; reason: string };

const parseJson = (raw: unknown): unknown => (typeof raw === 'string' ? JSON.parse(raw) : raw);

/**
 * Applies `change` to the hospital's current status and saves it. `change` may refuse (`ok: false`), which
 * is returned as is; it may run more than once, so it must not have side effects. Throws `no-status`,
 * `save-failed` or `busy` (still changing after three tries).
 */
export async function writeHospitalStatus<R extends StatusWrite>(
  client: StatusModels,
  hospitalId: string,
  change: (current: HospitalStatus) => R,
  logName: string,
): Promise<R> {
  const read = async (): Promise<{ raw: string; status: HospitalStatus }> => {
    const current = await client.models.HospitalStatus.get({ id: hospitalId });
    if (current.errors?.length || !current.data) {
      console.error(`${logName}: no status for this hospital`);
      throw new Error('no-status');
    }
    // AWSJSON comes back as a string from AppSync.
    const raw = typeof current.data.status === 'string' ? current.data.status : JSON.stringify(current.data.status);
    return { raw, status: JSON.parse(raw) as HospitalStatus };
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = await read();
    const result = change(before.status);
    if (!result.ok) return result;
    if ((await read()).raw !== before.raw) continue; // changed meanwhile: apply again to the newer version
    const saved = await client.models.HospitalStatus.update({ id: hospitalId, status: JSON.stringify(result.status) });
    if (saved.errors?.length) {
      console.error(`${logName}: save failed`);
      throw new Error('save-failed');
    }
    await refreshPublicEntry(client, hospitalId, result.status, logName).catch(() => console.error(`${logName}: public directory refresh failed`));
    return result;
  }
  throw new Error('busy');
}

/** For logs: the helper's own error codes only, never a message that could carry data (AGENTS.md 4b.5). */
export function statusErrorCode(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  return ['no-status', 'save-failed', 'busy'].includes(code) ? code : 'error';
}

/**
 * Refreshes the hospital's public labels and free-bed count from its new status. The status is already
 * saved; a failure here is logged, not thrown.
 */
export async function refreshPublicEntry(client: StatusModels, hospitalId: string, status: HospitalStatus, logName: string): Promise<void> {
  const profile = await client.models.HospitalProfile.get({ id: hospitalId });
  if (profile.errors?.length || !profile.data) {
    console.error(`${logName}: no profile for the public directory`);
    return;
  }
  // Written as the profile has it, as update-status always did: a hospital's labels must never go stale.
  const { name, lat, lng, typicalWaitMin } = profile.data;
  const entry = JSON.stringify(publicEntry({ hospitalId, name: parseJson(name) as Bi, lat: lat as number, lng: lng as number, typicalWaitMin: typicalWaitMin as number }, status));
  const updated = await client.models.PublicDirectory.update({ id: hospitalId, hospitalId, entry });
  if (!updated.errors?.length && updated.data) return;
  // Hospitals registered before the directory existed have no row yet.
  const created = await client.models.PublicDirectory.create({ id: hospitalId, hospitalId, entry });
  if (created.errors?.length) console.error(`${logName}: public directory write failed`);
}
