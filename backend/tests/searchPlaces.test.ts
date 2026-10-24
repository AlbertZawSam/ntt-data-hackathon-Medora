const send = jest.fn();
jest.mock('@aws-sdk/client-geo-places', () => ({
  GeoPlacesClient: jest.fn(() => ({ send })),
  SearchTextCommand: jest.fn((input: unknown) => ({ input })),
}));

import { handler } from '../amplify/functions/search-places/handler';

const asPatient = { claims: { 'cognito:groups': ['patients'] } };
const call = (args: Record<string, unknown>, identity: unknown = asPatient) => handler({ arguments: args, identity } as never).then((text) => JSON.parse(text) as { places: Array<{ name: string }>; unavailable?: boolean });
const item = (title: string, lng: number, lat: number) => ({ Title: title, PlaceId: title, Position: [lng, lat] });

beforeEach(() => {
  send.mockReset();
  for (const level of ['info', 'warn', 'error'] as const) jest.spyOn(console, level).mockImplementation(() => undefined);
});

describe('searchPlaces access', () => {
  it('is for patients only: doctors, staff, nurses and callers with no identity are refused before any search', async () => {
    for (const groups of [['doctors'], ['admins'], ['hospital_staff'], [], undefined]) {
      await expect(call({ query: 'siam paragon' }, { claims: { 'cognito:groups': groups } })).rejects.toThrow('not-patient');
    }
    await expect(call({ query: 'siam paragon' }, null)).rejects.toThrow('not-patient');
    await expect(call({ query: 'siam paragon' }, {})).rejects.toThrow('not-patient'); // an identity with no claims
    expect(send).not.toHaveBeenCalled();
  });
});

describe('searchPlaces', () => {
  it('searches inside the fixed Bangkok rectangle, in the patient language, and returns only places inside Bangkok', async () => {
    send.mockResolvedValue({ ResultItems: [item('CentralWorld', 100.5398, 13.7466), item('Chiang Mai Gate', 98.99, 18.79)] });
    const result = await call({ query: 'central world', lang: 'th' });
    expect(result.places.map((p) => p.name)).toEqual(['CentralWorld']);
    const input = (send.mock.calls[0][0] as { input: Record<string, unknown> }).input;
    expect(input).toMatchObject({ QueryText: 'central world', Language: 'th', MaxResults: 5 });
    expect((input.Filter as { BoundingBox: number[] }).BoundingBox).toHaveLength(4);
    expect(input).not.toHaveProperty('BiasPosition');
  });

  it('does not call Amazon Location for text that is not a place name, and ignores an unknown language', async () => {
    for (const query of [undefined, '', 'ab', 'x'.repeat(200), 42]) expect(await call({ query })).toEqual({ places: [] });
    expect(send).not.toHaveBeenCalled();
    send.mockResolvedValue({ ResultItems: [] });
    await call({ query: 'siam paragon', lang: 'de' });
    expect((send.mock.calls[0][0] as { input: { Language: string } }).input.Language).toBe('en');
  });

  it('returns no places, not an error, when the search fails, and never logs what was typed', async () => {
    const typed = 'my secret street name';
    send.mockRejectedValue(Object.assign(new Error(`failed for ${typed}`), { name: 'ThrottlingException' }));
    expect(await call({ query: typed })).toEqual({ places: [], unavailable: true });
    const logged = [console.info, console.warn, console.error].flatMap((fn) => (fn as jest.Mock).mock.calls.flat()).join(' ');
    expect(logged).toContain('ThrottlingException');
    expect(logged).not.toContain('secret');
  });
});
