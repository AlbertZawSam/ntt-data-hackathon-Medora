import { matchesSpecialistQuery as matchQuery } from "../logic/specialists";
import { LANGUAGES, bookSlot, detectSlotMin, isSpecialty, matchesSpecialistQuery, listSpecialists, nextSlotOnWeekday, openSlots, sampleSpecialists, specialtyForNeed, validateSpecialistInput, weekdayOf, weeklySchedule, type SpecialistRecord } from '../logic/specialists';

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
    const records = [rec({ id: 'a' }), rec({ id: 'b', specialty: 'neurology' }), rec({ id: 'c', languages: ['th'] }), rec({ id: 'd', slots: [slot('z', '2026-10-20', '09:00', true)] })];
    expect(listSpecialists(records, hospitals, origin, { specialty: 'cardiology', language: 'en' }, NOW).map((s) => s.id)).toEqual(['a']);
  });
  it('knows only Thai and English, and refuses any other language', () => {
    expect([...LANGUAGES]).toEqual(['th', 'en']);
    expect(validateSpecialistInput({ name: 'Dr A', specialty: 'cardiology', languages: ['th', 'zh'], namePublic: true, slots: [slot('x', '2026-10-20', '09:00')] })).toEqual({ ok: false, issue: 'languages' });
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

describe('matchesSpecialistQuery', () => {
  const s = { specialty: 'cardiology', name: 'Dr. Kittisak Prasert', hospitalName: { en: 'Ladprao General Hospital', th: 'โรงพยาบาลลาดพร้าว' }, languages: ['th'] };
  it('finds by specialty word, synonym, Thai word, doctor name, hospital or language', () => {
    for (const q of ['cardiology', 'heart', 'หัวใจ', 'kittisak', 'ladprao', 'ลาดพร้าว', 'heart th']) expect(matchesSpecialistQuery(s, q)).toBe(true);
  });
  it('matches when any meaningful typed word matches, and treats empty text as everything', () => {
    expect(matchesSpecialistQuery(s, 'heart neurology')).toBe(true);
    expect(matchesSpecialistQuery(s, 'skin rash')).toBe(false);
    expect(matchesSpecialistQuery(s, '   ')).toBe(true);
  });
  it('never matches a hidden doctor name', () => {
    expect(matchesSpecialistQuery({ ...s, name: null }, 'kittisak')).toBe(false);
  });
});

describe('specialist search words', () => {
  const specs = ['cardiology', 'neurology', 'obstetrics', 'pediatrics', 'orthopedics', 'general'];
  const found = (q: string) => specs.filter((s) => matchQuery({ specialty: s, name: null, hospitalName: { en: 'Siam Central', th: 'สยาม' }, languages: ['en'] }, q));
  it('finds the right specialty for everyday words in English and Thai', () => {
    expect(found('surgery')).toEqual(['orthopedics']);
    expect(found('surgeon')).toEqual(['orthopedics']);
    expect(found('heart doctor')).toEqual(['cardiology']);
    expect(found('ankle')).toEqual(['orthopedics']);
    expect(found('my child has a fever')).toEqual(expect.arrayContaining(['pediatrics', 'general']));
    expect(found('ปวดหัว')).toEqual(['neurology']);
    expect(found('ผ่าตัด')).toEqual(['orthopedics']);
    expect(found('pregnant')).toEqual(['obstetrics']);
  });
  it('matches everyone for empty text or only filler words, and the hospital by name', () => {
    expect(found('')).toHaveLength(6);
    expect(found('I need a doctor')).toHaveLength(6);
    expect(found('siam')).toHaveLength(6);
    expect(found('skin rash zzz')).toEqual([]);
  });
});

describe('sampleSpecialists', () => {
  it('takes the nearest specialist of each specialty, up to three, keeping the list order', () => {
    const list = [
      { id: 'a', specialty: 'cardiology' },
      { id: 'b', specialty: 'cardiology' },
      { id: 'c', specialty: 'neurology' },
      { id: 'd', specialty: 'general' },
      { id: 'e', specialty: 'pediatrics' },
    ];
    expect(sampleSpecialists(list).map((s) => s.id)).toEqual(['a', 'c', 'd']);
    expect(sampleSpecialists(list, 5).map((s) => s.id)).toEqual(['a', 'c', 'd', 'e']);
    expect(sampleSpecialists([])).toEqual([]);
  });
});

describe('weeklySchedule', () => {
  // 2026-10-19 is a Monday; NOW is Tuesday 13 Oct 2026, 11:00 Bangkok.
  it('groups open slots by weekday, merges consecutive times into one range and orders Monday to Sunday', () => {
    const slots = [
      slot('su1', '2026-10-25', '09:00'),
      slot('mo1', '2026-10-19', '13:30'),
      slot('mo2', '2026-10-19', '14:00'),
      slot('mo3', '2026-10-19', '14:30'),
      slot('mo4', '2026-10-19', '16:00'),
      slot('we1', '2026-10-21', '09:00'),
      slot('we2', '2026-10-21', '09:30', true),
    ];
    expect(weeklySchedule(slots, NOW)).toEqual([
      { weekday: 0, start: '13:30', end: '15:00' },
      { weekday: 0, start: '16:00', end: '16:30' },
      { weekday: 2, start: '09:00', end: '09:30' },
      { weekday: 6, start: '09:00', end: '09:30' },
    ]);
  });
  it('reads the slot length from the data and merges the same weekday across weeks; past or booked slots vanish', () => {
    const slots = [
      slot('p', '2026-10-05', '09:00'), // past Monday
      slot('a', '2026-10-19', '09:00'),
      slot('b', '2026-10-19', '10:30'),
      slot('c', '2026-10-26', '14:00'), // next Monday
      slot('d', '2026-10-26', '15:30', true),
    ];
    expect(detectSlotMin(slots)).toBe(90);
    expect(weeklySchedule(slots, NOW)).toEqual([
      { weekday: 0, start: '09:00', end: '12:00' },
      { weekday: 0, start: '14:00', end: '15:30' },
    ]);
  });
  it('falls back to 30 minutes when there is one slot a day or the gaps are whole sessions apart', () => {
    expect(detectSlotMin([slot('a', '2026-10-19', '09:00')])).toBe(30);
    expect(detectSlotMin([slot('a', '2026-10-19', '09:00'), slot('b', '2026-10-19', '14:00')])).toBe(30);
    expect(weeklySchedule([slot('a', '2026-10-19', '09:00'), slot('b', '2026-10-19', '14:00')], NOW)).toEqual([
      { weekday: 0, start: '09:00', end: '09:30' },
      { weekday: 0, start: '14:00', end: '14:30' },
    ]);
    expect(weeklySchedule([], NOW)).toEqual([]);
  });
  it('knows the weekday of a calendar day and finds the next open slot on it', () => {
    expect(weekdayOf('2026-10-19')).toBe(0);
    expect(weekdayOf('2026-10-25')).toBe(6);
    const slots = [slot('late', '2026-10-26', '09:00'), slot('soon', '2026-10-19', '14:00'), slot('full', '2026-10-19', '09:00', true), slot('tue', '2026-10-20', '09:00')];
    expect(nextSlotOnWeekday(slots, 0, NOW)?.id).toBe('soon');
    expect(nextSlotOnWeekday(slots, 1, NOW)?.id).toBe('tue');
    expect(nextSlotOnWeekday(slots, 4, NOW)).toBeUndefined();
  });
});

describe('isSpecialty', () => {
  it('accepts the known specialties from a route parameter and nothing else', () => {
    expect(isSpecialty('orthopedics')).toBe(true);
    expect(isSpecialty('astrology')).toBe(false);
    expect(isSpecialty(undefined)).toBe(false);
  });
});
