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

describe('a referred patient arrives', () => {
  const er = { groups: ['hospital_staff'], hospitalId: 'H1', unit: 'er' };
  beforeEach(() => {
    fake.tables('CareRequest').push({ id: 'q1', type: 'referral', hospitalId: 'H1', ownerId: 'd1', needKey: 'stemi', status: 'accepted', auto: true, referralId: 'f1', createdAtMs: Date.now() } as never);
    fake.tables('Transfer').push({ id: 't1', referralId: 'f1', toHospitalId: 'H1', status: 'in_progress' } as never);
  });

  it('takes one bed even with no held bed, and closes the doctor\'s transfer', async () => {
    await call(staffEvent('answerRequest', { requestId: 'q1', action: 'arrived' }, er));
    expect(fake.tables('CareRequest').find((r) => r.id === 'q1')?.status).toBe('completed');
    expect(JSON.parse(String(fake.tables('HospitalStatus')[0].status)).beds).toBe(4);
    expect(fake.tables('Transfer')[0].status).toBe('arrived');
  });
});

describe('quick replies', () => {
  const er = { groups: ['hospital_staff'], hospitalId: 'H1', unit: 'er' };
  beforeEach(() => {
    fake.tables('CareRequest').push({ id: 'q1', type: 'referral', hospitalId: 'H1', ownerId: 'd1', needKey: 'stemi', status: 'accepted', auto: true, referralId: 'f1', createdAtMs: Date.now() } as never);
    fake.tables('CareRequest').push({ id: 'v1', type: 'visit', hospitalId: 'H1', ownerId: 'p1', needKey: 'general', status: 'waiting', auto: false, createdAtMs: Date.now() } as never);
  });

  it('offers doctor referrals their own set and refuses the patient set there', async () => {
    await call(staffEvent('sendMessage', { requestId: 'q1', key: 'bedReady' }, er));
    expect(fake.tables('Message')[0]).toMatchObject({ requestId: 'q1', from: 'hospital', key: 'bedReady' });
    await expect(call(staffEvent('sendMessage', { requestId: 'q1', key: 'bringDocuments' }, er))).rejects.toThrow('bad-message');
  });

  it('keeps the patient set on patient requests', async () => {
    await call(staffEvent('sendMessage', { requestId: 'v1', key: 'goToEmergency' }, er));
    await expect(call(staffEvent('sendMessage', { requestId: 'v1', key: 'sendEcg' }, er))).rejects.toThrow('bad-message');
  });
});

describe('department requests', () => {
  const withCardio = () =>
    JSON.stringify({ beds: 5, nicu: 1, depts: { ed: 'open', cardio: 'open', ortho: 'diverting' }, equip: {}, oncall: {}, rules: { minBeds: 1 }, conflict: false, updatedAt: new Date().toISOString() });
  const staffOf = (unit: string) => ({ groups: ['hospital_staff'], hospitalId: 'H1', unit });
  beforeEach(() => {
    fake.tables('HospitalStatus')[0].status = withCardio();
  });

  it('stores the department, and only that department can answer it', async () => {
    const id = await call(patientEvent('submitRequest', { ...req, department: 'cardiology' }));
    expect(fake.tables('CareRequest').find((r) => r.id === id)).toMatchObject({ department: 'cardiology', status: 'waiting' });
    await expect(call(staffEvent('answerRequest', { requestId: id, action: 'accept' }, staffOf('er')))).rejects.toThrow('not-staff');
    await expect(call(staffEvent('answerRequest', { requestId: id, action: 'accept' }, staffOf('surgery')))).rejects.toThrow('not-staff');
    await call(staffEvent('answerRequest', { requestId: id, action: 'accept' }, staffOf('cardiology')));
    expect(fake.tables('CareRequest').find((r) => r.id === id)?.status).toBe('accepted');
  });

  it("refuses messages on a department's request from other units", async () => {
    const id = await call(patientEvent('submitRequest', { ...req, department: 'cardiology' }));
    await expect(call(staffEvent('sendMessage', { requestId: id, key: 'goToEmergency' }, staffOf('er')))).rejects.toThrow('not-staff');
    await call(staffEvent('sendMessage', { requestId: id, key: 'goToEmergency' }, staffOf('cardiology')));
  });

  it('refuses a department the hospital has closed or does not have', async () => {
    await expect(call(patientEvent('submitRequest', { ...req, department: 'surgery' }))).rejects.toThrow('bad-department');
    await expect(call(patientEvent('submitRequest', { ...req, department: 'obstetrics' }))).rejects.toThrow('bad-department');
    await expect(call(patientEvent('submitRequest', { ...req, department: 'ward' }))).rejects.toThrow('bad-department');
  });

  it('keeps a request without a department with the other units, not the departments', async () => {
    const id = await call(patientEvent('submitRequest', req));
    await expect(call(staffEvent('answerRequest', { requestId: id, action: 'accept' }, staffOf('cardiology')))).rejects.toThrow('not-staff');
    await call(staffEvent('answerRequest', { requestId: id, action: 'accept' }, staffOf('er')));
  });
});

