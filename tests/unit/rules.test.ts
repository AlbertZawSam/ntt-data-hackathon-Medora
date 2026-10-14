import { describe, expect, it } from 'vitest';

import { hospitals } from '../../src/logic/data';
import { ruleAccepts } from '../../src/logic/rules';
import type { HospitalStatus, PathwayKey } from '../../src/logic/types';

// Passes every pathway; each test turns one thing off.
const ready = (overrides: Partial<HospitalStatus> = {}): HospitalStatus => ({
  beds: 5,
  nicu: 2,
  ageMin: 5,
  conflict: false,
  depts: { ed: 'open', neuro: 'open', cardio: 'open', obstetrics: 'open', pediatrics: 'open' },
  equip: { ct: true, cathlab: true },
  oncall: { er: true, neurologist: true, cardiologist: true, obstetrician: true, pediatrician: true },
  rules: { visit: true, stroke: true, stemi: true, preterm: true, peds: true, minBeds: 2 },
  ...overrides,
});

describe('ruleAccepts: patient visits', () => {
  it('accepts when the visit rule is on and the emergency department is open', () => {
    expect(ruleAccepts(ready(), 'visit')).toBe(true);
  });

  it('waits for staff when the visit rule is off or missing', () => {
    expect(ruleAccepts(ready({ rules: { visit: false, minBeds: 0 } }), 'visit')).toBe(false);
    expect(ruleAccepts(ready({ rules: { minBeds: 0 } }), 'visit')).toBe(false);
  });

  it('waits for staff when the emergency department is diverting or missing', () => {
    expect(ruleAccepts(ready({ depts: { ed: 'diverting' } }), 'visit')).toBe(false);
    expect(ruleAccepts(ready({ depts: {} }), 'visit')).toBe(false);
  });

  it('does not need a free bed', () => {
    expect(ruleAccepts(ready({ beds: 0 }), 'visit')).toBe(true);
  });
});

describe('ruleAccepts: referrals', () => {
  it.each(['stroke', 'stemi', 'preterm', 'peds'] as const)('accepts %s when the rule is on and everything passes', (key) => {
    expect(ruleAccepts(ready(), key)).toBe(true);
  });

  it.each(['maternity', 'injury', 'general'] as const)('never accepts %s, which has no rule', (key) => {
    expect(ruleAccepts(ready(), key)).toBe(false);
  });

  it('waits for staff when the pathway rule is off', () => {
    expect(ruleAccepts(ready({ rules: { ...ready().rules, stroke: false } }), 'stroke')).toBe(false);
    expect(ruleAccepts(ready({ rules: { minBeds: 0 } }), 'stroke')).toBe(false);
  });

  it('only applies the rule for the pathway asked about', () => {
    const strokeOnly = ready({ rules: { stroke: true, minBeds: 0 } });
    expect(ruleAccepts(strokeOnly, 'stroke')).toBe(true);
    expect(ruleAccepts(strokeOnly, 'stemi')).toBe(false);
  });

  it('waits for staff when any requirement fails', () => {
    expect(ruleAccepts(ready({ depts: { ...ready().depts, neuro: 'diverting' } }), 'stroke')).toBe(false);
    expect(ruleAccepts(ready({ equip: { ct: false, cathlab: true } }), 'stroke')).toBe(false);
    expect(ruleAccepts(ready({ oncall: { ...ready().oncall, neurologist: false } }), 'stroke')).toBe(false);
    expect(ruleAccepts(ready({ nicu: 0 }), 'preterm')).toBe(false);
  });

  it('needs free beds at or above the minimum', () => {
    expect(ruleAccepts(ready({ beds: 2 }), 'stroke')).toBe(true);
    expect(ruleAccepts(ready({ beds: 1 }), 'stroke')).toBe(false);
    expect(ruleAccepts(ready({ beds: 0, rules: { ...ready().rules, minBeds: 0 } }), 'stroke')).toBe(false);
  });
});

describe('ruleAccepts: seed data', () => {
  // Worked out separately from the raw JSON, not with this code.
  const expected: Record<PathwayKey | 'visit', string[]> = {
    visit: ['H01', 'H02', 'H03', 'H04', 'H06', 'H07', 'H08', 'H09', 'H10'],
    stroke: ['H07'],
    stemi: ['H07'],
    preterm: ['H03'],
    peds: ['H01', 'H03', 'H08'],
    maternity: [],
    injury: [],
    general: [],
  };

  it.each(Object.entries(expected))('%s is accepted automatically by %j', (target, ids) => {
    const accepting = hospitals.filter((h) => ruleAccepts(h.status, target as PathwayKey | 'visit'));
    expect(accepting.map((h) => h.id)).toEqual(ids);
  });
});
