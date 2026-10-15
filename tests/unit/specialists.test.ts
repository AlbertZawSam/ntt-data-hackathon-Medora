import { describe, expect, it } from 'vitest';

import { hospitals } from '../../src/logic/data';
import { SIAM } from '../../src/logic/places';
import { findSpecialists, LANGUAGES, minutesUntil, SPECIALTIES, suggestSpecialty } from '../../src/logic/specialists';

// Wednesday 14 October 2026, Bangkok time.
const bkk = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 14, h - 7, m));
const NOON = bkk(12);

describe('suggestSpecialty', () => {
  it('maps each Find care need to a specialty', () => {
    expect(suggestSpecialty('maternity')).toBe('Obstetrics');
    expect(suggestSpecialty('preterm')).toBe('Obstetrics');
    expect(suggestSpecialty('peds')).toBe('Pediatrics');
    expect(suggestSpecialty('injury')).toBe('Orthopedics');
    expect(suggestSpecialty('general')).toBe('Internal medicine');
  });

  it('suggests nothing without a need', () => {
    expect(suggestSpecialty(null)).toBeNull();
    expect(suggestSpecialty(undefined)).toBeNull();
  });
});

describe('minutesUntil', () => {
  it('counts today and tomorrow from now, Bangkok time', () => {
    expect(minutesUntil({ day: 'today', time: '16:30' }, NOON)).toBe(270);
    expect(minutesUntil({ day: 'tomorrow', time: '09:00' }, NOON)).toBe(21 * 60);
  });

  it('drops a slot that has already started', () => {
    expect(minutesUntil({ day: 'today', time: '09:00' }, NOON)).toBeNull();
    expect(minutesUntil({ day: 'today', time: '12:00' }, NOON)).toBeNull();
  });

  it('reads a weekday as its next occurrence, a week ahead for today’s name', () => {
    expect(minutesUntil({ day: 'thu', time: '12:00' }, NOON)).toBe(24 * 60);
    expect(minutesUntil({ day: 'wed', time: '12:00' }, NOON)).toBe(7 * 24 * 60);
    expect(minutesUntil({ day: 'mon', time: '12:00' }, NOON)).toBe(5 * 24 * 60);
  });

  it('ignores unknown days and bad times', () => {
    expect(minutesUntil({ day: 'someday', time: '10:00' }, NOON)).toBeNull();
    expect(minutesUntil({ day: 'today', time: 'soon' }, NOON)).toBeNull();
  });

  it('uses Bangkok time, not the device time zone', () => {
    // 23:30 Bangkok is 16:30 UTC; "tomorrow 00:30" is one hour away.
    expect(minutesUntil({ day: 'tomorrow', time: '00:30' }, bkk(23, 30))).toBe(60);
  });
});

describe('findSpecialists', () => {
  it('lists only the chosen specialty and language', () => {
    const rows = findSpecialists(hospitals, { specialty: 'Pediatrics', language: 'Japanese' }, SIAM, NOON);
    expect(rows.map((r) => r.hospital.id)).toEqual(['H03']);
    expect(rows[0].specialist.languages).toContain('Japanese');
  });

  it('lists any language when none is chosen, nearest hospital first', () => {
    const rows = findSpecialists(hospitals, { specialty: 'Pediatrics', language: null }, SIAM, NOON);
    expect(rows.map((r) => r.hospital.id).sort()).toEqual(['H03', 'H08']);
    for (let i = 1; i < rows.length; i++) expect(rows[i].km).toBeGreaterThanOrEqual(rows[i - 1].km);
  });

  it('puts the soonest open slot first within a specialist', () => {
    const [row] = findSpecialists(hospitals, { specialty: 'Obstetrics', language: 'Thai' }, SIAM, NOON);
    expect(row.slots[0]).toEqual({ day: 'today', time: '15:30' });
  });

  it('leaves out slots that have passed', () => {
    const [row] = findSpecialists(hospitals, { specialty: 'Obstetrics', language: 'Thai' }, SIAM, bkk(16));
    expect(row.slots).toEqual([{ day: 'tomorrow', time: '09:30' }]);
  });

  it('includes a specialist who hides their name', () => {
    const rows = findSpecialists(hospitals, { specialty: 'Dermatology', language: null }, SIAM, NOON);
    expect(rows.some((r) => !r.specialist.namePublic)).toBe(true);
  });

  it('knows every specialty and language in the data', () => {
    for (const h of hospitals) {
      for (const s of h.specialists) {
        expect(SPECIALTIES as readonly string[]).toContain(s.specialty);
        for (const l of s.languages) expect(LANGUAGES as readonly string[]).toContain(l);
      }
    }
  });
});
