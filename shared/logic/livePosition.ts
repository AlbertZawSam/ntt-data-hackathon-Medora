/**
 * Rules for using a live position from the phone or browser (requirements 3.1, 3.4, 3.5): is a fix fresh and precise
 * enough to rank hospitals by, and has the person moved enough to bother updating. Pure TypeScript; the position never
 * leaves the device because of anything in here (requirement 3.6).
 */
import { distanceKm, type LatLng } from './places';

export interface Fix extends LatLng {
  /** Accuracy radius in metres, when the device says. */
  accuracyM?: number;
  /** When the device took the reading, in milliseconds since 1970. */
  timestampMs: number;
}

/** A reading older than this is not "where you are now". */
export const MAX_FIX_AGE_MS = 120_000;
/** A fix less precise than this (for example one worked out from an IP address) would rank hospitals wrongly. */
export const MAX_ACCURACY_M = 5_000;
/** Smaller moves are GPS jitter: following them would redraw the map and the results for nothing. */
export const MIN_MOVE_M = 10;

export type FixQuality = 'ok' | 'invalid' | 'stale' | 'coarse';

export function usableFix(fix: Fix, nowMs: number): FixQuality {
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng) || !Number.isFinite(fix.timestampMs)) return 'invalid';
  if (Math.abs(fix.lat) > 90 || Math.abs(fix.lng) > 180) return 'invalid';
  if (nowMs - fix.timestampMs > MAX_FIX_AGE_MS) return 'stale';
  if (typeof fix.accuracyM === 'number' && fix.accuracyM > MAX_ACCURACY_M) return 'coarse';
  return 'ok';
}

export function movedMeters(a: LatLng, b: LatLng): number {
  return distanceKm(a, b) * 1000;
}

/** Follow only real movement, or a clearly better reading of the same place. */
export function shouldFollow(previous: Fix | undefined, next: Fix): boolean {
  if (!previous) return true;
  if (movedMeters(previous, next) >= MIN_MOVE_M) return true;
  const before = previous.accuracyM ?? Infinity;
  const after = next.accuracyM ?? Infinity;
  return Number.isFinite(after) && after < before / 2;
}
