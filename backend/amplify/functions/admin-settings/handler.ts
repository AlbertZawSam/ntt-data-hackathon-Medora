import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import type { AppSyncIdentityCognito, AppSyncResolverHandler } from 'aws-lambda';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { callerFromClaims, canManageHospital } from '@medora/shared/logic/access';
import { sanitizeRules } from '@medora/shared/logic/rules';

type Result<T> = { data: T | null; errors?: unknown[] };
interface Client {
  models: {
    HospitalStatus: {
      get(i: { id: string }): Promise<Result<{ id: string; status: unknown }>>;
      update(i: { id: string; status: string }): Promise<Result<unknown>>;
    };
    Activity: { create(i: Record<string, unknown>): Promise<Result<unknown>> };
  };
}

async function dataClient(): Promise<Client> {
  const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(process.env as never);
  Amplify.configure(resourceConfig, libraryOptions);
  return generateClient() as unknown as Client;
}

/** Admins set their own hospital's auto-accept rules; the hospital comes from the token. */
export const handler: AppSyncResolverHandler<{ rules: unknown }, string> = async (event) => {
  const identity = event.identity as AppSyncIdentityCognito | null | undefined;
  const claims = identity?.claims as Record<string, unknown> | undefined;
  // Staff-pool admins only: hospital accounts exist only in the invite-only staff pool (AGENTS.md 4b.1).
  const caller = callerFromClaims(claims, process.env.STAFF_USER_POOL_ID);
  if (!caller?.hospitalId || !canManageHospital(caller, caller.hospitalId)) throw new Error('not-admin');

  const raw = event.arguments.rules;
  const rules = sanitizeRules(typeof raw === 'string' ? safeParse(raw) : raw);
  if (!rules) throw new Error('bad-rules');

  const client = await dataClient();
  const current = await client.models.HospitalStatus.get({ id: caller.hospitalId });
  if (current.errors?.length || !current.data) throw new Error('no-status');
  const stored = (typeof current.data.status === 'string' ? JSON.parse(current.data.status) : current.data.status) as Record<string, unknown>;
  const saved = await client.models.HospitalStatus.update({ id: caller.hospitalId, status: JSON.stringify({ ...stored, rules }) });
  if (saved.errors?.length) throw new Error('save-failed');

  const logged = await client.models.Activity.create({
    hospitalId: caller.hospitalId,
    ownerId: typeof identity?.sub === 'string' ? identity.sub : undefined,
    at: new Date().toISOString(),
    actor: JSON.stringify({ en: 'Admin', th: 'ผู้ดูแล' }),
    text: JSON.stringify({ en: 'Auto-accept rules changed', th: 'เปลี่ยนกฎตอบรับอัตโนมัติ' }),
  });
  if (logged.errors?.length) console.error('admin-settings: activity log failed');
  console.info('admin-settings ok: rules');
  return 'ok';
};

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
