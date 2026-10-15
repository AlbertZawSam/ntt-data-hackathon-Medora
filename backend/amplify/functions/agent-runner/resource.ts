import { defineFunction } from '@aws-amplify/backend';

/**
 * Referral coordinator. It is invoked asynchronously after a doctor creates a Referral.
 *
 * Lambda has no idle charge. At runtime it uses Bedrock and (when configured) Amazon
 * Location and Bedrock Knowledge Bases, each of which is charged only for requests/tokens.
 */
export const agentRunner = defineFunction({
  name: 'agent-runner',
  resourceGroupName: 'data',
  memoryMB: 512,
  // 300 seconds leaves time for two bounded hospital-reply rounds; handler logic itself stops
  // model work after 120 seconds and falls back to fixed rules.
  timeoutSeconds: 300,
  runtime: 20,
  logging: { retention: '1 week' },
});
