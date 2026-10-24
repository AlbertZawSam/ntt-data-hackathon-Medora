/**
 * Real drive times, for the referral agent and for a patient's search: Amazon Location Routes (v2)
 * `CalculateRouteMatrix`, one row from the starting point to each hospital that could help. It needs no resource of its own, only IAM on the default
 * data provider (backend.ts), and is billed per origin and destination pair (a handful per referral). Any
 * failure returns no times, and ranking then uses its documented offline estimate.
 */
import { CalculateRouteMatrixCommand } from '@aws-sdk/client-geo-routes';

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface RouteDestination extends RoutePoint {
  id: string;
}

type RouteSend = (
  command: CalculateRouteMatrixCommand,
  options?: { abortSignal?: AbortSignal },
) => Promise<{ RouteMatrix?: Array<Array<{ Duration?: number; Error?: string }>> }>;

/**
 * The longest a drive-time call may take. A slow answer must never use up the Lambda's time: after this the call is
 * abandoned and ranking uses the offline estimate.
 */
export const ROUTE_TIMEOUT_MS = 3_000;

/** A point rounded to about 100 m, for sending a person's position to Routes: drive times don't need more. */
export function coarsePoint(point: RoutePoint): RoutePoint {
  const round = (value: number): number => Math.round(value * 1_000) / 1_000;
  return { lat: round(point.lat), lng: round(point.lng) };
}

/** Largest matrix row asked for in one call; any hospital beyond it simply gets the offline estimate. */
export const MAX_ROUTE_DESTINATIONS = 50;

/** Minutes by car to each destination, by id. Destinations that could not be routed are left out. */
export async function routeMinutes(send: RouteSend, origin: RoutePoint, destinations: readonly RouteDestination[]): Promise<Record<string, number>> {
  const asked = destinations.slice(0, MAX_ROUTE_DESTINATIONS);
  if (asked.length === 0) return {};
  try {
    const response = await send(
      new CalculateRouteMatrixCommand({
        // Positions are [longitude, latitude].
        Origins: [{ Position: [origin.lng, origin.lat] }],
        Destinations: asked.map((hospital) => ({ Position: [hospital.lng, hospital.lat] })),
        RoutingBoundary: { Unbounded: true },
        TravelMode: 'Car',
        DepartNow: true,
      }),
      { abortSignal: AbortSignal.timeout(ROUTE_TIMEOUT_MS) },
    );
    const row = response.RouteMatrix?.[0] ?? [];
    return Object.fromEntries(
      asked.flatMap((hospital, index) => {
        const entry = row[index];
        const seconds = entry && !entry.Error ? entry.Duration : undefined;
        return typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0 ? [[hospital.id, seconds / 60] as const] : [];
      }),
    );
  } catch {
    return {};
  }
}
