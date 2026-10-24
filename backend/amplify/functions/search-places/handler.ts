import { GeoPlacesClient, SearchTextCommand } from '@aws-sdk/client-geo-places';
import type { AppSyncIdentityCognito, AppSyncResolverEvent } from 'aws-lambda';
import { BANGKOK_BOX, MAX_FOUND_PLACES, cleanPlaceQuery, parsePlaceResults } from '@medora/shared/logic/placeSearch';
import { GROUPS } from '@medora/shared/logic/session';

interface Args {
  query?: string;
  lang?: string;
}

const places = new GeoPlacesClient({});

/**
 * Suggests places inside Bangkok for what the patient typed. The search area is the fixed Bangkok
 * rectangle, so no position is sent or needed. Failure is never an error for the patient: the built-in
 * list still works, so this returns no places. Logs hold only a status, never the typed text. Patients only:
 * AppSync enforces it, and the handler checks again, like find-care. The 500 ms pause and the three-character
 * minimum are in the app; the server limits only the text length and the number of results.
 */
export const handler = async (event: AppSyncResolverEvent<Args>): Promise<string> => {
  const identity = event.identity as AppSyncIdentityCognito | null | undefined;
  const groups = identity?.claims?.['cognito:groups'];
  if (!Array.isArray(groups) || !groups.includes(GROUPS.patients)) throw new Error('not-patient');
  const query = cleanPlaceQuery(event.arguments.query);
  if (!query) return JSON.stringify({ places: [] });
  try {
    const result = await places.send(
      new SearchTextCommand({
        QueryText: query,
        Filter: { BoundingBox: BANGKOK_BOX },
        Language: event.arguments.lang === 'th' ? 'th' : 'en',
        MaxResults: MAX_FOUND_PLACES,
      }),
    );
    const found = parsePlaceResults(result.ResultItems);
    console.info(`search-places ok: results=${found.length}`);
    return JSON.stringify({ places: found });
  } catch (error) {
    console.error(`search-places failed: ${error instanceof Error ? error.name : 'unknown'}`);
    return JSON.stringify({ places: [], unavailable: true });
  }
};
