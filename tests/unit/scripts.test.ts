import { describe, expect, it } from 'vitest';

import { hospitals } from '../../src/logic/data';
import { passwordProblems, RESET_MODELS, seedItems, TEST_USERS } from '../../scripts/lib/demo.mjs';

const NOW = Date.UTC(2026, 9, 14, 5);

describe('TEST_USERS (task 5.3)', () => {
  const byEmail = Object.fromEntries(TEST_USERS.map((u) => [u.email, u]));

  it('has one patient, staff at H02, H03 and H07, and a doctor at H04', () => {
    expect(byEmail['patient@example.com']).toMatchObject({ groups: ['patients'] });
    expect(byEmail['patient@example.com'].hospitalId).toBeUndefined();
    expect(byEmail['staff.h07@example.com']).toMatchObject({ groups: ['hospital_staff'], hospitalId: 'H07' });
    expect(byEmail['doctor.h04@example.com']).toMatchObject({ groups: ['doctors'], hospitalId: 'H04' });
  });

  it('makes H02 and H03 staff admins, and nobody else', () => {
    const admins = TEST_USERS.filter((u) => u.groups.includes('admins')).map((u) => u.hospitalId);
    expect(admins.sort()).toEqual(['H02', 'H03']);
  });

  it('uses only groups defined in amplify/auth and only seeded hospitals', () => {
    const groups = new Set(['patients', 'hospital_staff', 'doctors', 'admins']);
    const ids = new Set(hospitals.map((h) => h.id));
    for (const u of TEST_USERS) {
      for (const g of u.groups) expect(groups.has(g), g).toBe(true);
      if (u.hospitalId) expect(ids.has(u.hospitalId), u.hospitalId).toBe(true);
      expect(u.email.endsWith('@example.com')).toBe(true);
    }
  });
});

describe('passwordProblems', () => {
  it('accepts a password that meets the Cognito default policy', () => {
    expect(passwordProblems('Medora#2026')).toEqual([]);
  });

  it('lists what is missing', () => {
    expect(passwordProblems(undefined)).toEqual(['set MEDORA_TEST_PASSWORD']);
    expect(passwordProblems('short')).toContain('at least 8 characters');
    expect(passwordProblems('alllowercase1!')).toEqual(['an uppercase letter']);
    expect(passwordProblems('NoSymbol123')).toEqual(['a symbol']);
  });
});

describe('seedItems (task 6.2)', () => {
  const items = seedItems(hospitals, NOW);

  it('writes one row per hospital, keyed by hospitalId', () => {
    expect(items.map((i) => i.hospitalId)).toEqual(hospitals.map((h) => h.id));
    for (const item of items) expect(item.__typename).toBe('HospitalStatus');
  });

  it('turns the seeded age into updatedAt and drops ageMin', () => {
    const h05 = hospitals.find((h) => h.id === 'H05')!;
    const status = JSON.parse(items.find((i) => i.hospitalId === 'H05')!.status);
    expect(status.updatedAt).toBe(NOW - h05.status.ageMin! * 60_000);
    expect(status).not.toHaveProperty('ageMin');
    expect(status.beds).toBe(h05.status.beds);
  });

  it('does not change the source data', () => {
    expect(hospitals[0].status).toHaveProperty('ageMin');
  });
});

describe('RESET_MODELS', () => {
  it('clears requests, messages, referrals and traces, but keeps the audit log and status', () => {
    expect(RESET_MODELS.sort()).toEqual(['CareRequest', 'Message', 'Referral', 'TraceStep']);
  });
});
