/**
 * Built-in Bangkok places for the location picker: search by name in English or Thai, and a
 * bounds check so a GPS fix outside Bangkok falls back to the default district.
 * Requirements: 3.1 to 3.6
 */
import data from '../data/places.json';
import type { Bi } from './types';

export interface Place {
  key: string;
  name: Bi;
  lat: number;
  lng: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

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

/** Straight-line distance in kilometres; enough for choosing the nearest built-in place. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function nearestPlace(point: LatLng, places: Place[] = PLACES): Place {
  return places.reduce((best, place) => (distanceKm(point, place) < distanceKm(point, best) ? place : best), places[0]);
}
