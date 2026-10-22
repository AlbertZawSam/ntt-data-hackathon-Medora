import { POOLS, makeFakeClient, patientEvent, staffEvent } from './fakeData';

let fake = makeFakeClient();
jest.mock('@aws-amplify/backend/function/runtime', () => ({ getAmplifyDataClientConfig: async () => ({ resourceConfig: {}, libraryOptions: {} }) }));
jest.mock('aws-amplify', () => ({ Amplify: { configure: () => undefined } }));
jest.mock('aws-amplify/data', () => ({ generateClient: () => fake.client }));

import { handler } from '../amplify/functions/care-actions/handler';

const status = (rules: Record<string, unknown>) =>
  JSON.stringify({ beds: 5, nicu: 1, depts: { ed: 'open' }, equip: {}, oncall: {}, rules: { minBeds: 1, ...rules }, conflict: false, updatedAt: new Date().toISOString() });

const req = {
  hospitalId: 'H1', needKey: 'general', etaMin: 15, mode: 'car', description: 'fever', name: 'Somchai',
};
const call = (event: unknown) => handler(event as never);

beforeEach(() => {
  process.env.PUBLIC_USER_POOL_ID = POOLS.PUBLIC;
  process.env.STAFF_USER_POOL_ID = POOLS.STAFF;
  fake = makeFakeClient({ HospitalStatus: [{ id: 'H1', hospitalId: 'H1', status: status({}) }], HospitalProfile: [{ id: 'H1', name: '{"en":"A","th":"ก"}' }] });
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('submitRequest', () => {
  it('creates a waiting request owned by the patient when no rule applies', async () => {
    const id = await call(patientEvent('submitRequest', req));
    expect(fake.tables('CareRequest').find((r) => r.id === id)).toMatchObject({ status: 'waiting', auto: false, ownerId: 'p1', hospitalId: 'H1' });
  });

  it('accepts at once when the admin rule allows, with an undo window', async () => {
    fake.tables('HospitalStatus')[0].status = status({ visit: true });
    const id = await call(patientEvent('submitRequest', req));
    const row = fake.tables('CareRequest').find((r) => r.id === id);
    expect(row).toMatchObject({ status: 'accepted', auto: true });
    expect(typeof row?.overrideUntil).toBe('number');
  });

  it('refuses a staff token and a bad request', async () => {
    await expect(call(staffEvent('submitRequest', req, { groups: ['hospital_staff'], hospitalId: 'H1', unit: 'ward' }))).rejects.toThrow('not-patient');
    await expect(call(patientEvent('submitRequest', { ...req, mode: 'boat' }))).rejects.toThrow('bad-mode');
  });
});

describe('answerRequest', () => {
  const ward = { groups: ['hospital_staff'], hospitalId: 'H1', unit: 'ward' };
  const waiting = () => ({ id: 'r1', hospitalId: 'H1', ownerId: 'p1', status: 'waiting', auto: false, createdAtMs: Date.now() });

  it('lets staff of the request hospital accept', async () => {
    fake.tables('CareRequest').push(waiting());
    await call(staffEvent('answerRequest', { requestId: 'r1', action: 'accept' }, ward));
    expect(fake.tables('CareRequest')[0].status).toBe('accepted');
  });

  it('refuses staff of another hospital, and patients', async () => {
    fake.tables('CareRequest').push(waiting());
    await expect(call(staffEvent('answerRequest', { requestId: 'r1', action: 'accept' }, { ...ward, hospitalId: 'H9' }))).rejects.toThrow('not-staff');
    await expect(call(patientEvent('answerRequest', { requestId: 'r1', action: 'accept' }))).rejects.toThrow('not-staff');
    expect(fake.tables('CareRequest')[0].status).toBe('waiting');
  });

  it('refuses a late undo and an accept of a declined request', async () => {
    fake.tables('CareRequest').push({ ...waiting(), status: 'accepted', auto: true, overrideUntil: Date.now() - 1000 });
    await expect(call(staffEvent('answerRequest', { requestId: 'r1', action: 'undo' }, ward))).rejects.toThrow('undo-expired');
    fake.tables('CareRequest')[0].status = 'declined';
    await expect(call(staffEvent('answerRequest', { requestId: 'r1', action: 'accept' }, ward))).rejects.toThrow('bad-state');
  });
});

describe('cancelRequest and sendMessage', () => {
  const accepted = { id: 'r1', hospitalId: 'H1', ownerId: 'p1', status: 'accepted', auto: false, createdAtMs: Date.now() };

  it("a patient can't cancel someone else's request", async () => {
    fake.tables('CareRequest').push({ ...accepted });
    await expect(call(patientEvent('cancelRequest', { requestId: 'r1' }, 'p2'))).rejects.toThrow('not-owner');
    await call(patientEvent('cancelRequest', { requestId: 'r1' }, 'p1'));
    expect(fake.tables('CareRequest')[0].status).toBe('cancelled');
  });

  it('decides the sender from the token, and refuses forged or foreign senders', async () => {
    fake.tables('CareRequest').push({ ...accepted });
    await call(patientEvent('sendMessage', { requestId: 'r1', key: 'onMyWay' }));
    await call(staffEvent('sendMessage', { requestId: 'r1', key: 'waitingForYou' }, { groups: ['hospital_staff'], hospitalId: 'H1', unit: 'er' }));
    expect(fake.tables('Message').map((m) => m.from)).toEqual(['patient', 'hospital']);
    await expect(call(patientEvent('sendMessage', { requestId: 'r1', key: 'onMyWay' }, 'p2'))).rejects.toThrow('not-owner');
    await expect(call(staffEvent('sendMessage', { requestId: 'r1', key: 'onMyWay' }, { groups: ['hospital_staff'], hospitalId: 'H9', unit: 'er' }))).rejects.toThrow('not-staff');
    await expect(call(patientEvent('sendMessage', { requestId: 'r1', key: 'rm -rf' }))).rejects.toThrow('bad-message');
  });
});

describe('reservations', () => {
  const peds = { ...req, needKey: 'child' };
  const oneBed = () =>
    JSON.stringify({ beds: 1, nicu: 0, depts: { ed: 'open', pediatrics: 'open' }, equip: {}, oncall: { pediatrician: true }, rules: { minBeds: 1, peds: true }, conflict: false, updatedAt: new Date().toISOString() });
  const ward = { groups: ['hospital_staff'], hospitalId: 'H1', unit: 'ward' };

  it('holds the last bed on acceptance, so the next request is not auto-accepted', async () => {
    fake.tables('HospitalStatus')[0].status = oneBed();
    const first = await call(patientEvent('submitRequest', peds));
    expect(fake.tables('CareRequest').find((r) => r.id === first)).toMatchObject({ status: 'accepted', auto: true });
    expect(fake.tables('Reservation')).toHaveLength(1);
    const second = await call(patientEvent('submitRequest', peds, 'p2'));
    expect(fake.tables('CareRequest').find((r) => r.id === second)).toMatchObject({ status: 'waiting', auto: false });
  });

  it('releases the hold on cancel, decline and undo', async () => {
    fake.tables('HospitalStatus')[0].status = oneBed();
    const id = await call(patientEvent('submitRequest', peds));
    await call(patientEvent('cancelRequest', { requestId: id }));
    expect(fake.tables('Reservation')[0].state).toBe('released');
    const again = await call(patientEvent('submitRequest', peds));
    expect(fake.tables('CareRequest').find((r) => r.id === again)?.status).toBe('accepted');
    await call(staffEvent('answerRequest', { requestId: again, action: 'undo' }, ward));
    expect(fake.tables('Reservation').filter((r) => r.state === 'held')).toHaveLength(0);
  });

  it('converts the hold on arrival and uses up one ready bed', async () => {
    fake.tables('HospitalStatus')[0].status = oneBed();
    const id = await call(patientEvent('submitRequest', peds));
    await call(staffEvent('answerRequest', { requestId: id, action: 'arrived' }, ward));
    expect(fake.tables('CareRequest').find((r) => r.id === id)?.status).toBe('completed');
    expect(fake.tables('Reservation')[0].state).toBe('converted');
    expect(JSON.parse(String(fake.tables('HospitalStatus')[0].status)).beds).toBe(0);
  });
});
