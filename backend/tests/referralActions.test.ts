import { POOLS, makeFakeClient, patientEvent, staffEvent } from './fakeData';

let fake = makeFakeClient();
jest.mock('@aws-amplify/backend/function/runtime', () => ({ getAmplifyDataClientConfig: async () => ({ resourceConfig: {}, libraryOptions: {} }) }));
jest.mock('aws-amplify', () => ({ Amplify: { configure: () => undefined } }));
jest.mock('aws-amplify/data', () => ({ generateClient: () => fake.client }));

import { handler } from '../amplify/functions/referral-actions/handler';

const doctor = { groups: ['doctors'], hospitalId: 'H1', sub: 'd1' };
const call = (event: unknown) => handler(event as never);

beforeEach(() => {
  process.env.STAFF_USER_POOL_ID = POOLS.STAFF;
  fake = makeFakeClient({
    Referral: [{ id: 'f1', ownerId: 'd1', fromHospitalId: 'H1', status: 'awaiting', chosenId: 'H2', etaMin: 12 }],
    CareRequest: [{ id: 'q1', referralId: 'f1', hospitalId: 'H2', status: 'accepted' }],
  });
  for (const level of ['info', 'warn', 'error'] as const) jest.spyOn(console, level).mockImplementation(() => undefined);
});

describe('openReferral', () => {
  it('creates a running referral for the calling doctor and their hospital', async () => {
    const id = await call(staffEvent('openReferral', { text: 'face droop', onsetMin: 30, lang: 'en' }, doctor));
    expect(fake.tables('Referral').find((r) => r.id === id)).toMatchObject({ ownerId: 'd1', fromHospitalId: 'H1', status: 'running' });
  });
  it('refuses nurses, patients and bad input', async () => {
    await expect(call(staffEvent('openReferral', { text: 'x', lang: 'en' }, { groups: ['hospital_staff'], hospitalId: 'H1', unit: 'ward' }))).rejects.toThrow('not-doctor');
    await expect(call(patientEvent('openReferral', { text: 'x', lang: 'en' }))).rejects.toThrow('not-doctor');
    await expect(call(staffEvent('openReferral', { text: '  ', lang: 'en' }, doctor))).rejects.toThrow('bad-description');
  });
});

describe('decideReferral', () => {
  it('confirms to the accepting hospital and creates the transfer', async () => {
    await call(staffEvent('decideReferral', { referralId: 'f1', decision: 'confirm' }, doctor));
    expect(fake.tables('Referral')[0].status).toBe('confirmed');
    expect(fake.tables('Transfer')[0]).toMatchObject({ toHospitalId: 'H2', ownerId: 'd1', status: 'in_progress' });
  });
  it("refuses another doctor's referral, and confirming twice", async () => {
    await expect(call(staffEvent('decideReferral', { referralId: 'f1', decision: 'confirm' }, { ...doctor, sub: 'd2' }))).rejects.toThrow('not-owner');
    await call(staffEvent('decideReferral', { referralId: 'f1', decision: 'confirm' }, doctor));
    await expect(call(staffEvent('decideReferral', { referralId: 'f1', decision: 'confirm' }, doctor))).rejects.toThrow('bad-state');
    expect(fake.tables('Transfer')).toHaveLength(1);
  });
  it('refuses to confirm when the chosen hospital has not accepted', async () => {
    fake.tables('CareRequest')[0].status = 'waiting';
    await expect(call(staffEvent('decideReferral', { referralId: 'f1', decision: 'confirm' }, doctor))).rejects.toThrow('not-accepted');
    expect(fake.tables('Transfer')).toHaveLength(0);
  });
  it('lets the doctor set aside without a transfer', async () => {
    await call(staffEvent('decideReferral', { referralId: 'f1', decision: 'set_aside' }, doctor));
    expect(fake.tables('Referral')[0].status).toBe('set_aside');
    expect(fake.tables('Transfer')).toHaveLength(0);
  });
  it("withdraws the chosen hospital's accepted request when set aside", async () => {
    await call(staffEvent('decideReferral', { referralId: 'f1', decision: 'set_aside' }, doctor));
    expect(fake.tables('CareRequest')[0].status).toBe('cancelled');
  });
});

