import { defineFunction } from '@aws-amplify/backend';

/**
 * Doctor referrals: create a referral, and confirm or set aside the agent's recommendation. Clients
 * can't write referrals or transfers directly, so only the owning doctor of the right hospital can
 * decide, and only to a hospital that accepted. 256 MB, 15 s, 7-day logs; no idle cost.
 */
export const referralActions = defineFunction({
  name: 'referral-actions',
  resourceGroupName: 'data',
  memoryMB: 256,
  timeoutSeconds: 15,
  runtime: 20,
  logging: { retention: '1 week' },
});
