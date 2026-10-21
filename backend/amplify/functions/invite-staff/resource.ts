import { defineFunction } from '@aws-amplify/backend';

/**
 * Hospital admins invite staff, doctors and other admins into the staff pool.
 * 256 MB, 15 s, 7-day logs. No idle cost; a fraction of a cent per invitation.
 * Its IAM permissions (Cognito admin actions on the staff pool only) are attached in backend.ts.
 */
export const inviteStaff = defineFunction({
  name: 'invite-staff',
  resourceGroupName: 'data',
  memoryMB: 256,
  timeoutSeconds: 15,
  runtime: 20,
  logging: { retention: '1 week' },
});
