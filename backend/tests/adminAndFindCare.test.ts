import { POOLS, makeFakeClient, patientEvent, staffEvent } from './fakeData';

let fake = makeFakeClient();
jest.mock('@aws-amplify/backend/function/runtime', () => ({ getAmplifyDataClientConfig: async () => ({ resourceConfig: {}, libraryOptions: {} }) }));
jest.mock('aws-amplify', () => ({ Amplify: { configure: () => undefined } }));
jest.mock('aws-amplify/data', () => ({ generateClient: () => fake.client }));

const mockRoutesSend = jest.fn();
jest.mock('@aws-sdk/client-geo-routes', () => ({
  GeoRoutesClient: jest.fn(() => ({ send: (...args: unknown[]) => mockRoutesSend(...args) })),
  CalculateRouteMatrixCommand: jest.fn((input: unknown) => ({ input })),
}));

import { handler as adminSettings } from '../amplify/functions/admin-settings/handler';
import { handler as findCare } from '../amplify/functions/find-care/handler';

const run = (h: unknown, event: unknown) => (h as (e: never, c: never, cb: never) => Promise<string>)(event as never, {} as never, (() => undefined) as never);

beforeEach(() => {
  mockRoutesSend.mockReset().mockRejectedValue(new Error('offline')); // default: no Amazon Location, so the estimate is used
  process.env.STAFF_USER_POOL_ID = POOLS.STAFF;
  delete process.env.MODEL_ID_FAST;
  delete process.env.GUARDRAIL_ID;
  fake = makeFakeClient({
    HospitalStatus: [{ id: 'H1', hospitalId: 'H1', status: JSON.stringify({ beds: 3, nicu: 0, depts: { ed: 'open' }, equip: {}, oncall: {}, rules: { minBeds: 1 }, conflict: false, updatedAt: new Date().toISOString() }) }],
    HospitalProfile: [{ id: 'H1', hospitalId: 'H1', name: '{"en":"A","th":"ก"}', lat: 13.75, lng: 100.53, typicalWaitMin: 20 }],
  });
  for (const level of ['info', 'warn', 'error'] as const) jest.spyOn(console, level).mockImplementation(() => undefined);
});

describe('setAutoAcceptRules', () => {
  const admin = { groups: ['admins'], hospitalId: 'H1' };
  it('lets an admin set their own hospital rules', async () => {
    await run(adminSettings, staffEvent('setAutoAcceptRules', { rules: { stroke: true, minBeds: 2 } }, admin));
    expect(JSON.parse(String(fake.tables('HospitalStatus')[0].status)).rules).toEqual({ stroke: true, minBeds: 2 });
  });
  it('refuses nurses, doctors, patients and bad rules', async () => {
    for (const groups of [['hospital_staff'], ['doctors']]) {
      await expect(run(adminSettings, staffEvent('setAutoAcceptRules', { rules: { minBeds: 1 } }, { groups, hospitalId: 'H1', unit: 'ward' }))).rejects.toThrow('not-admin');
    }
    await expect(run(adminSettings, patientEvent('setAutoAcceptRules', { rules: { minBeds: 1 } }))).rejects.toThrow('not-admin');
    await expect(run(adminSettings, staffEvent('setAutoAcceptRules', { rules: { surgery: true, minBeds: 1 } }, admin))).rejects.toThrow('bad-rules');
  });
});

describe('findCare', () => {
  const args = { description: 'my child has a fever', lat: 13.75, lng: 100.53 };
  it('returns an emergency from the fixed rules before any model call', async () => {
    const out = JSON.parse(await run(findCare, patientEvent('findCare', { ...args, description: 'chest pain and cannot breathe' })));
    expect(out.emergency).toBeDefined();
    expect(out.hospitals).toBeUndefined();
  });
  it('returns hospitals as simple labels only, with the keyword fallback when no guardrail is set', async () => {
    const out = JSON.parse(await run(findCare, patientEvent('findCare', args)));
    expect(out).toMatchObject({ need: 'child', aiUsed: false });
    const allowed = ['details', 'distanceKm', 'driveMin', 'id', 'label', 'lat', 'lng', 'name', 'skipped', 'skippedItem'];
    for (const h of out.hospitals) expect(Object.keys(h).every((k) => allowed.includes(k))).toBe(true); // no counts, faults or rosters
    // Hospital details: beds as a word and the exact free count, equipment working or down, specialties on duty
    // (never names), bookable clinic specialists; never rosters, notes or rules.
    for (const h of out.hospitals) {
      expect(Object.keys(h.details).sort()).toEqual(['beds', 'bedsFree', 'care', 'clinic', 'departments', 'edOpen', 'equipment', 'freeBeds', 'onDuty', 'typicalWaitMin', 'updatedAt']);
      expect(['available', 'limited', 'full']).toContain(h.details.beds);
      expect(JSON.stringify(h.details)).not.toMatch(/"(nicu|equip|oncall|notes|meta|rules|icu)"/);
    }
  });
  it('ranks with real Amazon Location drive times when they are available, and sends only a rounded position', async () => {
    mockRoutesSend.mockResolvedValue({ RouteMatrix: [[{ Duration: 1_380 }]] });
    const out = JSON.parse(await run(findCare, patientEvent('findCare', { ...args, lat: 13.756789, lng: 100.531234 })));
    expect(out.hospitals[0].driveMin).toBe(23);
    const sent = (mockRoutesSend.mock.calls[0][0] as { input: { Origins: Array<{ Position: number[] }> } }).input;
    expect(sent.Origins).toEqual([{ Position: [100.531, 13.757] }]); // about 100 m, never the exact point
    expect(JSON.stringify(sent)).not.toContain('fever'); // nothing the patient wrote is sent
  });
  it('falls back to the offline estimate when Amazon Location fails', async () => {
    const out = JSON.parse(await run(findCare, patientEvent('findCare', { ...args, lat: 13.8, lng: 100.6 }))); // a few km from the hospital
    expect(out.hospitals).toHaveLength(1);
    expect(out.hospitals[0].driveMin).toBeGreaterThan(0);
    expect(mockRoutesSend).toHaveBeenCalledTimes(1);
  });
  it('refuses non-patients and locations outside Bangkok', async () => {
    await expect(run(findCare, staffEvent('findCare', args, { groups: ['doctors'], hospitalId: 'H1' }))).rejects.toThrow('not-patient');
    await expect(run(findCare, patientEvent('findCare', { ...args, lat: 35, lng: 139 }))).rejects.toThrow('bad-location');
  });
});
