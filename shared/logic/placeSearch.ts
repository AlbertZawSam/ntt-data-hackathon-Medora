/**
 * Place search beyond the built-in list (requirement 3.2): the Lambda asks Amazon Location for places
 * inside Bangkok and the app shows the results. Pure TypeScript, used by both. Only the typed text is
 * ever sent; the patient's position never leaves the phone (requirement 3.6), because the search area is
 * a fixed Bangkok rectangle rather than a point near the patient.
 */
import data from '../data/places.json';
import { isInBangkok } from './places';

export interface FoundPlace {
  id: string;
  name: string;
  /** A fuller address line when it adds something to the name. */
  detail?: string;
  lat: number;
  lng: number;
}

const { bounds } = data;

/** The fixed search area in the order Amazon Location expects: [west, south, east, north] (longitude, latitude). */
export const BANGKOK_BOX: [number, number, number, number] = [bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat];

export const PLACE_QUERY_MIN = 3;
export const PLACE_QUERY_MAX = 80;
export const MAX_FOUND_PLACES = 5;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The trimmed text to search for, or null when it is missing, too short, too long or has no letters or digits. */
export function cleanPlaceQuery(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  // Needs a letter or digit in any language: punctuation alone is not a place name and would be a wasted, billed search.
  return text.length >= PLACE_QUERY_MIN && text.length <= PLACE_QUERY_MAX && /[\p{L}\p{N}]/u.test(text) ? text : null;
}

/** Turns Amazon Location `ResultItems` into short, validated places inside Bangkok. Anything odd is skipped. */
export function parsePlaceResults(items: unknown, max = MAX_FOUND_PLACES): FoundPlace[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: FoundPlace[] = [];
  for (const item of items) {
    if (!isRecord(item) || typeof item.Title !== 'string' || !item.Title.trim()) continue;
    const position = item.Position;
    if (!Array.isArray(position) || typeof position[0] !== 'number' || typeof position[1] !== 'number') continue;
    const point = { lat: position[1], lng: position[0] };
    if (!isInBangkok(point)) continue;
    const name = item.Title.trim().slice(0, 120);
    const label = isRecord(item.Address) && typeof item.Address.Label === 'string' ? item.Address.Label.trim().slice(0, 200) : '';
    const id = typeof item.PlaceId === 'string' && item.PlaceId ? item.PlaceId.slice(0, 200) : `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name, ...(label && label !== name ? { detail: label } : {}), ...point });
    if (out.length >= max) break;
  }
  return out;
}

/** Validates what the server returned, because the app never trusts it blindly. */
export function parseFoundPlaces(value: unknown, max = MAX_FOUND_PLACES): FoundPlace[] {
  const list = isRecord(value) && Array.isArray(value.places) ? value.places : [];
  const out: FoundPlace[] = [];
  for (const place of list) {
    if (!isRecord(place) || typeof place.id !== 'string' || typeof place.name !== 'string' || !place.name.trim()) continue;
    const point = { lat: Number(place.lat), lng: Number(place.lng) };
    if (!isInBangkok(point)) continue;
    out.push({ id: place.id, name: place.name.slice(0, 120), ...(typeof place.detail === 'string' && place.detail ? { detail: place.detail.slice(0, 200) } : {}), ...point });
    if (out.length >= max) break;
  }
  return out;
}
