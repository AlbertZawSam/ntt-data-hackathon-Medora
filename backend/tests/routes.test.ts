import { MAX_ROUTE_DESTINATIONS, ROUTE_TIMEOUT_MS, routeMinutes } from '../amplify/lib/routes';

const origin = { lat: 13.7, lng: 100.5 };
const hospitals = [
  { id: 'H1', lat: 13.75, lng: 100.53 },
  { id: 'H2', lat: 13.8, lng: 100.6 },
  { id: 'H3', lat: 13.9, lng: 100.7 },
];
const sent = (send: jest.Mock) => (send.mock.calls[0][0] as { input: Record<string, unknown> }).input;

describe('routeMinutes', () => {
  it('asks for car drive times from the origin to every destination, positions as [lng, lat], and returns minutes', async () => {
    const send = jest.fn().mockResolvedValue({ RouteMatrix: [[{ Duration: 600 }, { Duration: 1_500 }, { Duration: 90 }]] });
    expect(await routeMinutes(send, origin, hospitals)).toEqual({ H1: 10, H2: 25, H3: 1.5 });
    expect(sent(send)).toMatchObject({
      Origins: [{ Position: [100.5, 13.7] }],
      Destinations: [{ Position: [100.53, 13.75] }, { Position: [100.6, 13.8] }, { Position: [100.7, 13.9] }],
      TravelMode: 'Car',
      DepartNow: true,
      RoutingBoundary: { Unbounded: true },
    });
  });

  it('abandons a slow call after a short time, so the estimate is used instead of the Lambda timing out', async () => {
    const send = jest.fn().mockResolvedValue({ RouteMatrix: [[{ Duration: 60 }]] });
    await routeMinutes(send, origin, hospitals);
    const options = send.mock.calls[0][1] as { abortSignal: AbortSignal };
    expect(options.abortSignal).toBeInstanceOf(AbortSignal);
    expect(ROUTE_TIMEOUT_MS).toBeLessThanOrEqual(5_000);
    // A call that never answers is cut off by the signal and gives no times.
    const hanging = jest.fn((_command: unknown, o: { abortSignal: AbortSignal }) => new Promise((_resolve, reject) => o.abortSignal.addEventListener('abort', () => reject(new Error('aborted')))));
    jest.useFakeTimers();
    try {
      const pending = routeMinutes(hanging as never, origin, hospitals);
      await jest.advanceTimersByTimeAsync(ROUTE_TIMEOUT_MS + 100);
      expect(await pending).toEqual({});
    } finally {
      jest.useRealTimers();
    }
  });

  it('leaves out destinations that could not be routed, and bad or missing numbers', async () => {
    const send = jest.fn().mockResolvedValue({ RouteMatrix: [[{ Duration: 600 }, { Error: 'NoRoute', Duration: 5 }, { Duration: -1 }]] });
    expect(await routeMinutes(send, origin, hospitals)).toEqual({ H1: 10 });
    for (const row of [undefined, [], [[{}]], [[{ Duration: Number.NaN }]]]) {
      expect(await routeMinutes(jest.fn().mockResolvedValue({ RouteMatrix: row }), origin, hospitals)).toEqual({});
    }
  });

  it('returns nothing, so ranking uses its offline estimate, when the call fails or there is nowhere to go', async () => {
    expect(await routeMinutes(jest.fn().mockRejectedValue(new Error('AccessDenied')), origin, hospitals)).toEqual({});
    const idle = jest.fn();
    expect(await routeMinutes(idle, origin, [])).toEqual({});
    expect(idle).not.toHaveBeenCalled();
  });

  it('asks about at most a fixed number of destinations in one call', async () => {
    const many = Array.from({ length: MAX_ROUTE_DESTINATIONS + 10 }, (_, i) => ({ id: `H${i}`, lat: 13.7, lng: 100.5 }));
    const send = jest.fn().mockResolvedValue({ RouteMatrix: [many.map(() => ({ Duration: 60 }))] });
    const result = await routeMinutes(send, origin, many);
    expect((sent(send).Destinations as unknown[]).length).toBe(MAX_ROUTE_DESTINATIONS);
    expect(Object.keys(result)).toHaveLength(MAX_ROUTE_DESTINATIONS);
  });
});
