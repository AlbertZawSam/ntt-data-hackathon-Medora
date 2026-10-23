/**
 * Where the patient is: GPS with permission handling, or a place picked from the built-in
 * Bangkok list. A fix outside Bangkok falls back to the default district.
 * Requirements: 3.1 to 3.6
 */
import * as ExpoLocation from 'expo-location';
import React from 'react';
import { DEFAULT_PLACE, isInBangkok, type LatLng, type Place } from '@medora/shared/logic/places';

export type LocationSource = 'gps' | 'place' | 'map' | 'default';

export interface ChosenLocation extends LatLng {
  source: LocationSource;
  /** Set when the location came from a built-in place, or is the default district. */
  place?: Place;
}

export type GpsOutcome = 'ok' | 'outsideBangkok' | 'denied' | 'unavailable';

const DEFAULT_LOCATION: ChosenLocation = { lat: DEFAULT_PLACE.lat, lng: DEFAULT_PLACE.lng, source: 'default', place: DEFAULT_PLACE };

let current: ChosenLocation = DEFAULT_LOCATION;
const listeners = new Set<() => void>();

function set(next: ChosenLocation): void {
  current = next;
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

export function choosePlace(place: Place): void {
  set({ lat: place.lat, lng: place.lng, source: 'place', place });
}

/** Asks for permission and reads one position. The coordinates are never logged or stored. */
export async function locateMe(): Promise<GpsOutcome> {
  try {
    const permission = await ExpoLocation.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return 'denied';
    const position = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced });
    const point = { lat: position.coords.latitude, lng: position.coords.longitude };
    if (!isInBangkok(point)) {
      set(DEFAULT_LOCATION);
      return 'outsideBangkok';
    }
    set({ ...point, source: 'gps' });
    return 'ok';
  } catch {
    return 'unavailable';
  }
}

/** Sets the location from a tap on the map. A point outside Bangkok is refused. */
export function choosePoint(point: LatLng): boolean {
  if (!isInBangkok(point)) return false;
  set({ ...point, source: 'map' });
  return true;
}
