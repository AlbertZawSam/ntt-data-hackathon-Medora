/**
 * Connects the app to the Amplify backend. Imported once, first, by frontend/app/_layout.tsx.
 * Needs amplify_outputs.json in the project root: run `npm run sandbox`.
 * Without it, metro.config.js bundles an empty stub and the app runs with sign-in disabled.
 *
 * There are two Cognito user pools: patients (and doctors or new admins who sign up) use the public
 * pool; invited hospital staff use the staff pool, which requires authenticator-app MFA. Amplify
 * talks to one pool at a time, so signing in to a pool re-points Amplify at it, and the choice is
 * remembered so the session survives a restart.
 */
import 'react-native-get-random-values';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Amplify } from 'aws-amplify';
import { fetchAuthSession } from 'aws-amplify/auth';
import type { PoolKind } from '@medora/shared/logic/signin';
import outputs from '../../amplify_outputs.json';

/** False when no sandbox has been deployed yet (amplify_outputs.json is missing). */
export const backendConfigured = 'auth' in outputs;

const POOL_STORAGE_KEY = 'medora.pool';

interface StaffAuthOutput {
  userPoolId: string;
  userPoolClientId: string;
  region: string;
}

const staffAuth = (outputs as { custom?: { staffAuth?: StaffAuthOutput } }).custom?.staffAuth;

/**
 * Amplify sends the access token to AppSync by default. The hospital rules and the Lambda checks need
 * the custom claims (`custom:hospitalId`, `custom:unit`), which only the ID token carries, so every
 * GraphQL request sends the ID token instead.
 */
const idTokenHeaders = async (): Promise<Record<string, string>> => {
  const { tokens } = await fetchAuthSession();
  const token = tokens?.idToken?.toString();
  return token ? { Authorization: token } : {};
};
const libraryOptions = { API: { GraphQL: { headers: idTokenHeaders } } };

/** True when the deployed backend includes the staff pool. */
export const staffPoolConfigured = backendConfigured && staffAuth !== undefined;

/** True when an ID token was issued by the staff pool (read from its issuer, not from local state). */
export function isStaffPoolToken(claims: Record<string, unknown>): boolean {
  return staffAuth !== undefined && typeof claims.iss === 'string' && claims.iss.endsWith(`/${staffAuth.userPoolId}`);
}

let currentPool: PoolKind = 'public';

export function activePool(): PoolKind {
  return currentPool;
}

/** Points Amplify at the given pool. The staff pool has no identity pool and uses TOTP only. */
export function configurePool(pool: PoolKind): void {
  if (!backendConfigured) return;
  const base = outputs as Record<string, unknown>;
  if (pool === 'staff' && staffAuth) {
    Amplify.configure({
      ...base,
      auth: {
        user_pool_id: staffAuth.userPoolId,
        user_pool_client_id: staffAuth.userPoolClientId,
        aws_region: staffAuth.region,
        username_attributes: ['email'],
        user_verification_types: ['email'],
        mfa_configuration: 'REQUIRED',
        mfa_methods: ['TOTP'],
      },
    } as Parameters<typeof Amplify.configure>[0], libraryOptions);
    currentPool = 'staff';
  } else {
    Amplify.configure(base as Parameters<typeof Amplify.configure>[0], libraryOptions);
    currentPool = 'public';
  }
}

/** Remembers which pool the user signed in to (or clears it on sign-out). */
export function rememberPool(pool: PoolKind): void {
  AsyncStorage.setItem(POOL_STORAGE_KEY, pool).catch(() => undefined);
}

/** Re-points Amplify at the pool used last time; call before reading the session at startup. */
export async function restorePool(): Promise<void> {
  const saved = await AsyncStorage.getItem(POOL_STORAGE_KEY).catch(() => null);
  if (saved !== 'staff') return;
  if (staffPoolConfigured) configurePool('staff');
  else rememberPool('public'); // the backend has no staff pool: forget the stale choice
}

if (backendConfigured) {
  configurePool('public');
} else {
  console.warn('[Medora] amplify_outputs.json not found. Run `npm run sandbox` and restart Expo.');
}
