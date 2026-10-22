import { defineFunction } from '@aws-amplify/backend';

/**
 * Patient requests and messages: create (with the admin's auto-accept rule), cancel, staff accept,
 * decline and undo, and message sending. One function behind four AppSync mutations, so clients
 * never write requests or messages directly and can't forge an acceptance or the other side's message.
 * 256 MB, 15 s, 7-day logs. No idle cost; a fraction of a cent per call.
 */
export const careActions = defineFunction({
  name: 'care-actions',
  resourceGroupName: 'data',
  memoryMB: 256,
  timeoutSeconds: 15,
  runtime: 20,
  logging: { retention: '1 week' },
});
