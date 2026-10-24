import { defineFunction } from '@aws-amplify/backend';

/**
 * Hands the signed-in app the address of the Amazon Location map style, which includes the map API key.
 * CloudFormation cannot output a key's value, so this reads it (`DescribeKey`, on that one key). The key
 * is built to be used in the browser: it can only fetch map tiles. 256 MB, 10 s, 7-day logs. No idle cost.
 */
export const mapConfig = defineFunction({
  name: 'map-config',
  resourceGroupName: 'data',
  memoryMB: 256,
  timeoutSeconds: 10,
  runtime: 20,
  logging: { retention: '1 week' },
});
