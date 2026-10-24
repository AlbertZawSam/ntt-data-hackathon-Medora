import { DescribeKeyCommand, LocationClient } from '@aws-sdk/client-location';
import type { AppSyncIdentityCognito, AppSyncResolverEvent } from 'aws-lambda';
import { mapStyleUrl } from '@medora/shared/logic/mapStyle';
import { GROUPS } from '@medora/shared/logic/session';

const location = new LocationClient({});
const ROLES: readonly string[] = [GROUPS.patients, GROUPS.staff, GROUPS.doctors, GROUPS.admins];

/** The key never changes while the stack stands, so a warm Lambda keeps it instead of asking again. */
let cached: string | null = null;

/**
 * For any signed-in role (the patient app and the hospital app both draw maps). Returns the style URL as JSON,
 * or `null` when the map is not available: the app then draws its simple offline map. Logs only a status.
 */
export const handler = async (event: AppSyncResolverEvent<Record<string, never>>): Promise<string> => {
  const identity = event.identity as AppSyncIdentityCognito | null | undefined;
  const groups = identity?.claims?.['cognito:groups'];
  if (!Array.isArray(groups) || !groups.some((group) => ROLES.includes(String(group)))) throw new Error('not-signed-in');
  const keyName = process.env.MAP_KEY_NAME;
  if (!keyName) return JSON.stringify({ styleUrl: null });
  try {
    cached ??= (await location.send(new DescribeKeyCommand({ KeyName: keyName }))).Key ?? null;
    if (!cached) return JSON.stringify({ styleUrl: null });
    return JSON.stringify({ styleUrl: mapStyleUrl(cached, process.env.AWS_REGION ?? 'us-east-1') });
  } catch (error) {
    console.error(`map-config failed: ${error instanceof Error ? error.name : 'unknown'}`);
    return JSON.stringify({ styleUrl: null });
  }
};
