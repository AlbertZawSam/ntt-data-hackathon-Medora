import { createHash } from 'node:crypto';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { AdminUpdateUserAttributesCommand, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import type { AppSyncIdentityCognito, AppSyncResolverHandler } from 'aws-lambda';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { checkRegistration, validateHospitalInput } from '@medora/shared/logic/hospital';

const cognito = new CognitoIdentityProviderClient();

interface Args {
  nameEn: string;
  nameTh: string;
  lat: number;
  lng: number;
  totalBeds: number;
  nicuTotal: number;
}

interface Result {
  errors?: unknown[];
}

interface HospitalClient {
  models: {
    HospitalProfile: {
      create: (input: Record<string, unknown>) => Promise<Result & { data: { id: string } | null }>;
      delete: (input: { id: string }) => Promise<Result>;
    };
    HospitalStatus: {
      create: (input: Record<string, unknown>) => Promise<Result & { data: { id: string } | null }>;
      delete: (input: { id: string }) => Promise<Result>;
    };
  };
}

/** Error types only (for example Unauthorized or ConditionalCheckFailedException): never messages, which can echo input. */
function errorTypes(errors: unknown[] | undefined): string {
  return (errors ?? []).map((e) => (typeof (e as { errorType?: unknown })?.errorType === 'string' ? (e as { errorType: string }).errorType : 'unknown')).join(',');
}

async function dataClient(): Promise<HospitalClient> {
  const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(process.env as never);
  Amplify.configure(resourceConfig, libraryOptions);
  return generateClient() as unknown as HospitalClient;
}

/**
 * Registers the caller's hospital. The caller must be an admin from the staff pool who has no
 * hospital yet; the id is generated here and never taken from the request. The profile is created
 * first and removed again if the user's attribute can't be set, so a failure leaves nothing behind.
 * Logs only the outcome, never names or locations.
 */
export const handler: AppSyncResolverHandler<Args, string> = async (event) => {
  const poolId = process.env.STAFF_USER_POOL_ID;
  const identity = event.identity as AppSyncIdentityCognito | null | undefined;
  const caller = checkRegistration(identity?.claims as Record<string, unknown> | undefined, poolId);
  if (!poolId || !caller.ok) {
    console.warn(`register-hospital refused: ${caller.ok ? 'no-pool' : caller.reason}`);
    throw new Error(caller.ok ? 'not-admin' : caller.reason);
  }

  const input = validateHospitalInput(event.arguments);
  if (!input.ok) {
    console.warn(`register-hospital refused: bad-${input.issue}`);
    throw new Error(`bad-${input.issue}`);
  }
  const { nameEn, nameTh, lat, lng, totalBeds, nicuTotal } = input.value;

  // Derived from the caller's `sub` and used as the record id too: DynamoDB refuses a second create
  // with the same id, so an old token (issued before registering) can't register another hospital.
  const hospitalId = `H-${createHash('sha256').update(caller.sub).digest('hex').slice(0, 16)}`;
  const client = await dataClient();
  const created = await client.models.HospitalProfile.create({
    id: hospitalId,
    hospitalId,
    // AppSync AWSJSON fields take a JSON string; the data client does not stringify objects.
    name: JSON.stringify({ en: nameEn, th: nameTh }),
    lat,
    lng,
    totalBeds,
    nicuTotal,
    typicalWaitMin: 30,
    departments: [],
    equipment: [],
  });
  if (created.errors?.length || !created.data) {
    console.error(`register-hospital profile failed: ${errorTypes(created.errors) || 'no-data'}`);
    throw new Error('register-failed');
  }

  // The live status starts empty and stale: nothing is open until the units say so. Its id is the
  // hospital id, which is how `update-status` finds it.
  const status = await client.models.HospitalStatus.create({
    id: hospitalId,
    hospitalId,
    status: JSON.stringify({
      beds: 0,
      nicu: 0,
      depts: {},
      equip: {},
      oncall: {},
      rules: { minBeds: 1 },
      conflict: false,
      updatedAt: new Date(0).toISOString(),
    }),
  });
  if (status.errors?.length || !status.data) {
    console.error(`register-hospital status failed: ${errorTypes(status.errors) || 'no-data'}`);
    await client.models.HospitalProfile.delete({ id: created.data.id }).catch(() =>
      console.error(`register-hospital rollback failed: hospital=${hospitalId}`),
    );
    throw new Error('register-failed');
  }

  try {
    await cognito.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: poolId,
        Username: caller.username,
        UserAttributes: [{ Name: 'custom:hospitalId', Value: hospitalId }],
      }),
    );
  } catch (error) {
    console.error(`register-hospital attribute failed: ${error instanceof Error ? error.name : 'unknown'}`);
    await client.models.HospitalStatus.delete({ id: status.data.id }).catch(() =>
      console.error(`register-hospital rollback failed: hospital=${hospitalId}`),
    );
    await client.models.HospitalProfile.delete({ id: created.data.id }).catch(() =>
      console.error(`register-hospital rollback failed: hospital=${hospitalId}`),
    );
    throw new Error('register-failed');
  }

  console.info(`register-hospital ok: hospital=${hospitalId}`);
  return hospitalId;
};
