import fc from 'fast-check';
import { bedLabel, bedRange, hospitalDetails } from '../logic/hospitalDetails';
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

  it('shows free beds as a range, never the exact number', () => {
    expect([0, 1, 2, 3, 5, 6, 10, 11, 40].map((beds) => bedRange(openStatus({ beds })))).toEqual(['none', '1-2', '1-2', '3-5', '3-5', '6-10', '6-10', '10+', '10+']);
    expect(bedRange(openStatus({ beds: 4, reservedBeds: 3 }))).toBe('1-2');
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

  it('shows the free-bed count and equipment, never rosters, notes or rules', () => {
    fc.assert(
      fc.property(arbStatus, (status) => {
        const details = hospitalDetails(profile, status, [], NOW_MS);
        const text = JSON.stringify(details);
        for (const leak of ['"nicu"', '"equip"', '"oncall"', '"notes"', '"meta"', '"rules"', '"reserved', '"icu"']) {
          expect(text).not.toContain(leak);
        }
        expect(typeof details.beds).toBe('string');
        const numbers = Object.entries(details).filter(([, v]) => typeof v === 'number').map(([k]) => k);
        expect(numbers.sort()).toEqual(['freeBeds', 'typicalWaitMin']);
        // Held beds count as taken, so the free count is never above the ready beds.
        expect(details.freeBeds).toBe(Math.max(0, status.beds - (status.reservedBeds ?? 0)));
        for (const e of details.equipment) expect(e.working).toBe(status.equip[e.key] === true);
      }),
    );
  });
});