describe('a doctor referral sent to Cardiology', () => {
  const staffOf = (unit: string) => ({ groups: ['hospital_staff'], hospitalId: 'H1', unit });
  beforeEach(() => {
    fake.tables('CareRequest').push({ id: 'ref-q', type: 'referral', hospitalId: 'H1', ownerId: 'd1', needKey: 'stemi', status: 'waiting', auto: false, referralId: 'f9', department: 'cardiology', createdAtMs: Date.now() } as never);
  });
  it('is answered by Cardiology or the emergency unit, never another department', async () => {
    await expect(call(staffEvent('answerRequest', { requestId: 'ref-q', action: 'accept' }, staffOf('surgery')))).rejects.toThrow('not-staff');
    await call(staffEvent('answerRequest', { requestId: 'ref-q', action: 'accept' }, staffOf('cardiology')));
    expect(fake.tables('CareRequest').find((r) => r.id === 'ref-q')?.status).toBe('accepted');
  });
  it('can be taken by the emergency unit when no cardiology account answers', async () => {
    await call(staffEvent('answerRequest', { requestId: 'ref-q', action: 'accept' }, staffOf('er')));
    expect(fake.tables('CareRequest').find((r) => r.id === 'ref-q')?.status).toBe('accepted');
  });
});

describe('the receiving department answers a direct referral', () => {
  const cardio = { groups: ['hospital_staff'], hospitalId: 'H1', unit: 'cardiology' };
  beforeEach(() => {
    fake.tables('Referral').push({ id: 'dr1', mode: 'direct', status: 'running', chosenId: 'H1' } as never);
    fake.tables('CareRequest').push({ id: 'dq', type: 'referral', hospitalId: 'H1', ownerId: 'd1', needKey: 'general', status: 'waiting', auto: false, referralId: 'dr1', department: 'cardiology', createdAtMs: Date.now() } as never);
  });
  it('accepting makes the referral ready for the doctor to confirm', async () => {
    await call(staffEvent('answerRequest', { requestId: 'dq', action: 'accept' }, cardio));
    expect(fake.tables('Referral').find((r) => r.id === 'dr1')?.status).toBe('awaiting');
  });
  it('declining closes it so the doctor can choose another hospital', async () => {
    await call(staffEvent('answerRequest', { requestId: 'dq', action: 'decline', reason: 'busy' }, cardio));
    expect(fake.tables('Referral').find((r) => r.id === 'dr1')?.status).toBe('failed');
  });
});

describe('direct referral answers, hardening', () => {
  it('ignores answers to an AI referral, and answers from a hospital the doctor did not choose', async () => {
    const er = { groups: ['hospital_staff'], hospitalId: 'H1', unit: 'er' };
    fake.tables('Referral').push({ id: 'ai1', mode: 'ai', status: 'running' } as never, { id: 'dr2', mode: 'direct', status: 'running', chosenId: 'H9' } as never);
    fake.tables('CareRequest').push(
      { id: 'qa', type: 'referral', hospitalId: 'H1', ownerId: 'd1', needKey: 'general', status: 'waiting', auto: false, referralId: 'ai1', createdAtMs: Date.now() } as never,
      { id: 'qb', type: 'referral', hospitalId: 'H1', ownerId: 'd1', needKey: 'general', status: 'waiting', auto: false, referralId: 'dr2', createdAtMs: Date.now() } as never,
    );
    await call(staffEvent('answerRequest', { requestId: 'qa', action: 'accept' }, er));
    await call(staffEvent('answerRequest', { requestId: 'qb', action: 'accept' }, er));
    expect(fake.tables('Referral').find((r) => r.id === 'ai1')?.status).toBe('running');
    expect(fake.tables('Referral').find((r) => r.id === 'dr2')?.status).toBe('running');
  });
  it("refuses staff of another hospital on a direct referral's request", async () => {
    fake.tables('CareRequest').push({ id: 'qc', type: 'referral', hospitalId: 'H1', ownerId: 'd1', needKey: 'general', status: 'waiting', auto: false, referralId: 'dr3', createdAtMs: Date.now() } as never);
    await expect(call(staffEvent('answerRequest', { requestId: 'qc', action: 'accept' }, { groups: ['hospital_staff'], hospitalId: 'H2', unit: 'er' }))).rejects.toThrow('not-staff');
  });
});

