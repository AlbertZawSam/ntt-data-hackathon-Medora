/**
 * Where the patient is, from the device: one fresh reading when they tap "Use my location", then following them while the
 * app is open (requirements 3.1, 3.4, 3.5). All the rules live here and talk to the phone or browser through a
 * `PositionSource`, so they can be tested without a device. The position stays on the device and is never logged
 * (requirement 3.6).
 */
import { distanceKm, DEFAULT_PLACE, isInBangkok, type LatLng, type Place } from '@medora/shared/logic/places';
import { shouldFollow, usableFix, type Fix } from '@medora/shared/logic/livePosition';

export type LocationSource = 'gps' | 'place' | 'map' | 'default';

export interface ChosenLocation extends LatLng {
  source: LocationSource;
  /** Set when the location came from a built-in place, or is the default district. */
  place?: Place;
  /** How close the device says the reading is, in metres (GPS only). */
  accuracyM?: number;
  /** When the device took the reading (GPS only). */
  updatedAtMs?: number;
}

/** `superseded`: the person chose another place (or the screen moved on) while the position was being read, so the reading was dropped. */
export type GpsOutcome = 'ok' | 'outsideBangkok' | 'denied' | 'unavailable' | 'timeout' | 'insecure' | 'superseded';

export class PositionError extends Error {
  constructor(readonly code: 'denied' | 'unavailable' | 'timeout') {
    super(code);
    this.name = 'PositionError';
  }
}

export interface PositionSource {
  /** False when the page cannot share a position at all (the web, over plain http). */
  secure(): boolean;
  request(): Promise<'granted' | 'denied'>;
  /** A fresh, high-accuracy reading; rejects with a PositionError. */
  current(): Promise<Fix>;
  /** Calls `onFix` as the device moves. Returns a function that stops it. */
  watch(onFix: (fix: Fix) => void, onError: (error: PositionError) => void): () => void;
}

export interface LocationStore {
  get(): ChosenLocation;
  set(next: ChosenLocation): void;
}

export const DEFAULT_LOCATION: ChosenLocation = { lat: DEFAULT_PLACE.lat, lng: DEFAULT_PLACE.lng, source: 'default', place: DEFAULT_PLACE };

export function createLocator(source: PositionSource, store: LocationStore, now: () => number = Date.now) {
  let stopWatch: (() => void) | null = null;
  // Wanted, even while paused in the background.
  let following = false;
  // True while the app is in the background: nothing may start reading the device then.
  let paused = false;
  let last: Fix | undefined;
  // Counts requests. Anything that ends the request (picking another place, a new tap) bumps it, so a reading that
  // arrives late is dropped instead of overwriting the person's choice.
  let request = 0;

  const halt = (): void => {
    stopWatch?.();
    stopWatch = null;
  };

  function onFix(fix: Fix): void {
    if (!following) return;
    // A reading that is old, imprecise or outside Bangkok never replaces a good location.
    if (usableFix(fix, now()) !== 'ok' || !isInBangkok(fix) || !shouldFollow(last, fix)) return;
    last = fix;
    store.set({ lat: fix.lat, lng: fix.lng, source: 'gps', ...(fix.accuracyM !== undefined ? { accuracyM: fix.accuracyM } : {}), updatedAtMs: fix.timestampMs });
  }

  function startWatch(): void {
    if (stopWatch || !following || paused) return;
    // If the device stops reporting, keep the last location instead of failing the screen. A refused permission ends
    // following for good (retrying on every return to the app would only fail again); other errors may pass.
    stopWatch = source.watch(onFix, (error) => (error.code === 'denied' ? stopFollowing() : halt()));
  }

  /** The person chose another place, or left: stop following, and drop any reading still on its way. */
  function stopFollowing(): void {
    request += 1;
    following = false;
    last = undefined;
    halt();
  }

  async function locateMe(): Promise<GpsOutcome> {
    stopFollowing(); // a new request replaces any watch, so there is never more than one
    const mine = request;
    if (!source.secure()) return 'insecure';
    try {
      if ((await source.request()) !== 'granted') return mine === request ? 'denied' : 'superseded';
      const fix = await source.current();
      if (mine !== request) return 'superseded';
      if (usableFix(fix, now()) !== 'ok') return 'unavailable';
      if (!isInBangkok(fix)) {
        store.set(DEFAULT_LOCATION);
        return 'outsideBangkok';
      }
      last = fix;
      store.set({ lat: fix.lat, lng: fix.lng, source: 'gps', ...(fix.accuracyM !== undefined ? { accuracyM: fix.accuracyM } : {}), updatedAtMs: fix.timestampMs });
      following = true;
      startWatch();
      return 'ok';
    } catch (error) {
      if (mine !== request) return 'superseded';
      if (error instanceof PositionError) return error.code === 'denied' ? 'denied' : error.code === 'timeout' ? 'timeout' : 'unavailable';
      return 'unavailable';
    }
  }

  return {
    locateMe,
    stopFollowing,
    /** The app went to the background: stop reading the device, but remember we were following. */
    pause: () => {
      paused = true;
      halt();
    },
    resume: () => {
      paused = false;
      startWatch();
    },
  };
}

export { distanceKm };
