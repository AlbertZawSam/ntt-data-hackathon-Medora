/**
 * The two ways of reading the device: the browser and Expo. The rules are tested with a fake source elsewhere; these check
 * what is actually asked of the browser (a fresh, high-accuracy reading) and how its errors are read.
 */
jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));

import * as ExpoLocation from 'expo-location';
import { PositionError } from '../src/services/locationController';
import { nativeSource, webSource } from '../src/services/positionSources';

type GeoSuccess = (p: { coords: { latitude: number; longitude: number; accuracy: number }; timestamp: number }) => void;
type GeoFailure = (e: { code: number }) => void;

const g = globalThis as unknown as { navigator?: unknown; window?: unknown };
const original = { navigator: g.navigator, window: g.window };
afterEach(() => {
  g.navigator = original.navigator;
  g.window = original.window;
  jest.clearAllMocks();
});

function browser(secure = true, permission?: 'granted' | 'denied' | 'prompt') {
  const geolocation = {
    getCurrentPosition: jest.fn<void, [GeoSuccess, GeoFailure, Record<string, unknown>]>(),
    watchPosition: jest.fn<number, [GeoSuccess, GeoFailure, Record<string, unknown>]>(() => 42),
    clearWatch: jest.fn<void, [number]>(),
  };
  g.window = { isSecureContext: secure };
  g.navigator = { geolocation, ...(permission ? { permissions: { query: async () => ({ state: permission }) } } : {}) };
  return geolocation;
}

describe('webSource', () => {
  it('is available only on a secure page (https or localhost)', () => {
    browser(true);
    expect(webSource.secure()).toBe(true);
    browser(false);
    expect(webSource.secure()).toBe(false);
  });

  it('spots an earlier refusal without waiting, and otherwise leaves the prompt to the first reading', async () => {
    browser(true, 'denied');
    expect(await webSource.request()).toBe('denied');
    browser(true, 'prompt');
    expect(await webSource.request()).toBe('granted');
    browser(true); // a browser that cannot be asked in advance
    expect(await webSource.request()).toBe('granted');
  });

  it('reports a browser with no geolocation at all as unavailable', async () => {
    g.navigator = {};
    await expect(webSource.request()).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('asks for a fresh, high-accuracy reading, never a cached one', async () => {
    const geo = browser();
    geo.getCurrentPosition.mockImplementation((ok: GeoSuccess) => ok({ coords: { latitude: 13.7455, longitude: 100.534, accuracy: 18 }, timestamp: 1234 }));
    expect(await webSource.current()).toEqual({ lat: 13.7455, lng: 100.534, accuracyM: 18, timestampMs: 1234 });
    expect(geo.getCurrentPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
  });

  it.each([
    [1, 'denied'],
    [2, 'unavailable'],
    [3, 'timeout'],
  ])('reads browser error code %i as %s', async (code, expected) => {
    const geo = browser();
    geo.getCurrentPosition.mockImplementation((_ok: GeoSuccess, fail: GeoFailure) => fail({ code }));
    const error = await webSource.current().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PositionError);
    expect((error as PositionError).code).toBe(expected);
  });

  it('follows with high accuracy and clears the watch when stopped', () => {
    const geo = browser();
    const stop = webSource.watch(() => undefined, () => undefined);
    expect(geo.watchPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true });
    stop();
    expect(geo.clearWatch).toHaveBeenCalledWith(42);
  });
});

describe('nativeSource', () => {
  it('asks for foreground permission only', async () => {
    (ExpoLocation.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    expect(await nativeSource.request()).toBe('granted');
    (ExpoLocation.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    expect(await nativeSource.request()).toBe('denied');
  });

  it('reports location services that are switched off as unavailable, before reading', async () => {
    (ExpoLocation.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);
    await expect(nativeSource.current()).rejects.toMatchObject({ code: 'unavailable' });
    expect(ExpoLocation.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('reads with high accuracy', async () => {
    (ExpoLocation.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);
    (ExpoLocation.getCurrentPositionAsync as jest.Mock).mockResolvedValue({ coords: { latitude: 13.7, longitude: 100.5, accuracy: 9 }, timestamp: 99 });
    expect(await nativeSource.current()).toEqual({ lat: 13.7, lng: 100.5, accuracyM: 9, timestampMs: 99 });
    expect(ExpoLocation.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: 4 });
  });

  it('removes the watch even when it is stopped before the phone has finished starting it', async () => {
    const remove = jest.fn();
    let created: (s: { remove(): void }) => void = () => undefined;
    (ExpoLocation.watchPositionAsync as jest.Mock).mockReturnValue(new Promise((resolve) => (created = resolve)));
    const stop = nativeSource.watch(() => undefined, () => undefined);
    stop(); // stopped before the subscription exists
    created({ remove });
    await Promise.resolve();
    await Promise.resolve();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('removes a running watch when stopped', async () => {
    const remove = jest.fn();
    (ExpoLocation.watchPositionAsync as jest.Mock).mockResolvedValue({ remove });
    const stop = nativeSource.watch(() => undefined, () => undefined);
    await Promise.resolve();
    await Promise.resolve();
    stop();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
