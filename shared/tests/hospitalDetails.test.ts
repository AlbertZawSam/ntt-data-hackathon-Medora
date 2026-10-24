import fc from 'fast-check';
import { bedLabel, hospitalDetails } from '../logic/hospitalDetails';
import type { SpecialistRecord } from '../logic/specialists';
import { arbStatus, NOW_MS, openStatus } from './generators';

const profile = { hospitalId: 'H1', name: { en: 'A', th: 'ก' }, lat: 13.75, lng: 100.53, typicalWaitMin: 25 };
const slot = (hoursFromNow: number) => {
  const at = new Date(NOW_MS + 7 * 3_600_000 + hoursFromNow * 3_600_000).toISOString();
  return { id: `s${hoursFromNow}`, day: at.slice(0, 10), time: at.slice(11, 16), booked: false };
};
const specialist = (over: Partial<SpecialistRecord>): SpecialistRecord => ({
  id: 'S1', hospitalId: 'H1', name: 'Dr. Test', specialty: 'neurology', languages: ['th'], namePublic: true, slots: [slot(30)], ...over,
});

describe('hospitalDetails', () => {
  it('turns beds into a label: available, limited at one or two, full at none', () => {
    expect(bedLabel(openStatus({ beds: 5 }))).toBe('available');
    expect(bedLabel(openStatus({ beds: 2 }))).toBe('limited');
    expect(bedLabel(openStatus({ beds: 3, reservedBeds: 2 }))).toBe('limited');
    expect(bedLabel(openStatus({ beds: 0 }))).toBe('full');
  });

  it('lists specialties on duty only when their department is open', () => {
    const status = openStatus();
    const all = hospitalDetails(profile, status, [], NOW_MS).onDuty;
    expect(all).toContain('general');
    const closedKids = openStatus({ depts: { ...status.depts, pediatrics: 'diverting' } });
    expect(hospitalDetails(profile, closedKids, [], NOW_MS).onDuty).not.toContain('pediatrics');
    const noCardio = openStatus({ oncall: { ...status.oncall, cardiologist: false } });
    expect(hospitalDetails(profile, noCardio, [], NOW_MS).onDuty).not.toContain('cardiology');
  });

  it('shows bookable clinic specialists of this hospital, with the name only when public', () => {
    const list = [
      specialist({}),
      specialist({ id: 'S2', specialty: 'cardiology', namePublic: false }),
      specialist({ id: 'S3', hospitalId: 'H9' }),
      specialist({ id: 'S4', specialty: 'orthopedics', slots: [] }),
    ];
    expect(hospitalDetails(profile, openStatus(), list, NOW_MS).clinic).toEqual([
      { specialty: 'neurology', name: 'Dr. Test' },
      { specialty: 'cardiology', name: null },
    ]);
  });

  it('never exposes bed counts, equipment, rosters or notes', () => {
    fc.assert(
      fc.property(arbStatus, (status) => {
        const details = hospitalDetails(profile, status, [], NOW_MS);
        const text = JSON.stringify(details);
        for (const leak of ['"nicu"', '"equip"', '"oncall"', '"notes"', '"meta"', '"rules"', '"reserved', '"icu"', 'ct', 'mri', 'cathlab']) {
          expect(text).not.toContain(leak);
        }
        expect(typeof details.beds).toBe('string');
        const numbers = Object.entries(details).filter(([, v]) => typeof v === 'number').map(([k]) => k);
        expect(numbers).toEqual(['typicalWaitMin']);
      }),
    );
  });
});
