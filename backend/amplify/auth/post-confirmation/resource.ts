import { defineFunction } from '@aws-amplify/backend';

/** Adds a newly verified user to the group for the role they chose. 256 MB, 10 s; runs once per sign-up. */
export const postConfirmation = defineFunction({
  name: 'post-confirmation',
  resourceGroupName: 'auth',
  memoryMB: 256,
  timeoutSeconds: 10,
  runtime: 20,
  logging: { retention: '1 week' },
});
