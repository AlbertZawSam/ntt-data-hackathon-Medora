import { MAX_ACCURACY_M, MAX_FIX_AGE_MS, MIN_MOVE_M, movedMeters, shouldFollow, usableFix, type Fix } from '../logic/livePosition';

const NOW = 1_000_000_000_000;
const fix = (over: Partial<Fix> = {}): Fix => ({ lat: 13.7455, lng: 100.534, accuracyM: 20, timestampMs: NOW - 1_000, ...over });

describe('usableFix', () => {
  it('accepts a recent, precise reading', () => {
    expect(usableFix(fix(), NOW)).toBe('ok');
    expect(usableFix(fix({ accuracyM: undefined }), NOW)).toBe('ok'); // some devices give no accuracy
  });
  it('refuses a stale reading, however precise', () => {
    expect(usableFix(fix({ timestampMs: NOW - MAX_FIX_AGE_MS - 1 }), NOW)).toBe('stale');
    expect(usableFix(fix({ timestampMs: NOW - MAX_FIX_AGE_MS }), NOW)).toBe('ok');
  });
  it('refuses a coarse reading, such as one worked out from an IP address', () => {
    expect(usableFix(fix({ accuracyM: MAX_ACCURACY_M + 1 }), NOW)).toBe('coarse');
    expect(usableFix(fix({ accuracyM: MAX_ACCURACY_M }), NOW)).toBe('ok');
  });
  it('refuses readings that are not real positions', () => {
    for (const bad of [{ lat: Number.NaN }, { lng: Number.POSITIVE_INFINITY }, { lat: 91 }, { lng: -181 }, { timestampMs: Number.NaN }]) {
      expect(usableFix(fix(bad), NOW)).toBe('invalid');
    }
  });
});

describe('shouldFollow', () => {
  it('always takes the first reading', () => {
    expect(shouldFollow(undefined, fix())).toBe(true);
  });
  it('ignores jitter smaller than the minimum move, and follows real movement', () => {
    const here = fix();
    const jitter = fix({ lat: here.lat + 0.00003 }); // about 3 m
    const walked = fix({ lat: here.lat + 0.0002 }); // about 22 m
    expect(movedMeters(here, jitter)).toBeLessThan(MIN_MOVE_M);
    expect(shouldFollow(here, jitter)).toBe(false);
    expect(movedMeters(here, walked)).toBeGreaterThanOrEqual(MIN_MOVE_M);
    expect(shouldFollow(here, walked)).toBe(true);
  });
  it('takes a much better reading of the same place, so the accuracy shown improves, but not a slightly better one', () => {
    expect(shouldFollow(fix({ accuracyM: 400 }), fix({ accuracyM: 30 }))).toBe(true);
    expect(shouldFollow(fix({ accuracyM: 40 }), fix({ accuracyM: 30 }))).toBe(false);
    expect(shouldFollow(fix({ accuracyM: 40 }), fix({ accuracyM: undefined }))).toBe(false);
  });
});
