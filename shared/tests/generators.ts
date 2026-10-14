/**
 * Test data generators. Every hospital in a test is made up inside the test itself;
 * there is no prepared hospital dataset (live data only, AGENTS.md rule 8).
 */
import fc from 'fast-check';
import { PATHWAY_KEYS, PATHWAYS } from '../logic/pathways';
import type { HospitalStatus, Pathway, RankableHospital } from '../logic/types';

/** Fixed clock: a Tuesday, 11:00 Bangkok time (normal traffic). */
export const NOW_MS = Date.parse('2026-10-13T04:00:00Z');

/** Patient location used by tests. */
export const ORIGIN = { lat: 13.7456, lng: 100.5342 };

/** ISO timestamp `ageMin` minutes before NOW_MS. */
export const minutesAgo = (ageMin: number): string => new Date(NOW_MS - ageMin * 60_000).toISOString();

/** A status that passes every pathway: all departments open, all equipment and roles available. */
export function openStatus(overrides: Partial<HospitalStatus> = {}): HospitalStatus {
  const all = Object.values(PATHWAYS);
  const deptNames = all.flatMap((p) => [...p.departments, ...(p.prefer ? [p.prefer] : [])]);
  const depts = Object.fromEntries(deptNames.map((d) => [d, 'open' as const]));
  const equip = Object.fromEntries(all.flatMap((p) => p.equipment).map((e) => [e, true]));
  const oncall = Object.fromEntries(all.flatMap((p) => p.onDuty).map((r) => [r, true]));
  return {
    beds: 5,
    nicu: 2,
    depts,
    equip,
    oncall,
    rules: { minBeds: 1 },
    conflict: false,
    updatedAt: minutesAgo(5),
    ...overrides,
  };
}

export const arbPathway: fc.Arbitrary<Pathway> = fc.constantFrom(...PATHWAY_KEYS).map((k) => PATHWAYS[k]);

const ITEMS = {
  depts: ['ed', 'neuro', 'cardio', 'obstetrics', 'pediatrics', 'ortho'],
  equip: ['ct', 'cathlab', 'mri'],
  roles: ['er', 'neurologist', 'cardiologist', 'obstetrician', 'pediatrician', 'orthopedist'],
};

const arbRecord = <T>(keys: string[], value: fc.Arbitrary<T>): fc.Arbitrary<Record<string, T>> =>
  fc.dictionary(fc.constantFrom(...keys), value);

/** Random hospital status, including missing departments, equipment and roles. */
export const arbStatus: fc.Arbitrary<HospitalStatus> = fc.record({
  beds: fc.integer({ min: 0, max: 20 }),
  nicu: fc.integer({ min: 0, max: 5 }),
  depts: arbRecord(ITEMS.depts, fc.constantFrom('open' as const, 'diverting' as const)),
  equip: arbRecord(ITEMS.equip, fc.boolean()),
  oncall: arbRecord(ITEMS.roles, fc.boolean()),
  rules: fc.record({
    minBeds: fc.integer({ min: 0, max: 10 }),
    visit: fc.boolean(),
    stroke: fc.boolean(),
    stemi: fc.boolean(),
    preterm: fc.boolean(),
    peds: fc.boolean(),
    maternity: fc.boolean(),
    injury: fc.boolean(),
    general: fc.boolean(),
  }),
  conflict: fc.boolean(),
  updatedAt: fc.integer({ min: 0, max: 240 }).map(minutesAgo),
});

export const arbHospital: fc.Arbitrary<RankableHospital> = fc.record({
  id: fc.uuid(),
  name: fc.constant({ en: 'Test Hospital', th: 'โรงพยาบาลทดสอบ' }),
  lat: fc.double({ min: 13.49, max: 14.05, noNaN: true }),
  lng: fc.double({ min: 100.33, max: 100.93, noNaN: true }),
  typicalWaitMin: fc.integer({ min: 0, max: 120 }),
  status: arbStatus,
});

/** One made-up hospital `km` kilometres north of ORIGIN, fully open unless overridden. */
export function makeHospital(id: string, km: number, status: Partial<HospitalStatus> = {}): RankableHospital {
  return {
    id,
    name: { en: `Test Hospital ${id}`, th: `โรงพยาบาลทดสอบ ${id}` },
    lat: ORIGIN.lat + km / 111.2,
    lng: ORIGIN.lng,
    typicalWaitMin: 20,
    status: openStatus(status),
  };
}
