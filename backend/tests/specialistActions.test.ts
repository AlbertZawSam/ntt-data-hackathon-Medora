import { POOLS, makeFakeClient, patientEvent, staffEvent } from './fakeData';

let fake = makeFakeClient();
jest.mock('@aws-amplify/backend/function/runtime', () => ({ getAmplifyDataClientConfig: async () => ({ resourceConfig: {}, libraryOptions: {} }) }));
jest.mock('aws-amplify', () => ({ Amplify: { configure: () => undefined } }));
jest.mock('aws-amplify/data', () => ({ generateClient: () => fake.client }));

import { handler } from '../amplify/functions/specialist-actions/handler';

const call = (event: unknown) => handler(event as never);
const admin = { groups: ['admins'], hospitalId: 'H1', sub: 'a1' };
const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
const specialist = { name: 'Dr A', specialty: 'cardiology', languages: ['th', 'en'], namePublic: false, slots: [{ day: future, time: '09:00' }] };

beforeEach(() => {
  process.env.STAFF_USER_POOL_ID = POOLS.STAFF;
  process.env.PUBLIC_USER_POOL_ID = POOLS.PUBLIC;
  fake = makeFakeClient({ HospitalProfile: [{ id: 'H1', hospitalId: 'H1', name: '{"en":"A","th":"ก"}', lat: 13.75, lng: 100.53 }] });
  for (const level of ['info', 'warn', 'error'] as const) jest.spyOn(console, level).mockImplementation(() => undefined);
});

describe('saveSpecialist and deleteSpecialist', () => {
  it('lets an admin save a specialist for their own hospital only', async () => {
    const id = await call(staffEvent('saveSpecialist', specialist, admin));
    expect(fake.tables('Specialist').find((r) => r.id === id)).toMatchObject({ hospitalId: 'H1', name: 'Dr A' });
  });
  it("refuses nurses, patients, another hospital's admin, and bad input", async () => {
    await expect(call(staffEvent('saveSpecialist', specialist, { groups: ['hospital_staff'], hospitalId: 'H1', unit: 'er' }))).rejects.toThrow('not-admin');
    await expect(call(patientEvent('saveSpecialist', specialist))).rejects.toThrow('not-admin');
    await expect(call(staffEvent('saveSpecialist', { ...specialist, languages: [] }, admin))).rejects.toThrow('bad-languages');
    const id = await call(staffEvent('saveSpecialist', specialist, admin));
    await expect(call(staffEvent('saveSpecialist', { ...specialist, id }, { ...admin, hospitalId: 'H9' }))).rejects.toThrow('not-admin');
    await expect(call(staffEvent('deleteSpecialist', { id }, { ...admin, hospitalId: 'H9' }))).rejects.toThrow('not-admin');
    await call(staffEvent('deleteSpecialist', { id }, admin));
    expect(fake.tables('Specialist')).toHaveLength(0);
  });
});

describe('findSpecialists and bookSpecialist', () => {
  const search = { lat: 13.74, lng: 100.53, specialty: 'cardiology' };
  it('hides the name until booking, then books once and stores the doctor on the request', async () => {
    await call(staffEvent('saveSpecialist', specialist, admin));
    const list = JSON.parse(await call(patientEvent('findSpecialists', search)));
    expect(list[0].name).toBeNull();
    const slotId = list[0].slots[0].id;
    const requestId = await call(patientEvent('bookSpecialist', { specialistId: list[0].id, slotId }));
    expect(fake.tables('CareRequest').find((r) => r.id === requestId)).toMatchObject({ type: 'booking', status: 'accepted', doctorName: 'Dr A', ownerId: 'p1' });
    await expect(call(patientEvent('bookSpecialist', { specialistId: list[0].id, slotId }, 'p2'))).rejects.toThrow('taken');
    expect(JSON.parse(await call(patientEvent('findSpecialists', search)))).toHaveLength(0);
  });
  it('refuses staff searches and locations outside Bangkok', async () => {
    await expect(call(staffEvent('findSpecialists', search, admin))).rejects.toThrow('not-patient');
    await expect(call(patientEvent('findSpecialists', { ...search, lat: 35, lng: 139 }))).rejects.toThrow('bad-location');
  });
});
