import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import type { AppSyncIdentityCognito, AppSyncResolverHandler } from 'aws-lambda';
import { callerFromClaims, checkInvitation } from '@medora/shared/logic/access';

const cognito = new CognitoIdentityProviderClient();

interface Args {
  email: string;
  group: string;
  unit?: string | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Creates a staff-pool account for the calling admin's own hospital (docs/roles.md).
 * The caller must hold a staff-pool token: an admin of the public pool is refused, so nobody can
 * self-register as an admin and invite themselves in. Logs only the outcome, never the email.
 */
export const handler: AppSyncResolverHandler<Args, string> = async (event) => {
  const poolId = process.env.STAFF_USER_POOL_ID;
  const identity = event.identity as AppSyncIdentityCognito | null | undefined;
  const caller = callerFromClaims(identity?.claims as Record<string, unknown> | undefined, poolId);
  if (!poolId || !caller) throw new Error('not-admin');

  const email = event.arguments.email.trim().toLowerCase();
  const { group } = event.arguments;
  const unit = event.arguments.unit ?? undefined;
  if (!EMAIL.test(email)) throw new Error('bad-email');

  // The invitation is always for the caller's own hospital; the hospital is never taken from the request.
  const check = checkInvitation(caller, { hospitalId: caller.hospitalId ?? '', group, unit });
  if (!check.ok) {
    console.warn(`invite-staff refused: ${check.reason}`);
    throw new Error(check.reason);
  }

  const attributes = [
    { Name: 'email', Value: email },
    { Name: 'email_verified', Value: 'true' },
    { Name: 'custom:hospitalId', Value: caller.hospitalId ?? '' },
    ...(unit !== undefined ? [{ Name: 'custom:unit', Value: unit }] : []),
  ];
  try {
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: poolId,
        Username: email,
        UserAttributes: attributes,
        DesiredDeliveryMediums: ['EMAIL'],
      }),
    );
  } catch (error) {
    // Never reveal whether an email already has an account (it may belong to another hospital).
    console.warn(`invite-staff create failed: ${error instanceof Error ? error.name : 'unknown'}`);
    throw new Error('invite-failed');
  }
  try {
    await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: poolId, Username: email, GroupName: group }));
  } catch (error) {
    // The new account has no group, so it has no rights; the admin is told it is incomplete.
    console.error(`invite-staff group failed: ${error instanceof Error ? error.name : 'unknown'}`);
    throw new Error('invite-incomplete');
  }

  console.info(`invite-staff ok: group=${group} unit=${unit ?? '-'}`);
  return 'invited';
};
