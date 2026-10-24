import { DEMO_HOSPITALS } from '../logic/demoHospitals';
import { demoSlots, demoSpecialists } from '../logic/demoSpecialists';
import { SPECIALTIES, validateSpecialistInput } from '../logic/specialists';

const NOW = Date.parse('2026-10-24T20:00:00Z'); // 03:00 on 25 Oct in Bangkok

describe('demoSpecialists', () => {
  it('passes the same checks as an admin adding a specialist', () => {
    for (const { input } of demoSpecialists(NOW)) expect(validateSpecialistInput(input)).toEqual({ ok: true, value: input });
  });

  it('belongs to demo hospitals and covers every specialty', () => {
    const keys = new Set(DEMO_HOSPITALS.map((h) => h.key));
    const all = demoSpecialists(NOW);
    expect(all.every((s) => keys.has(s.hospitalKey))).toBe(true);
    expect(new Set(all.map((s) => s.input.specialty))).toEqual(new Set(SPECIALTIES));
  });

  it('offers slots on the next three Bangkok days, none booked', () => {
    const slots = demoSlots(NOW);
    expect(slots).toHaveLength(9);
    expect(new Set(slots.map((s) => s.day))).toEqual(new Set(['2026-10-26', '2026-10-27', '2026-10-28']));
    expect(slots.every((s) => !s.booked)).toBe(true);
    expect(new Set(slots.map((s) => s.id)).size).toBe(9);
  });
});
