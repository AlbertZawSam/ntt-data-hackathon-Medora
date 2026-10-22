import { defineFunction } from '@aws-amplify/backend';

/**
 * Hospital settings that only admins change. Today: the auto-accept rules. Checks the staff-pool
 * token, the `admins` group and the caller's own hospital before writing. 256 MB, 15 s, 7-day logs;
 * no idle cost.
 */
export const adminSettings = defineFunction({
  name: 'admin-settings',
  resourceGroupName: 'data',
  memoryMB: 256,
  timeoutSeconds: 15,
  runtime: 20,
  logging: { retention: '1 week' },
});
