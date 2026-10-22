import { defineFunction } from '@aws-amplify/backend';

/**
 * Find care for a person: layer 2 of the emergency check (fixed red-flag rules, before any model call),
 * the patient intake agent (Nova Lite via MODEL_ID_FAST, keyword fallback), then the fixed ranking
 * engine. Returns only simple availability labels. 256 MB, 20 s, 7-day logs. No idle cost; the model
 * is billed per request (Nova Lite, a fraction of a cent).
 */
export const findCare = defineFunction({
  name: 'find-care',
  resourceGroupName: 'data',
  memoryMB: 256,
  timeoutSeconds: 20,
  runtime: 20,
  logging: { retention: '1 week' },
});
