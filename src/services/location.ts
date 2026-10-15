import * as Location from 'expo-location';

import { inBangkok, resolveLocation, searchPlaces, SIAM, type ResolvedLocation } from '@/logic/places';
import type { Lang } from '@/i18n/t';
import type { LatLng, Place } from '@/logic/types';

// Patient location (requirement 3). The position stays on the phone: nothing here
// sends it to our backend (3.6). Amazon Location receives only a search bias point.

export type GpsResult =
  | ({ kind: 'ok' } & ResolvedLocation)
  // Permission refused: the screen explains and offers place search (3.4).
  | { kind: 'denied'; canAskAgain: boolean }
  // Location services off, no fix in time, or any other failure (3.4).
  | { kind: 'unavailable' };

const GPS_TIMEOUT_MS = 10_000;
const LAST_KNOWN_MAX_AGE_MS = 2 * 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => (clearTimeout(id), resolve(value)),
      (error) => (clearTimeout(id), reject(error)),
    );
  });
}

// Asks for foreground permission, then reads the position (3.1). Outside the
// demo area it returns Siam with outside: true (3.5).
export async function getGpsLocation(): Promise<GpsResult> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return { kind: 'denied', canAskAgain: permission.canAskAgain };
    if (!(await Location.hasServicesEnabledAsync())) return { kind: 'unavailable' };

    // A fresh cached fix answers instantly; otherwise wait for a new one.
    const recent = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
    const fix =
      recent ??
      (await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), GPS_TIMEOUT_MS));
    return { kind: 'ok', ...resolveLocation({ lat: fix.coords.latitude, lng: fix.coords.longitude }) };
  } catch {
    return { kind: 'unavailable' };
  }
}

// Amazon Location Places (v2) with an API key restricted to search. Without a key,
// search uses the built-in places only. Creating the key is a separate, approved step.
const LOCATION_API_KEY = process.env.EXPO_PUBLIC_LOCATION_API_KEY;
const LOCATION_REGION = process.env.EXPO_PUBLIC_LOCATION_REGION ?? 'ap-southeast-1';
const SEARCH_TIMEOUT_MS = 5_000;

type SearchTextResponse = {
  ResultItems?: { PlaceId: string; Title: string; Position?: [number, number] }[];
};

async function searchAmazonLocation(query: string, near: LatLng, lang: Lang, limit: number): Promise<Place[]> {
  if (!LOCATION_API_KEY) return [];
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://places.geo.${LOCATION_REGION}.amazonaws.com/v2/search-text?key=${encodeURIComponent(LOCATION_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          QueryText: query,
          BiasPosition: [near.lng, near.lat],
          Filter: { IncludeCountries: ['THA'] },
          Language: lang,
          MaxResults: limit,
        }),
        signal: controller.signal,
      },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as SearchTextResponse;
    return (body.ResultItems ?? [])
      .filter((item) => item.Position)
      .map((item) => ({
        id: `aws:${item.PlaceId}`,
        // Amazon Location answers in one language; show that title to both.
        name: { en: item.Title, th: item.Title },
        lng: item.Position![0],
        lat: item.Position![1],
      }))
      .filter(inBangkok);
  } catch {
    return []; // offline or slow: the built-in results still show
  } finally {
    clearTimeout(id);
  }
}

// Built-in places first (they work offline), then Amazon Location results (3.2).
export async function searchLocation(query: string, lang: Lang, near: LatLng = SIAM, limit = 6): Promise<Place[]> {
  const local = searchPlaces(query, undefined, limit);
  if (local.length >= limit || !query.trim()) return local;
  const remote = await searchAmazonLocation(query, near, lang, limit - local.length);
  return [...local, ...remote];
}
