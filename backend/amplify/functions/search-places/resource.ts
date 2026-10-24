import { defineFunction } from '@aws-amplify/backend';

/**
 * Place search for the location picker (requirement 3.2): Amazon Location text search inside a fixed
 * Bangkok rectangle. Only the typed text reaches it. 256 MB, 10 s, 7-day logs. No idle cost; Amazon Location
 * bills per search request (check its pricing page), and the app only searches after three typed characters.
 */
export const searchPlaces = defineFunction({
  name: 'search-places',
  resourceGroupName: 'data',
  memoryMB: 256,
  timeoutSeconds: 10,
  runtime: 20,
  logging: { retention: '1 week' },
});
