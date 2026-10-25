import { defineFunction } from '@aws-amplify/backend';

/**
 * The road route between two points for the map line (Amazon Location Routes, CalculateRoutes, by car). Only two
 * rounded positions reach it. 256 MB, 10 s, 7-day logs. No idle cost; Amazon Location bills per route request,
 * and the app asks once per pair of points it draws.
 */
export const routePath = defineFunction({
  name: 'route-path',
  resourceGroupName: 'data',
  memoryMB: 256,
  timeoutSeconds: 10,
  runtime: 20,
  logging: { retention: '1 week' },
});
