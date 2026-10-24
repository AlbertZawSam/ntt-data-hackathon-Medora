import type { Fix } from '@medora/shared/logic/livePosition';
import { DEFAULT_LOCATION, PositionError, createLocator, type ChosenLocation, type PositionSource } from '../src/services/locationController';

const NOW = 1_800_000_000_000;
const fix = (over: Partial<Fix> = {}): Fix => ({ lat: 13.7455, lng: 100.534, accuracyM: 20, timestampMs: NOW - 1_000, ...over });

/** A phone that does what the test says, and counts what is left running. */
function setup(over: Partial<PositionSource> = {}) {
  let location: ChosenLocation = DEFAULT_LOCATION;
  const writes: ChosenLocation[] = [];
  const store = { get: () => location, set: (next: ChosenLocation) => { location = next; writes.push(next); } };
  let onFix: (f: Fix) => void = () => undefined;
  let onError: (e: PositionError) => void = () => undefined;
  const counts = { requested: 0, read: 0, watchesStarted: 0, watchesStopped: 0 };
  const source: PositionSource = {
    secure: () => true,
    request: async () => {
      counts.requested += 1;
      return 'granted';
    },
    current: async () => {
      counts.read += 1;
      return fix();
    },
    watch: (fixCallback, errorCallback) => {
      counts.watchesStarted += 1;
      onFix = fixCallback;
      onError = errorCallback;
      let live = true;
      return () => {
        if (live) counts.watchesStopped += 1;
        live = false;
      };
    },
    ...over,
  };
  const locator = createLocator(source, store, () => NOW);
  return { locator, store, writes, counts, emit: (f: Fix) => onFix(f), fail: (e: PositionError) => onError(e), running: () => counts.watchesStarted - counts.watchesStopped, location: () => location };
}

describe('locateMe outcomes', () => {
  it('says so, without asking for anything, when the page cannot share a position (plain http)', async () => {
    const t = setup({ secure: () => false });
    expect(await t.locator.locateMe()).toBe('insecure');
    expect(t.counts.requested + t.counts.read).toBe(0);
  });

  it.each([
    ['a refused permission', { request: async () => 'denied' as const }, 'denied'],
    ['a refusal while reading', { current: async () => { throw new PositionError('denied'); } }, 'denied'],
    ['a timeout', { current: async () => { throw new PositionError('timeout'); } }, 'timeout'],
    ['no position available', { current: async () => { throw new PositionError('unavailable'); } }, 'unavailable'],
    ['an unexpected error', { current: async () => { throw new Error('boom'); } }, 'unavailable'],
  ])('reports %s', async (_label, over, expected) => {
    const t = setup(over as Partial<PositionSource>);
    expect(await t.locator.locateMe()).toBe(expected);
    expect(t.location()).toBe(DEFAULT_LOCATION);
    expect(t.running()).toBe(0);
  });

  it('does not trust an old or imprecise reading, such as one worked out from an IP address', async () => {
    for (const bad of [fix({ timestampMs: NOW - 10 * 60_000 }), fix({ accuracyM: 25_000 }), fix({ lat: Number.NaN })]) {
      const t = setup({ current: async () => bad });
      expect(await t.locator.locateMe()).toBe('unavailable');
      expect(t.location()).toBe(DEFAULT_LOCATION);
    }
  });

  it('falls back to Siam, and does not follow, when the person is outside Bangkok', async () => {
    const t = setup({ current: async () => fix({ lat: 18.79, lng: 98.99 }) });
    expect(await t.locator.locateMe()).toBe('outsideBangkok');
    expect(t.location()).toBe(DEFAULT_LOCATION);
    expect(t.running()).toBe(0);
  });

  it('uses the fresh reading, records its accuracy and time, and starts following', async () => {
    const t = setup();
    expect(await t.locator.locateMe()).toBe('ok');
    expect(t.location()).toMatchObject({ source: 'gps', lat: 13.7455, lng: 100.534, accuracyM: 20, updatedAtMs: NOW - 1_000 });
    expect(t.running()).toBe(1);
  });
});

