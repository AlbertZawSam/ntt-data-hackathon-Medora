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
});
