/**
 * What the real map draws, as plain data (requirements 3.3, 5.4, 8.4, 13.2, 13.4): which markers show, how big they
 * are, which are crossed out, and the route line as GeoJSON (longitude first). Pure, so it is tested; the screen
 * only turns it into map elements.
 */
import type { LatLng } from './ranking';

export const MARKER_KINDS = ['me', 'ok', 'limited', 'no', 'asked', 'accepted', 'declined', 'chosen', 'vehicle', 'place'] as const;
export type MarkerKind = (typeof MARKER_KINDS)[number];

export interface MarkerLike {
  id: string;
  point: LatLng;
  kind: MarkerKind;
  label?: string;
}

/** Diameter in pixels: the person and the chosen hospital stand out, the rest are smaller. */
export function markerSize(kind: MarkerKind): number {
  return kind === 'me' || kind === 'chosen' ? 20 : kind === 'place' ? 8 : 16;
}

/** Hospitals that cannot help, and ones that declined, are crossed out. */
export function isCrossedOut(kind: MarkerKind): boolean {
  return kind === 'no' || kind === 'declined';
}

/**
 * The real map already shows real places, so the built-in place dots that the offline map needs for picking are
 * left out of it, and markers without a usable position are dropped.
 */
export function visibleMarkers<T extends MarkerLike>(markers: readonly T[]): T[] {
  return markers.filter((m) => m.kind !== 'place' && Number.isFinite(m.point.lat) && Number.isFinite(m.point.lng));
}

export interface RouteGeoJson {
  type: 'FeatureCollection';
  features: Array<{ type: 'Feature'; properties: Record<string, never>; geometry: { type: 'LineString'; coordinates: Array<[number, number]> } }>;
}

/** The line from the first point to the second, or an empty collection when there is no route. GeoJSON is [lng, lat]. */
export function routeGeoJson(route: readonly [LatLng, LatLng] | undefined): RouteGeoJson {
  const valid = route && route.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  return {
    type: 'FeatureCollection',
    features: valid ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.map((p): [number, number] => [p.lng, p.lat]) } }] : [],
  };
}
