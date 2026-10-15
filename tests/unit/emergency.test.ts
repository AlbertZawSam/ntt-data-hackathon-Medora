import { describe, expect, it } from 'vitest';

import { hospitals } from '../../src/logic/data';
import { nearestOpenEmergency } from '../../src/logic/emergency';
import type { Hospital, HospitalStatus } from '../../src/logic/types';

const NOON = new Date(Date.UTC(2026, 9, 14, 5)); // 12:00 Bangkok
const SIAM = { lat: 13.7466, lng: 100.5347 };

const status = (ed?: 'open' | 'diverting'): HospitalStatus => ({
  beds: 0,
  nicu: 0,
  conflict: false,
  depts: ed ? { ed } : {},
  equip: {},
  oncall: {},
  rules: { minBeds: 2 },
});

const at = (id: string, lat: number, lng: number, ed?: 'open' | 'diverting'): Hospital => ({
  id,
  name: { en: id, th: id },
  lat,
  lng,
  totalBeds: 10,
  nicuTotal: 0,
  typicalWaitMin: 20,
  status: status(ed),
  specialists: [],
});

describe('nearestOpenEmergency', () => {
  it('picks the closest hospital with an open emergency department', () => {
    const list = [at('far', 13.8, 100.6, 'open'), at('near', 13.747, 100.535, 'open')];
    expect(nearestOpenEmergency(SIAM, list, NOON)?.hospital.id).toBe('near');
  });

  it('skips diverting and missing emergency departments, however close', () => {
    const list = [
      at('diverting', 13.7466, 100.5347, 'diverting'),
      at('none', 13.7467, 100.5348),
      at('open', 13.8, 100.6, 'open'),
    ];
    expect(nearestOpenEmergency(SIAM, list, NOON)?.hospital.id).toBe('open');
  });

  it('ignores free beds: an emergency department takes patients with none', () => {
    expect(nearestOpenEmergency(SIAM, [at('full', 13.75, 100.54, 'open')], NOON)?.hospital.id).toBe('full');
  });

  it('returns null when no emergency department is open', () => {
    expect(nearestOpenEmergency(SIAM, [at('a', 13.75, 100.54, 'diverting')], NOON)).toBeNull();
    expect(nearestOpenEmergency(SIAM, [], NOON)).toBeNull();
  });

  it('returns the drive estimate for the chosen hospital', () => {
    const result = nearestOpenEmergency(SIAM, [at('a', 13.8, 100.6, 'open')], NOON);
    expect(result?.drive.km).toBeGreaterThan(0);
    expect(result?.drive.min).toBeGreaterThan(0);
  });

  it('finds Pathum Wan Medical Center from Siam in the seeded data', () => {
    expect(nearestOpenEmergency(SIAM, hospitals, NOON)?.hospital.id).toBe('H01');
  });
});