describe("the receiving hospital's doctor", () => {
  const doc = { groups: ['doctors'], hospitalId: 'H1' };
  it('accepts a direct referral manually, which makes it ready for the referring doctor to confirm', async () => {
    fake.tables('Referral').push({ id: 'dr9', mode: 'direct', status: 'running', chosenId: 'H1' } as never);
    fake.tables('CareRequest').push({ id: 'q9', type: 'referral', hospitalId: 'H1', ownerId: 'd-other', needKey: 'general', status: 'waiting', auto: false, referralId: 'dr9', department: 'surgery', createdAtMs: Date.now() } as never);
    await call(staffEvent('answerRequest', { requestId: 'q9', action: 'accept' }, doc));
    expect(fake.tables('CareRequest').find((r) => r.id === 'q9')?.status).toBe('accepted');
    expect(fake.tables('Referral').find((r) => r.id === 'dr9')?.status).toBe('awaiting');
  });
  it("can't answer a patient's own request, or another hospital's referral", async () => {
    fake.tables('CareRequest').push(
      { id: 'v9', type: 'visit', hospitalId: 'H1', ownerId: 'p1', needKey: 'general', status: 'waiting', auto: false, createdAtMs: Date.now() } as never,
      { id: 'r9', type: 'referral', hospitalId: 'H2', ownerId: 'd-other', needKey: 'general', status: 'waiting', auto: false, referralId: 'x', createdAtMs: Date.now() } as never,
    );
    await expect(call(staffEvent('answerRequest', { requestId: 'v9', action: 'accept' }, doc))).rejects.toThrow('not-staff');
    await expect(call(staffEvent('answerRequest', { requestId: 'r9', action: 'accept' }, doc))).rejects.toThrow('not-staff');
  });
});

describe('doctors only accept or decline referrals', () => {
  const doc = { groups: ['doctors'], hospitalId: 'H1' };
  beforeEach(() => {
    fake.tables('CareRequest').push(
      { id: 'qa1', type: 'referral', hospitalId: 'H1', ownerId: 'd-other', needKey: 'stemi', status: 'accepted', auto: true, overrideUntil: Date.now() + 60_000, referralId: 'rf1', fromHospitalId: 'H2', createdAtMs: Date.now() } as never,
      { id: 'qa2', type: 'referral', hospitalId: 'H1', ownerId: 'd-me', needKey: 'stemi', status: 'waiting', auto: false, referralId: 'rf2', fromHospitalId: 'H1', createdAtMs: Date.now() } as never,
    );
  });
  it("can't mark arrival (bed counts) or undo, which stay with unit staff", async () => {
    await expect(call(staffEvent('answerRequest', { requestId: 'qa1', action: 'arrived' }, doc))).rejects.toThrow('not-staff');
    await expect(call(staffEvent('answerRequest', { requestId: 'qa1', action: 'undo' }, doc))).rejects.toThrow('not-staff');
    expect(JSON.parse(String(fake.tables('HospitalStatus')[0].status)).beds).toBe(5);
  });
  it('never accepts a referral sent from their own hospital', async () => {
    await expect(call(staffEvent('answerRequest', { requestId: 'qa2', action: 'accept' }, doc))).rejects.toThrow('not-staff');
  });
  it('refuses a public-pool account placed in the doctors group', async () => {
    const event = {
      typeName: 'Mutation',
      fieldName: 'answerRequest',
      arguments: { requestId: 'qa1', action: 'accept' },
      identity: { sub: 'x1', claims: { iss: `https://cognito-idp.us-east-1.amazonaws.com/${POOLS.PUBLIC}`, 'cognito:groups': ['doctors'], 'custom:hospitalId': 'H1' } },
    };
    await expect(call(event)).rejects.toThrow('not-staff');
  });
});

describe('every accepted request holds one bed', () => {
  const ward = { groups: ['hospital_staff'], hospitalId: 'H1', unit: 'ward' };
  it('a general visit: accepting holds a bed, arrival makes it one bed fewer', async () => {
    const id = await call(patientEvent('submitRequest', req));
    await call(staffEvent('answerRequest', { requestId: id, action: 'accept' }, ward));
    expect(fake.tables('Reservation').filter((r) => r.requestId === id && r.state === 'held')).toHaveLength(1);
    await call(staffEvent('answerRequest', { requestId: id, action: 'arrived' }, ward));
    expect(fake.tables('Reservation').find((r) => r.requestId === id)?.state).toBe('converted');
    expect(JSON.parse(String(fake.tables('HospitalStatus')[0].status)).beds).toBe(4);
  });
});

describe('a bed is held from the moment a patient sends a request', () => {
  const ward = { groups: ['hospital_staff'], hospitalId: 'H1', unit: 'ward' };
  it('holds on send, keeps one hold on accept, releases on decline', async () => {
    const id = await call(patientEvent('submitRequest', req));
    expect(fake.tables('Reservation').filter((r) => r.requestId === id && r.state === 'held')).toHaveLength(1);
    await call(staffEvent('answerRequest', { requestId: id, action: 'accept' }, ward));
    expect(fake.tables('Reservation').filter((r) => r.requestId === id)).toHaveLength(1);
    const second = await call(patientEvent('submitRequest', req, 'p2'));
    await call(staffEvent('answerRequest', { requestId: second, action: 'decline', reason: 'nobed' }, ward));
    expect(fake.tables('Reservation').find((r) => r.requestId === second)?.state).toBe('released');
  });
  it('allows one open request per patient, and cancelling releases the bed', async () => {
    const id = await call(patientEvent('submitRequest', req));
    await expect(call(patientEvent('submitRequest', req))).rejects.toThrow('already-open');
    await call(patientEvent('cancelRequest', { requestId: id }));
    expect(fake.tables('Reservation').find((r) => r.requestId === id)?.state).toBe('released');
    await expect(call(patientEvent('submitRequest', req))).resolves.toEqual(expect.any(String));
  });
});
