const send = jest.fn();
jest.mock('@aws-sdk/client-location', () => ({
  LocationClient: jest.fn(() => ({ send })),
  DescribeKeyCommand: jest.fn((input: unknown) => ({ input })),
}));

const as = (groups: string[] | undefined) => ({ identity: { claims: { 'cognito:groups': groups } }, arguments: {} });
type Handler = (event: never) => Promise<string>;
// A fresh copy of the handler per test: it keeps the key in memory for a warm Lambda, and that must not leak between tests.
let handler: Handler;
const call = (groups: string[] | undefined) => handler(as(groups) as never).then((text) => JSON.parse(text) as { styleUrl: string | null });

beforeEach(() => {
  jest.resetModules();
  handler = (require('../amplify/functions/map-config/handler') as { handler: Handler }).handler;
  process.env.MAP_KEY_NAME = 'medora-maps-test';
  process.env.AWS_REGION = 'us-east-1';
  send.mockReset();
  for (const level of ['info', 'warn', 'error'] as const) jest.spyOn(console, level).mockImplementation(() => undefined);
});

describe('mapConfig', () => {
  it('returns the Amazon Location style address with the key, for every signed-in role', async () => {
    send.mockResolvedValue({ Key: 'v1.public.abc123' });
    for (const group of ['patients', 'hospital_staff', 'doctors', 'admins']) {
      const { styleUrl } = await call([group]);
      expect(styleUrl).toBe('https://maps.geo.us-east-1.amazonaws.com/v2/styles/Standard/descriptor?key=v1.public.abc123&color-scheme=Light&variant=Default');
    }
  });

  it('asks only for the one configured key', async () => {
    send.mockResolvedValue({ Key: 'k' });
    await call(['patients']);
    expect((send.mock.calls[0][0] as { input: { KeyName: string } }).input).toEqual({ KeyName: 'medora-maps-test' });
  });

  it('reads the key once and keeps it for later calls on the same warm Lambda', async () => {
    send.mockResolvedValue({ Key: 'k' });
    await call(['patients']);
    await call(['doctors']);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('refuses callers with no role and does not touch the key', async () => {
    for (const groups of [undefined, [], ['visitors']]) await expect(call(groups as string[] | undefined)).rejects.toThrow('not-signed-in');
    await expect(handler({ arguments: {} } as never)).rejects.toThrow('not-signed-in');
    expect(send).not.toHaveBeenCalled();
  });

  it('returns no map, not an error, when the key cannot be read or is not configured, and logs no key', async () => {
    send.mockRejectedValue(Object.assign(new Error('boom v1.public.secret'), { name: 'AccessDeniedException' }));
    expect(await call(['patients'])).toEqual({ styleUrl: null });
    const logged = [console.info, console.warn, console.error].flatMap((fn) => (fn as jest.Mock).mock.calls.flat()).join(' ');
    expect(logged).toContain('AccessDeniedException');
    expect(logged).not.toContain('secret');
    delete process.env.MAP_KEY_NAME;
    expect(await call(['patients'])).toEqual({ styleUrl: null });
  });
});
