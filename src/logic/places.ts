import { places as builtInPlaces } from './data';
import { normalize } from './redFlags';
import type { LatLng, Place } from './types';

// Patient location rules (requirement 3). Pure, so they work offline and in tests;
// src/services/location.ts adds GPS and Amazon Location on top.

// The demo area: Bangkok and its inner suburbs, both airports included.
export const BANGKOK_BOUNDS = { south: 13.49, north: 13.96, west: 100.32, east: 100.94 };

// Used when the real position is outside the demo area (requirement 3.5).
export const SIAM: LatLng = { lat: 13.7466, lng: 100.5347 };

export function inBangkok({ lat, lng }: LatLng): boolean {
  const b = BANGKOK_BOUNDS;
  return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}

// The point the app uses. outside tells the screen to say Siam was used instead.
export type ResolvedLocation = { point: LatLng; outside: boolean };

export function resolveLocation(point: LatLng): ResolvedLocation {
  return inBangkok(point) ? { point, outside: false } : { point: SIAM, outside: true };
}

// Lower is better: whole name, then the start of a name or word, then anywhere inside.
// Thai is written without spaces between words, so "anywhere inside" is what finds it.
function rank(query: string, place: Place): number | null {
  let best: number | null = null;
  for (const raw of [place.name.en, place.name.th, ...(place.aliases ?? [])]) {
    const name = normalize(raw);
    const r = name === query ? 0
      : name.startsWith(query) ? 1
      : name.includes(` ${query}`) || name.includes(`(${query}`) ? 2
      : name.includes(query) ? 3
      : null;
    if (r !== null && (best === null || r < best)) best = r;
  }
  return best;
}

// Built-in places matching an English or Thai query, best match first (requirement 3.2).
export function searchPlaces(query: string, list: Place[] = builtInPlaces, limit = 5): Place[] {
  const q = normalize(query);
  if (!q) return [];
  return list
    .map((place, i) => ({ place, i, r: rank(q, place) }))
    .filter((x): x is { place: Place; i: number; r: number } => x.r !== null)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.place);
}
