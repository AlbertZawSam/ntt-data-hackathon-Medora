/**
 * Where the patient is: the device's live position (read fresh, then followed while the app is open), or a place picked from
 * the built-in list, the map or a search. A fix outside Bangkok falls back to the default district. The rules are in
 * locationController.ts; this wires them to the screen store and to the app going to the background. A place picked
 * by hand or on the map is remembered for this browser tab (tabMemory), so a reload keeps it; a live position never is.
 * Requirements: 3.1 to 3.6
 */
import React from 'react';
import { AppState, Platform } from 'react-native';
import { isInBangkok, type LatLng, type Place } from '@medora/shared/logic/places';
import type { FoundPlace } from '@medora/shared/logic/placeSearch';
import { DEFAULT_LOCATION, createLocator, type ChosenLocation, type GpsOutcome, type LocationSource } from './locationController';
import { nativeSource, webSource } from './positionSources';
import { forget, recall, remember } from './tabMemory';

export type { ChosenLocation, GpsOutcome, LocationSource };

/** A place or map point the patient chose earlier in this tab, if it is still inside Bangkok. */
function remembered(): ChosenLocation | undefined {
  const saved = recall<ChosenLocation>('location');
  return saved && (saved.source === 'place' || saved.source === 'map') && isInBangkok(saved) ? saved : undefined;
}

let current: ChosenLocation = remembered() ?? DEFAULT_LOCATION;
const listeners = new Set<() => void>();

function set(next: ChosenLocation): void {
  current = next;
  if (next.source === 'place' || next.source === 'map') remember('location', next);
  else if (next.source === 'gps') forget('location'); // a live position is never stored
  for (const listener of listeners) listener();
}

export const locationStore = {
  get: (): ChosenLocation => current,
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** The chosen location, re-rendering when it changes. */
export function useChosenLocation(): ChosenLocation {
  return React.useSyncExternalStore(locationStore.subscribe, locationStore.get, locationStore.get);
}

const locator = createLocator(Platform.OS === 'web' ? webSource : nativeSource, { get: () => current, set });

// Reading the device drains the battery: stop while the app is in the background and carry on when it returns.
if (Platform.OS === 'web') {
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => (document.visibilityState === 'visible' ? locator.resume() : locator.pause()));
  }
} else {
  AppState.addEventListener('change', (state) => (state === 'active' ? locator.resume() : locator.pause()));
}

/** Choosing a place by hand ends any following of the device. */
export function choosePlace(place: Place): void {
  locator.stopFollowing();
  set({ lat: place.lat, lng: place.lng, source: 'place', place });
}

/** Uses a place found by Amazon Location search. It stays on the device; the name is shown in both languages as found. */
export function chooseFoundPlace(found: FoundPlace): boolean {
  if (!isInBangkok(found)) return false;
  choosePlace({ key: `found:${found.id}`, name: { en: found.name, th: found.name }, lat: found.lat, lng: found.lng });
  return true;
}

/**
 * Asks for permission, takes a fresh high-accuracy reading, and then follows the device while the app is open. The
 * coordinates are never logged or stored.
 */
export function locateMe(): Promise<GpsOutcome> {
  return locator.locateMe();
}

/** Sets the location from a tap on the map. A point outside Bangkok is refused. */
export function choosePoint(point: LatLng): boolean {
  if (!isInBangkok(point)) return false;
  locator.stopFollowing();
  set({ ...point, source: 'map' });
  return true;
}
