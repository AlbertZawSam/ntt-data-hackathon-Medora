const send = jest.fn();
jest.mock('@aws-sdk/client-geo-routes', () => ({
  GeoRoutesClient: jest.fn(() => ({ send })),
  CalculateRoutesCommand: jest.fn((input: unknown) => ({ input })),
}));

type Handler = (event: never) => Promise<string>;
const event = (groups: string[] | undefined, args: Record<string, unknown>) => ({ identity: { claims: { 'cognito:groups': groups } }, arguments: args }) as never;
const bangkok = { fromLat: 13.75, fromLng: 100.5, toLat: 13.8, toLng: 100.55 };
let handler: Handler;

beforeEach(() => {
  jest.resetModules();
  handler = (require('../amplify/functions/route-path/handler') as { handler: Handler }).handler;
  send.mockReset();
  for (const level of ['info', 'warn', 'error'] as const) jest.spyOn(console, level).mockImplementation(() => undefined);
});

describe('routePath', () => {
  it('returns the road path for every signed-in role', async () => {
    send.mockResolvedValue({ Routes: [{ Legs: [{ Geometry: { LineString: [[100.5, 13.75], [100.52, 13.77], [100.55, 13.8]] } }] }] });
    for (const group of ['patients', 'hospital_staff', 'doctors', 'admins']) {
      const { path } = JSON.parse(await handler(event([group], bangkok))) as { path: { lat: number; lng: number }[] };
      expect(path).toHaveLength(3);
      expect(path[0]).toEqual({ lat: 13.75, lng: 100.5 });
    }
  });

  it('asks for a car route with simple geometry', async () => {
    send.mockResolvedValue({ Routes: [] });
    await handler(event(['patients'], bangkok));
    expect((send.mock.calls[0][0] as { input: Record<string, unknown> }).input).toMatchObject({ TravelMode: 'Car', LegGeometryFormat: 'Simple', Origin: [100.5, 13.75], Destination: [100.55, 13.8] });
  });

  it('refuses callers who are not signed in to a role', async () => {
    await expect(handler(event(undefined, bangkok))).rejects.toThrow('not-signed-in');
    await expect(handler(event(['strangers'], bangkok))).rejects.toThrow('not-signed-in');
    expect(send).not.toHaveBeenCalled();
  });

  it('gives no path, without calling the service, for points outside Bangkok', async () => {
    const out = JSON.parse(await handler(event(['patients'], { ...bangkok, toLat: 18.8, toLng: 98.9 }))) as { path: unknown[] };
    expect(out.path).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it('does not route between the same two points or non-finite numbers', async () => {
    for (const args of [{ ...bangkok, toLat: 13.75, toLng: 100.5 }, { ...bangkok, toLat: Infinity }]) {
      expect(JSON.parse(await handler(event(['patients'], args)))).toEqual({ path: [] });
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('gives an empty path, not an error, when the service fails', async () => {
    send.mockRejectedValue(Object.assign(new Error('boom'), { name: 'ThrottlingException' }));
    expect(JSON.parse(await handler(event(['doctors'], bangkok)))).toEqual({ path: [] });
  });
});
