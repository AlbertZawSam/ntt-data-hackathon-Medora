import { defineFunction } from '@aws-amplify/backend';

/**
 * A new hospital admin registers their hospital once: creates the HospitalProfile, then sets
 * `custom:hospitalId` on the caller. 256 MB, 15 s, 7-day logs. No idle cost; a fraction of a
 * cent per registration. Its IAM permissions (Cognito actions on the public pool only) and its
 * data access are attached in backend.ts and data/resource.ts.
 */
export const registerHospital = defineFunction({
  name: 'register-hospital',
  resourceGroupName: 'data',
  memoryMB: 256,
  timeoutSeconds: 15,
  runtime: 20,
  logging: { retention: '1 week' },
});
