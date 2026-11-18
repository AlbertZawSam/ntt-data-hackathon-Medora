import { DEMO_HOSPITALS } from '../logic/demoHospitals';
import { DEMO_SPECIALISTS, demoSpecialists, sessionSlots } from '../logic/demoSpecialists';
import { SPECIALTIES, validateSpecialistInput, weeklySchedule } from '../logic/specialists';

const NOW = Date.parse('2026-10-24T20:00:00Z'); // 03:00 on Sunday 25 Oct in Bangkok

describe('demoSpecialists', () => {
  it('passes the same checks as an admin adding a specialist', () => {
    for (const { input } of demoSpecialists(NOW)) expect(validateSpecialistInput(input)).toEqual({ ok: true, value: input });
  });

  it('belongs to demo hospitals, covers every specialty and has unique names per hospital', () => {
    const keys = new Set(DEMO_HOSPITALS.map((h) => h.key));
    const all = demoSpecialists(NOW);
    expect(all.length).toBeGreaterThan(100);
    expect(all.every((s) => keys.has(s.hospitalKey))).toBe(true);
    expect(new Set(all.map((s) => s.input.specialty))).toEqual(new Set(SPECIALTIES));
    expect(new Set(all.map((s) => `${s.hospitalKey}/${s.input.name}`)).size).toBe(all.length);
  });

  it('has at least one session a week, each a weekday with AM or PM', () => {
    for (const s of DEMO_SPECIALISTS) {
      expect(s.sessions.length).toBeGreaterThan(0);
      for (const session of s.sessions) expect(session).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (AM|PM)$/);
    }
  });

  it('turns weekly sessions into open slots on the next seven Bangkok days', () => {
    const slots = sessionSlots(['Mon AM', 'Wed AM', 'Fri PM'], NOW);
    // Mon 26 and Wed 28 Oct 09:00-12:00, Fri 30 Oct 13:00-16:00: six half-hour appointments each.
    expect(new Set(slots.map((s) => s.day))).toEqual(new Set(['2026-10-26', '2026-10-28', '2026-10-30']));
    expect(slots).toHaveLength(18);
    expect(slots.every((s) => !s.booked)).toBe(true);
    expect(new Set(slots.map((s) => s.id)).size).toBe(18);
  });

  it('reads back as the same weekly hours on the specialist page', () => {
    const slots = sessionSlots(['Tue PM', 'Thu AM', 'Thu PM'], NOW);
    expect(weeklySchedule(slots, NOW)).toEqual([
      { weekday: 1, start: '13:00', end: '16:00' },
      { weekday: 3, start: '09:00', end: '12:00' },
      { weekday: 3, start: '13:00', end: '16:00' },
    ]);
  });

  it('keeps a busy clinic within the 60-slot limit by using one-hour appointments', () => {
    const all = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].flatMap((d) => [`${d} AM`, `${d} PM`]);
    const slots = sessionSlots(all, NOW);
    expect(slots).toHaveLength(36);
    expect(weeklySchedule(slots, NOW)[0]).toEqual({ weekday: 0, start: '09:00', end: '12:00' });
  });
});
