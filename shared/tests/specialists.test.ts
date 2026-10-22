import { bookSlot, listSpecialists, openSlots, specialtyForNeed, validateSpecialistInput, type SpecialistRecord } from '../logic/specialists';

const NOW = Date.parse('2026-10-13T04:00:00Z');
const slot = (id: string, day: string, time: string, booked = false) => ({ id, day, time, booked });
const hospitals = new Map([
  ['H1', { name: { en: 'Near', th: 'ใกล้' }, lat: 13.75, lng: 100.53 }],
  ['H2', { name: { en: 'Far', th: 'ไกล' }, lat: 13.95, lng: 100.7 }],
]);
const rec = (over: Partial<SpecialistRecord>): SpecialistRecord => ({
  id: 's', hospitalId: 'H1', name: 'Dr A', specialty: 'cardiology', languages: ['th', 'en'], namePublic: true,
  slots: [slot('a', '2026-10-20', '09:00')], ...over,
});
const origin = { lat: 13.74, lng: 100.53 };

describe('validateSpecialistInput', () => {
  const base = { name: ' Dr  A ', specialty: 'cardiology', languages: ['th'], namePublic: true, slots: [slot('x', '2026-10-20', '09:00')] };
  it('accepts a valid specialist and tidies the name', () => {
    expect(validateSpecialistInput(base)).toMatchObject({ ok: true, value: { name: 'Dr A' } });
  });
  it.each([
    [{ name: '' }, 'name'],
    [{ specialty: 'astrology' }, 'specialty'],
    [{ languages: [] }, 'languages'],
    [{ languages: ['xx'] }, 'languages'],
    [{ slots: [slot('x', '2026-10-20', '25:00')] }, 'slots'],
    [{ slots: [slot('x', 'tomorrow', '09:00')] }, 'slots'],
    [{ slots: [slot('x', '2026-10-20', '09:00'), slot('y', '2026-10-20', '09:00')] }, 'slots'],
  ])('refuses %j', (patch, issue) => {
    expect(validateSpecialistInput({ ...base, ...patch })).toEqual({ ok: false, issue });
  });
});

describe('listSpecialists', () => {
  it('orders nearest hospital first, then soonest slot, and hides unshared names', () => {
    const list = listSpecialists(
      [rec({ id: 'far', hospitalId: 'H2' }), rec({ id: 'near2', slots: [slot('b', '2026-10-22', '09:00')] }), rec({ id: 'near1', namePublic: false })],
      hospitals, origin, {}, NOW,
    );
    expect(list.map((s) => s.id)).toEqual(['near1', 'near2', 'far']);
    expect(list[0].name).toBeNull();
  });
  it('filters by specialty and language and drops specialists with no open slot', () => {
    const records = [rec({ id: 'a' }), rec({ id: 'b', specialty: 'neurology' }), rec({ id: 'c', languages: ['zh'] }), rec({ id: 'd', slots: [slot('z', '2026-10-20', '09:00', true)] })];
    expect(listSpecialists(records, hospitals, origin, { specialty: 'cardiology', language: 'en' }, NOW).map((s) => s.id)).toEqual(['a']);
  });
  it('never offers past or booked slots', () => {
    expect(openSlots([slot('p', '2026-10-01', '09:00'), slot('b', '2026-10-20', '09:00', true), slot('ok', '2026-10-20', '10:00')], NOW).map((s) => s.id)).toEqual(['ok']);
  });
});

describe('bookSlot', () => {
  const slots = [slot('a', '2026-10-20', '09:00'), slot('p', '2026-10-01', '09:00')];
  it('locks the slot, and a second booking is refused', () => {
    const first = bookSlot(slots, 'a', NOW);
    expect(first.ok && first.slots.find((s) => s.id === 'a')?.booked).toBe(true);
    expect(bookSlot(first.ok ? first.slots : [], 'a', NOW)).toEqual({ ok: false, reason: 'taken' });
  });
  it('refuses unknown and past slots', () => {
    expect(bookSlot(slots, 'nope', NOW)).toEqual({ ok: false, reason: 'no-slot' });
    expect(bookSlot(slots, 'p', NOW)).toEqual({ ok: false, reason: 'past' });
  });
});

describe('specialtyForNeed', () => {
  it('suggests a specialty from the last search', () => {
    expect(specialtyForNeed('maternity')).toBe('obstetrics');
    expect(specialtyForNeed('child')).toBe('pediatrics');
    expect(specialtyForNeed('injury')).toBe('orthopedics');
    expect(specialtyForNeed('general')).toBe('general');
  });
});
