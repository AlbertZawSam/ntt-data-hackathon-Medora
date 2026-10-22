import { POOLS, makeFakeClient, patientEvent, staffEvent } from './fakeData';

let fake = makeFakeClient();
jest.mock('@aws-amplify/backend/function/runtime', () => ({ getAmplifyDataClientConfig: async () => ({ resourceConfig: {}, libraryOptions: {} }) }));
jest.mock('aws-amplify', () => ({ Amplify: { configure: () => undefined } }));
jest.mock('aws-amplify/data', () => ({ generateClient: () => fake.client }));

import { handler as adminSettings } from '../amplify/functions/admin-settings/handler';
import { handler as findCare } from '../amplify/functions/find-care/handler';

const run = (h: unknown, event: unknown) => (h as (e: never, c: never, cb: never) => Promise<string>)(event as never, {} as never, (() => undefined) as never);

beforeEach(() => {
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
    const allowed = ['distanceKm', 'driveMin', 'id', 'label', 'lat', 'lng', 'name', 'skipped', 'skippedItem'];
    for (const h of out.hospitals) expect(Object.keys(h).every((k) => allowed.includes(k))).toBe(true); // no counts, faults or rosters
  });
  it('refuses non-patients and locations outside Bangkok', async () => {
    await expect(run(findCare, staffEvent('findCare', args, { groups: ['doctors'], hospitalId: 'H1' }))).rejects.toThrow('not-patient');
    await expect(run(findCare, patientEvent('findCare', { ...args, lat: 35, lng: 139 }))).rejects.toThrow('bad-location');
  });
});