describe('following the device', () => {
  it('moves the location when the person really moves, and ignores jitter', async () => {
    const t = setup();
    await t.locator.locateMe();
    const before = t.writes.length;
    t.emit(fix({ lat: 13.7455 + 0.00003 })); // about 3 m: jitter
    expect(t.writes.length).toBe(before);
    t.emit(fix({ lat: 13.7455 + 0.0003, timestampMs: NOW - 500 })); // about 33 m
    expect(t.writes.length).toBe(before + 1);
    expect(t.location().lat).toBeCloseTo(13.7458, 4);
  });

  it('never lets a bad reading replace a good location: old, imprecise or outside Bangkok', async () => {
    const t = setup();
    await t.locator.locateMe();
    const good = t.location();
    t.emit(fix({ lat: 13.76, timestampMs: NOW - 10 * 60_000 }));
    t.emit(fix({ lat: 13.77, accuracyM: 20_000 }));
    t.emit(fix({ lat: 18.79, lng: 98.99 }));
    expect(t.location()).toBe(good);
  });

  it('keeps the last location, and stops reading, when the device stops reporting', async () => {
    const t = setup();
    await t.locator.locateMe();
    const last = t.location();
    t.fail(new PositionError('unavailable'));
    expect(t.running()).toBe(0);
    expect(t.location()).toBe(last);
  });

  it('stops following when the person picks another place, and ignores readings that arrive afterwards', async () => {
    const t = setup();
    await t.locator.locateMe();
    t.locator.stopFollowing();
    expect(t.running()).toBe(0);
    const writes = t.writes.length;
    t.emit(fix({ lat: 13.8 }));
    expect(t.writes.length).toBe(writes);
  });

  it('never has two watches running, however often "Use my location" is tapped', async () => {
    const t = setup();
    await t.locator.locateMe();
    await t.locator.locateMe();
    await t.locator.locateMe();
    expect(t.running()).toBe(1);
  });

  it('stops reading the device in the background, resumes when back, and does not resume after the person chose a place', async () => {
    const t = setup();
    await t.locator.locateMe();
    t.locator.pause();
    expect(t.running()).toBe(0);
    t.locator.resume();
    expect(t.running()).toBe(1);
    t.locator.pause();
    t.locator.stopFollowing();
    t.locator.resume();
    expect(t.running()).toBe(0);
  });

  it('leaves no watch behind when a later request is refused', async () => {
    let allow = true;
    const t = setup({ request: async () => (allow ? 'granted' : 'denied') });
    await t.locator.locateMe();
    allow = false;
    expect(await t.locator.locateMe()).toBe('denied');
    expect(t.running()).toBe(0);
  });
});

describe('a reading that is still on its way when things change', () => {
  /** A `current()` the test finishes by hand, to be late on purpose. */
  function slowRead() {
    let finish: (f: Fix) => void = () => undefined;
    let reject: (e: Error) => void = () => undefined;
    const read = new Promise<Fix>((resolve, rej) => {
      finish = resolve;
      reject = rej;
    });
    return { current: () => read, finish: (f: Fix = fix()) => finish(f), reject: (e: Error) => reject(e) };
  }

  it('does not overwrite a place the person picked meanwhile, and does not start following', async () => {
    const slow = slowRead();
    const t = setup({ current: slow.current });
    const pending = t.locator.locateMe();
    await Promise.resolve(); // the read has started
    t.locator.stopFollowing(); // the person picks a place, or taps the map
    slow.finish();
    expect(await pending).toBe('superseded');
    expect(t.writes).toEqual([]);
    expect(t.running()).toBe(0);
  });

  it('drops a late failure too, instead of showing an error about a request that no longer matters', async () => {
    const slow = slowRead();
    const t = setup({ current: slow.current });
    const pending = t.locator.locateMe();
    await Promise.resolve();
    t.locator.stopFollowing();
    slow.reject(new PositionError('timeout'));
    expect(await pending).toBe('superseded');
  });

  it('lets only the newest tap win when "Use my location" is tapped twice', async () => {
    const first = slowRead();
    let calls = 0;
    const second = slowRead();
    const t = setup({ current: () => (++calls === 1 ? first.current() : second.current()) });
    const one = t.locator.locateMe();
    await Promise.resolve();
    const two = t.locator.locateMe();
    await Promise.resolve();
    first.finish(fix({ lat: 13.7 }));
    second.finish(fix({ lat: 13.8 }));
    expect(await one).toBe('superseded');
    expect(await two).toBe('ok');
    expect(t.location().lat).toBe(13.8);
    expect(t.running()).toBe(1);
  });

  it('does not start reading the device in the background if the app went there during the read', async () => {
    const slow = slowRead();
    const t = setup({ current: slow.current });
    const pending = t.locator.locateMe();
    await Promise.resolve();
    t.locator.pause(); // the app goes to the background
    slow.finish();
    expect(await pending).toBe('ok'); // the reading itself is still good
    expect(t.running()).toBe(0); // but nothing is being watched
    t.locator.resume();
    expect(t.running()).toBe(1); // and following carries on when the app returns
  });
});

describe('when the device stops reporting', () => {
  it('stops for good after a refused permission, instead of retrying every time the app returns', async () => {
    const t = setup();
    await t.locator.locateMe();
    t.fail(new PositionError('denied'));
    expect(t.running()).toBe(0);
    t.locator.resume();
    expect(t.running()).toBe(0);
  });

  it('tries again when the app returns after a passing error', async () => {
    const t = setup();
    await t.locator.locateMe();
    t.fail(new PositionError('unavailable'));
    expect(t.running()).toBe(0);
    t.locator.resume();
    expect(t.running()).toBe(1);
  });
});
