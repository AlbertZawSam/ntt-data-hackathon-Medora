import { defineFunction } from '@aws-amplify/backend';

/**
 * Safety gate layer 2 and patient understanding for Find care: fixed red-flag rules first, then one
 * short Nova Lite call (about 300 output tokens at most), then keyword rules if the model is unavailable.
 * 256 MB, 15 s, 7-day logs. No idle cost; a fraction of a cent per search. Its Bedrock and guardrail
 * permissions (named ARNs only) and model settings are attached in backend.ts.
 */
export const patientUnderstand = defineFunction({
  name: 'patient-understand',
  resourceGroupName: 'data',
  memoryMB: 256,
  timeoutSeconds: 15,
  runtime: 20,
  logging: { retention: '1 week' },
});
