/**
 * Map geometry for the simple SVG map: turn latitude and longitude into x and y inside a box and back
 * (to pick a point by tapping), and the simulated position along a route. Pure TypeScript, no map
 * tiles and no network. Requirements: 3.3, 5.4, 8.4, 13.2, 13.4
 */
import type { LatLng } from './ranking';

export interface Box {
  width: number;
  height: number;
  padding: number;
}

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** A box around the points, never smaller than about 2 km so one point doesn't zoom in absurdly. */
export function boundsOf(points: readonly LatLng[], minSpan = 0.02): Bounds {
  if (points.length === 0) return { minLat: 13.65, maxLat: 13.85, minLng: 100.45, maxLng: 100.65 };
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const grow = (min: number, max: number): [number, number] => {
    const span = Math.max(max - min, minSpan);
    const mid = (min + max) / 2;
    return [mid - span / 2, mid + span / 2];
  };
  const [minLat, maxLat] = grow(Math.min(...lats), Math.max(...lats));
  const [minLng, maxLng] = grow(Math.min(...lngs), Math.max(...lngs));
  return { minLat, maxLat, minLng, maxLng };
}

export interface Point {
  x: number;
  y: number;
}

/** North is up. The scale is the same on both axes, so distances look right. */
function scaleFor(bounds: Bounds, box: Box): { k: number; offX: number; offY: number } {
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const lngSpan = (bounds.maxLng - bounds.minLng) * Math.cos((midLat * Math.PI) / 180);
  const latSpan = bounds.maxLat - bounds.minLat;
  const innerW = box.width - box.padding * 2;
  const innerH = box.height - box.padding * 2;
  const k = Math.min(innerW / lngSpan, innerH / latSpan);
  return { k, offX: box.padding + (innerW - lngSpan * k) / 2, offY: box.padding + (innerH - latSpan * k) / 2 };
}

export function project(point: LatLng, bounds: Bounds, box: Box): Point {
  const { k, offX, offY } = scaleFor(bounds, box);
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const cos = Math.cos((midLat * Math.PI) / 180);
  return { x: offX + (point.lng - bounds.minLng) * cos * k, y: offY + (bounds.maxLat - point.lat) * k };
}

/** The point under a tap; the inverse of `project`. */
export function unproject(p: Point, bounds: Bounds, box: Box): LatLng {
  const { k, offX, offY } = scaleFor(bounds, box);
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const cos = Math.cos((midLat * Math.PI) / 180);
  return { lng: bounds.minLng + (p.x - offX) / (cos * k), lat: bounds.maxLat - (p.y - offY) / k };
}

/**
 * Where the simulated ambulance is, from its start, its end and how far through the trip it is
 * (0 to 1). In the demo this follows the clock; a real position feed would replace it.
 */
export function along(from: LatLng, to: LatLng, progress: number): LatLng {
  const t = Math.min(1, Math.max(0, progress));
  return { lat: from.lat + (to.lat - from.lat) * t, lng: from.lng + (to.lng - from.lng) * t };
}

/** Minutes left on a simulated transfer started at `startedAtMs` with `etaMin` in total. */
export function minutesLeft(startedAtMs: number, etaMin: number, nowMs: number): number {
  return Math.max(0, Math.ceil(etaMin - (nowMs - startedAtMs) / 60_000));
}

export function tripProgress(startedAtMs: number, etaMin: number, nowMs: number): number {
  if (etaMin <= 0) return 1;
  return Math.min(1, Math.max(0, (nowMs - startedAtMs) / (etaMin * 60_000)));
}
