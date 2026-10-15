import { BANGKOK_BOUNDS } from './places';
import type { LatLng } from './types';

// Screen maths for the offline Bangkok map (task 8.2). A flat projection is accurate
// enough across a city: longitude is scaled by cos(latitude) so distances look right.

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
// center is the point in the middle of the view; scale is pixels per degree of latitude.
export type Viewport = { center: LatLng; scale: number };

const K = Math.cos((13.75 * Math.PI) / 180);
// Closest zoom: about 1.5 km across a phone screen.
const MAX_SCALE = 30_000;

export function project(p: LatLng, v: Viewport, size: Size): Point {
  return {
    x: size.width / 2 + (p.lng - v.center.lng) * K * v.scale,
    y: size.height / 2 - (p.lat - v.center.lat) * v.scale,
  };
}

export function unproject(pt: Point, v: Viewport, size: Size): LatLng {
  return {
    lat: v.center.lat - (pt.y - size.height / 2) / v.scale,
    lng: v.center.lng + (pt.x - size.width / 2) / (K * v.scale),
  };
}

// Widest zoom: the whole demo area fits on screen.
export function minScale(size: Size): number {
  const b = BANGKOK_BOUNDS;
  return Math.min(size.width / ((b.east - b.west) * K), size.height / (b.north - b.south));
}

// Keeps the zoom within limits and the centre inside the demo area.
export function clampViewport(v: Viewport, size: Size): Viewport {
  const b = BANGKOK_BOUNDS;
  const scale = Math.min(MAX_SCALE, Math.max(minScale(size), v.scale));
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  return {
    scale,
    center: { lat: clamp(v.center.lat, b.south, b.north), lng: clamp(v.center.lng, b.west, b.east) },
  };
}

// A view that shows every point with padding (in pixels) around them.
export function fitPoints(points: LatLng[], size: Size, padding = 40): Viewport {
  if (points.length === 0) {
    const b = BANGKOK_BOUNDS;
    return clampViewport({ center: { lat: (b.north + b.south) / 2, lng: (b.east + b.west) / 2 }, scale: 0 }, size);
  }
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const [south, north, west, east] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const w = Math.max(1, size.width - 2 * padding);
  const h = Math.max(1, size.height - 2 * padding);
  const scale = Math.min(w / Math.max((east - west) * K, 1e-9), h / Math.max(north - south, 1e-9));
  return clampViewport({ center: { lat: (north + south) / 2, lng: (east + west) / 2 }, scale }, size);
}

// Zooms by factor while keeping the map point under focus (a pinch or the centre) still.
export function zoomAt(v: Viewport, factor: number, focus: Point, size: Size): Viewport {
  const anchor = unproject(focus, v, size);
  const scale = Math.min(MAX_SCALE, Math.max(minScale(size), v.scale * factor));
  const moved = project(anchor, { ...v, scale }, size);
  return panBy({ ...v, scale }, { x: focus.x - moved.x, y: focus.y - moved.y }, size);
}

// Moves the view so the map follows a finger dragged by (dx, dy) pixels.
export function panBy(v: Viewport, d: Point, size: Size): Viewport {
  return clampViewport(
    { scale: v.scale, center: { lat: v.center.lat + d.y / v.scale, lng: v.center.lng - d.x / (K * v.scale) } },
    size,
  );
}
