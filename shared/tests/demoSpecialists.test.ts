import { DEMO_HOSPITALS } from '../logic/demoHospitals';
import { clinicSlots, demoSpecialists } from '../logic/demoSpecialists';
import { SPECIALTIES, validateSpecialistInput, weeklySchedule } from '../logic/specialists';

const NOW = Date.parse('2026-10-24T20:00:00Z'); // 03:00 on Sunday 25 Oct in Bangkok

describe('demoSpecialists', () => {
  it('passes the same checks as an admin adding a specialist', () => {
    for (const { input } of demoSpecialists(NOW)) expect(validateSpecialistInput(input)).toEqual({ ok: true, value: input });
  });

  it('belongs to demo hospitals and covers every specialty', () => {
    const keys = new Set(DEMO_HOSPITALS.map((h) => h.key));
    const all = demoSpecialists(NOW);
    expect(all).toHaveLength(48);
    expect(all.every((s) => keys.has(s.hospitalKey))).toBe(true);
    expect(new Set(all.map((s) => s.input.specialty))).toEqual(new Set(SPECIALTIES));
  });

  it('works only in departments its hospital has', () => {
    const dept: Record<string, string> = { neurology: 'neuro', cardiology: 'cardio', obstetrics: 'obstetrics', pediatrics: 'pediatrics', orthopedics: 'ortho' };
    for (const { hospitalKey, input } of demoSpecialists(NOW)) {
      const hospital = DEMO_HOSPITALS.find((h) => h.key === hospitalKey);
      if (input.specialty !== 'general') expect(hospital?.departments).toContain(dept[input.specialty]);
    }
  });

  it('turns a weekly clinic into open slots on the next seven Bangkok days', () => {
    const slots = clinicSlots({ weekdays: [0, 2, 4], start: '09:00', end: '12:00' }, NOW);
    // Mon 26, Wed 28 and Fri 30 Oct, six half-hour appointments each.
    expect(new Set(slots.map((s) => s.day))).toEqual(new Set(['2026-10-26', '2026-10-28', '2026-10-30']));
    expect(slots).toHaveLength(18);
    expect(slots.every((s) => !s.booked)).toBe(true);
    expect(new Set(slots.map((s) => s.id)).size).toBe(18);
  });

  it('reads back as the same weekly hours on the specialist page', () => {
    const slots = clinicSlots({ weekdays: [1, 3], start: '13:00', end: '16:00' }, NOW);
    expect(weeklySchedule(slots, NOW)).toEqual([
      { weekday: 1, start: '13:00', end: '16:00' },
      { weekday: 3, start: '13:00', end: '16:00' },
    ]);
  });

  it('keeps a long clinic within the 60-slot limit by using one-hour appointments', () => {
    const slots = clinicSlots({ weekdays: [0, 1, 2, 3, 4, 5], start: '08:00', end: '17:00' }, NOW);
    expect(slots).toHaveLength(54);
    expect(weeklySchedule(slots, NOW)[0]).toEqual({ weekday: 0, start: '08:00', end: '17:00' });
  });
});
