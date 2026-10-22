import { defineFunction } from '@aws-amplify/backend';

/**
 * Specialists and clinic slots: admins save and delete their own hospital's specialists; patients
 * search (nearest first, then soonest slot) and book a slot instantly. Patients never read the
 * Specialist table; they get a public view from here. 256 MB, 15 s, 7-day logs; no idle cost.
 */
export const specialistActions = defineFunction({
  name: 'specialist-actions',
  resourceGroupName: 'data',
  memoryMB: 256,
  timeoutSeconds: 15,
  runtime: 20,
  logging: { retention: '1 week' },
});
