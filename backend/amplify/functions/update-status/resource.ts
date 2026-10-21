import { defineFunction } from '@aws-amplify/backend';

/**
 * Unit staff change the items their own unit owns (beds, equipment, departments, on-duty switches).
 * 256 MB, 15 s, 7-day logs. No idle cost; a fraction of a cent per update. The staff pool id is
 * attached as an environment variable in backend.ts; its data access comes from data/resource.ts.
 */
export const updateStatus = defineFunction({
  name: 'update-status',
  resourceGroupName: 'data',
  memoryMB: 256,
  timeoutSeconds: 15,
  runtime: 20,
  logging: { retention: '1 week' },
});
