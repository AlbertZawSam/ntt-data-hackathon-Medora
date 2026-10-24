/**
 * The road route drawn on the map: parsing and trimming what the route lookup returns. Pure and shared by the
 * Lambda (to build the answer) and the app (to trust nothing it receives). Positions are { lat, lng }.
 */
import type { LatLng } from './ranking';

/** Longest path the app draws; a longer one is thinned, keeping the first and last point. */
export const MAX_PATH_POINTS = 400;

/** Keep the key stable under small GPS movement (about 110 m), so a live position doesn't ask for a new route each fix. */
export const routeKey = (from: LatLng, to: LatLng): string =>
  [from.lat, from.lng, to.lat, to.lng].map((n) => n.toFixed(3)).join(',');

const valid = (p: unknown): p is LatLng =>
  typeof p === 'object' && p !== null && Number.isFinite((p as LatLng).lat) && Number.isFinite((p as LatLng).lng) && Math.abs((p as LatLng).lat) <= 90 && Math.abs((p as LatLng).lng) <= 180;

/** Thin a path to at most `max` points, always keeping the first and last. */
export function thinPath(path: readonly LatLng[], max = MAX_PATH_POINTS): LatLng[] {
  if (path.length <= max) return [...path];
  const out: LatLng[] = [];
  const step = (path.length - 1) / (max - 1);
  for (let i = 0; i < max; i += 1) out.push(path[Math.round(i * step)]);
  return out;
}

/** GeoJSON-style [lng, lat] pairs (what Amazon Location returns) to positions; bad pairs are dropped. */
export function pathFromLineString(line: unknown): LatLng[] {
  if (!Array.isArray(line)) return [];
  const points: LatLng[] = [];
  for (const pair of line) {
    if (Array.isArray(pair) && pair.length >= 2) {
      const p = { lat: Number(pair[1]), lng: Number(pair[0]) };
      if (valid(p)) points.push(p);
    }
  }
  return thinPath(points);
}

/** The lookup's answer as the app receives it: a path of at least two points, or an empty path. */
export function parseRoutePath(raw: unknown): LatLng[] {
  const list = typeof raw === 'object' && raw !== null ? (raw as { path?: unknown }).path : undefined;
  if (!Array.isArray(list)) return [];
  const points = list.filter(valid).map((p) => ({ lat: p.lat, lng: p.lng }));
  return points.length >= 2 ? thinPath(points) : [];
}

/** The path as a GeoJSON LineString collection for the map, or an empty collection. */
export function pathGeoJson(path: readonly LatLng[] | undefined): { type: 'FeatureCollection'; features: unknown[] } {
  return {
    type: 'FeatureCollection',
    features: path && path.length >= 2 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: path.map((p) => [p.lng, p.lat]) } }] : [],
  };
}
