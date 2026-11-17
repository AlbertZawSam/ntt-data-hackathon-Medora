/**
 * Built-in Bangkok places for the location picker: search by name in English or Thai, and a
 * bounds check so a GPS fix outside Bangkok falls back to the default district.
 * Requirements: 3.1 to 3.6
 */
import data from '../data/places.json';
import { haversineKm as distanceKm, type LatLng } from './ranking';
import type { Bi } from './types';

export interface Place {
  key: string;
  name: Bi;
  lat: number;
  lng: number;
}

// One copy of the coordinate type and the straight-line distance formula, owned by ranking.ts.
export { distanceKm, type LatLng };

export const PLACES: Place[] = data.places;

export const DEFAULT_PLACE: Place = PLACES.find((p) => p.key === data.defaultKey) ?? PLACES[0];

const { bounds } = data;

export function isInBangkok(point: LatLng): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= bounds.minLat &&
    point.lat <= bounds.maxLat &&
    point.lng >= bounds.minLng &&
    point.lng <= bounds.maxLng
  );
}

function fold(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Places whose English or Thai name contains the query. Names that start with the query come
 * first. An empty query returns no places, so the list stays hidden until the user types.
 */
export function searchPlaces(query: string, places: Place[] = PLACES): Place[] {
  const q = fold(query);
  if (!q) return [];
  const rank = (place: Place): number | null => {
    const names = [fold(place.name.en), fold(place.name.th)];
    if (names.some((n) => n.startsWith(q))) return 0;
    if (names.some((n) => n.includes(q))) return 1;
    return null;
  };
  return places
    .map((place) => ({ place, score: rank(place) }))
    .filter((r): r is { place: Place; score: number } => r.score !== null)
    .sort((a, b) => a.score - b.score)
    .map((r) => r.place);
}


export function nearestPlace(point: LatLng, places: Place[] = PLACES): Place {
  return places.reduce((best, place) => (distanceKm(point, place) < distanceKm(point, best) ? place : best), places[0]);
}
