/**
 * The two ways to read the device's position: the browser (web) and Expo's location module (phone). Nothing here decides
 * anything; the rules are in locationController.ts. Readings are never logged.
 */
import * as ExpoLocation from 'expo-location';
import type { Fix } from '@medora/shared/logic/livePosition';
import { PositionError, type PositionSource } from './locationController';

const READ_TIMEOUT_MS = 15_000;

function webFix(position: GeolocationPosition): Fix {
  const { latitude, longitude, accuracy } = position.coords;
  return { lat: latitude, lng: longitude, ...(Number.isFinite(accuracy) ? { accuracyM: accuracy } : {}), timestampMs: position.timestamp };
}

function webError(error: GeolocationPositionError): PositionError {
  return new PositionError(error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable');
}

/**
 * The browser's own geolocation. Expo's web wrapper asks for a cached reading of any age and only high accuracy when
 * told to go beyond "balanced", so it can hand back an old position; asking the browser directly for a fresh one avoids that.
 * Browsers share a position only on https pages and on localhost.
 */
export const webSource: PositionSource = {
  secure: () => typeof window !== 'undefined' && window.isSecureContext !== false,
  request: async () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) throw new PositionError('unavailable');
    // The browser asks the person on the first reading; this only spots a refusal made earlier, to avoid waiting for nothing.
    try {
      if ((await navigator.permissions?.query({ name: 'geolocation' }))?.state === 'denied') return 'denied';
    } catch {
      // Some browsers cannot be asked in advance.
    }
    return 'granted';
  },
  current: () =>
    new Promise<Fix>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition((position) => resolve(webFix(position)), (error) => reject(webError(error)), {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: READ_TIMEOUT_MS,
      });
    }),
  watch: (onFix, onError) => {
    const id = navigator.geolocation.watchPosition((position) => onFix(webFix(position)), (error) => onError(webError(error)), {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 20_000,
    });
    return () => navigator.geolocation.clearWatch(id);
  },
};

function nativeFix(position: ExpoLocation.LocationObject): Fix {
  const { latitude, longitude, accuracy } = position.coords;
  return { lat: latitude, lng: longitude, ...(typeof accuracy === 'number' ? { accuracyM: accuracy } : {}), timestampMs: position.timestamp };
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new PositionError('timeout')), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/** The phone: Expo's location module, foreground only, high accuracy. */
export const nativeSource: PositionSource = {
  secure: () => true,
  request: async () => ((await ExpoLocation.requestForegroundPermissionsAsync()).status === 'granted' ? 'granted' : 'denied'),
  current: async () => {
    if (!(await ExpoLocation.hasServicesEnabledAsync())) throw new PositionError('unavailable');
    return nativeFix(await withTimeout(ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.High }), READ_TIMEOUT_MS));
  },
  watch: (onFix, onError) => {
    let stopped = false;
    let subscription: { remove(): void } | undefined;
    ExpoLocation.watchPositionAsync({ accuracy: ExpoLocation.Accuracy.High, distanceInterval: 10, timeInterval: 5_000 }, (position) => onFix(nativeFix(position)))
      .then((created) => {
        if (stopped) created.remove();
        else subscription = created;
      })
      .catch(() => onError(new PositionError('unavailable')));
    return () => {
      stopped = true;
      subscription?.remove();
    };
  },
};