describe('set aside', () => {
  const aside = (args: Record<string, unknown> = {}) => call(staffEvent('decideReferral', { referralId: 'f1', decision: 'set_aside', ...args }, doctor));
  it('logs the reason on the server, and refuses a reason that is not on the list', async () => {
    await expect(aside({ reason: 'because' })).rejects.toThrow('bad-reason');
    expect(fake.tables('Referral')[0].status).toBe('awaiting');
    await aside({ reason: 'tooFar' });
    expect(String(fake.tables('Activity').at(-1)?.text)).toContain('too far for this patient');
  });
  it("withdraws only the chosen hospital's request of this referral", async () => {
    fake.tables('CareRequest').push(
      { id: 'q2', referralId: 'f1', hospitalId: 'H3', status: 'accepted' },
      { id: 'q3', referralId: 'other', hospitalId: 'H2', status: 'accepted' },
    );
    await aside();
    const status = (id: string) => fake.tables('CareRequest').find((r) => r.id === id)?.status;
    expect([status('q1'), status('q2'), status('q3')]).toEqual(['cancelled', 'accepted', 'accepted']);
  });
});

describe('arriveTransfer', () => {
  beforeEach(() => {
    fake.tables('Transfer').push({ id: 't1', referralId: 'f1', ownerId: 'd1', status: 'in_progress' });
  });
  it('lets the owning doctor mark it arrived, once', async () => {
    await call(staffEvent('arriveTransfer', { transferId: 't1' }, doctor));
    expect(fake.tables('Transfer')[0].status).toBe('arrived');
    await expect(call(staffEvent('arriveTransfer', { transferId: 't1' }, doctor))).rejects.toThrow('bad-state');
  });
  it("refuses another doctor's transfer, nurses and patients", async () => {
    await expect(call(staffEvent('arriveTransfer', { transferId: 't1' }, { ...doctor, sub: 'd2' }))).rejects.toThrow('not-owner');
    await expect(call(staffEvent('arriveTransfer', { transferId: 't1' }, { groups: ['hospital_staff'], hospitalId: 'H1', unit: 'ward', sub: 'n1' }))).rejects.toThrow('not-doctor');
    await expect(call(patientEvent('arriveTransfer', { transferId: 't1' }))).rejects.toThrow();
    expect(fake.tables('Transfer')[0].status).toBe('in_progress');
  });
});

describe('arriveTransfer', () => {
  const bedStatus = (beds: number) => JSON.stringify({ beds, nicu: 1, depts: { ed: 'open' }, equip: {}, oncall: {}, rules: {}, conflict: false, updatedAt: new Date().toISOString() });
  beforeEach(() => {
    fake.tables('Transfer').push({ id: 't1', referralId: 'f1', toHospitalId: 'H2', ownerId: 'd1', status: 'in_progress' } as never);
    fake.tables('HospitalStatus').push({ id: 'H2', hospitalId: 'H2', status: bedStatus(3) } as never);
    Object.assign(fake.tables('CareRequest')[0], { needKey: 'stemi' });
  });

  it("completes the receiving hospital's request and takes one bed", async () => {
    await call(staffEvent('arriveTransfer', { transferId: 't1' }, doctor));
    expect(fake.tables('Transfer')[0].status).toBe('arrived');
    expect(fake.tables('CareRequest')[0].status).toBe('completed');
    expect(JSON.parse(String(fake.tables('HospitalStatus')[0].status)).beds).toBe(2);
  });

  it('takes no second bed when staff already marked the patient arrived', async () => {
    fake.tables('CareRequest')[0].status = 'completed';
    await call(staffEvent('arriveTransfer', { transferId: 't1' }, doctor));
    expect(JSON.parse(String(fake.tables('HospitalStatus')[0].status)).beds).toBe(3);
  });

  it("refuses another doctor's transfer", async () => {
    await expect(call(staffEvent('arriveTransfer', { transferId: 't1' }, { ...doctor, sub: 'd2' }))).rejects.toThrow('not-owner');
    expect(JSON.parse(String(fake.tables('HospitalStatus')[0].status)).beds).toBe(3);
  });
});
