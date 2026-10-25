import { CalculateRoutesCommand, GeoRoutesClient } from '@aws-sdk/client-geo-routes';
import type { AppSyncIdentityCognito, AppSyncResolverEvent } from 'aws-lambda';
import { pathFromLineString } from '@medora/shared/logic/routePath';
import { GROUPS } from '@medora/shared/logic/session';

interface Args {
  fromLat?: number;
  fromLng?: number;
  toLat?: number;
  toLng?: number;
}

const routes = new GeoRoutesClient({});
const SIGNED_IN = [GROUPS.patients, GROUPS.staff, GROUPS.doctors, GROUPS.admins];
/** Medora works inside greater Bangkok; anything else is refused, which also keeps the request cheap. */
const AREA = { minLat: 13.3, maxLat: 14.2, minLng: 100.2, maxLng: 100.95 };

const inside = (lat: unknown, lng: unknown): lat is number =>
  typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && lat >= AREA.minLat && lat <= AREA.maxLat && lng >= AREA.minLng && lng <= AREA.maxLng;

/**
 * The drivable path from one point to another, as points for the map line. Any signed-in role may ask (the patient's
 * results, the doctor's referral and transfers). Failure is never an error for the person: an empty path makes the
 * app draw its straight line instead. Logs hold only a status, never a position.
 */
export const handler = async (event: AppSyncResolverEvent<Args>): Promise<string> => {
  const identity = event.identity as AppSyncIdentityCognito | null | undefined;
  const groups = identity?.claims?.['cognito:groups'];
  if (!Array.isArray(groups) || !groups.some((g) => SIGNED_IN.includes(g))) throw new Error('not-signed-in');
  const { fromLat, fromLng, toLat, toLng } = event.arguments;
  if (!inside(fromLat, fromLng) || !inside(toLat, toLng)) return JSON.stringify({ path: [] });
  // Positions are rounded to about 11 m here, so what is asked of the service never holds a precise position; the same
  // two points are not routed at all.
  const [oLat, oLng, dLat, dLng] = [fromLat, fromLng as number, toLat as number, toLng as number].map((n) => Math.round(n * 1e4) / 1e4);
  if (oLat === dLat && oLng === dLng) return JSON.stringify({ path: [] });
  try {
    const result = await routes.send(
      new CalculateRoutesCommand({
        Origin: [oLng, oLat],
        Destination: [dLng, dLat],
        TravelMode: 'Car',
        LegGeometryFormat: 'Simple',
      }),
    );
    const path = (result.Routes?.[0]?.Legs ?? []).flatMap((leg) => pathFromLineString(leg.Geometry?.LineString));
    console.info(`route-path ok: points=${path.length}`);
    return JSON.stringify({ path });
  } catch (error) {
    console.error(`route-path failed: ${error instanceof Error ? error.name : 'unknown'}`);
    return JSON.stringify({ path: [] });
  }
};
