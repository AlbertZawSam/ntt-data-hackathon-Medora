import fc from 'fast-check';
import {
  NEED_KEYS,
  nearestOpenEd,
  parsePublicEntry,
  publicEntry,
  rankPublic,
  skippedCloser,
  type PublicEntry,
  type PublicProfile,
} from '../logic/publicDirectory';
import { arbStatus, minutesAgo, NOW_MS, openStatus, ORIGIN } from './generators';

const profile = (id: string, kmNorth = 0): PublicProfile => ({
  hospitalId: id,
  name: { en: `Hospital ${id}`, th: `โรงพยาบาล ${id}` },
  // About 1.11 km per 0.01 degree of latitude.
  lat: ORIGIN.lat + kmNorth / 111,
  lng: ORIGIN.lng,
  typicalWaitMin: 30,
});

describe('publicEntry', () => {
  it('labels every need available for a fully open hospital', () => {
    const entry = publicEntry(profile('A'), openStatus());
    for (const need of NEED_KEYS) expect(entry.needs[need].label).toBe('available');
    expect(entry.edOpen).toBe(true);
  });

  it('gives a simple reason when a hospital cannot help', () => {
    const closed = publicEntry(profile('A'), openStatus({ depts: { ...openStatus().depts, pediatrics: 'diverting' } }));
    expect(closed.needs.child).toEqual({ label: 'unavailable', reason: 'closed', adjust: 0 });
    const noDoctor = publicEntry(profile('A'), openStatus({ oncall: { ...openStatus().oncall, obstetrician: false } }));
    expect(noDoctor.needs.maternity.reason).toBe('noSpecialist');
    const full = publicEntry(profile('A'), openStatus({ beds: 0 }));
    expect(full.needs.child.reason).toBe('full');
  });

  it('marks the last free bed and unclear data as limited', () => {
    expect(publicEntry(profile('A'), openStatus({ beds: 1 })).needs.child.label).toBe('limited');
    expect(publicEntry(profile('A'), openStatus({ beds: 3, reservedBeds: 2 })).needs.child.label).toBe('limited');
    expect(publicEntry(profile('A'), openStatus({ conflict: true })).needs.general.label).toBe('limited');
  });

  it('gives the last bed and unclear data the same public signal', () => {
    const lastBed = publicEntry(profile('A'), openStatus({ beds: 1 })).needs.child;
    const unclear = publicEntry(profile('A'), openStatus({ beds: 5, conflict: true })).needs.child;
    expect(lastBed).toEqual(unclear);
  });

  it('never exposes bed counts, equipment or rosters', () => {
    fc.assert(
      fc.property(arbStatus, (status) => {
        const text = JSON.stringify(publicEntry(profile('A'), status));
        for (const leak of ['beds', 'nicu', 'equip', 'oncall', 'notes', 'meta', 'rules', 'reserved']) expect(text).not.toContain(`"${leak}"`);
      }),
    );
  });

  it('round-trips through the API as JSON', () => {
    const entry = publicEntry(profile('A'), openStatus());
    expect(parsePublicEntry(JSON.stringify(entry))).toEqual(entry);
    expect(parsePublicEntry({ ...entry, needs: {} })).toBeNull();
    expect(parsePublicEntry('not json')).toBeNull();
  });
});

describe('rankPublic', () => {
  const near = publicEntry(profile('near', 1), openStatus({ depts: { ...openStatus().depts, pediatrics: 'diverting' } }));
  const mid = publicEntry(profile('mid', 3), openStatus());
  const far = publicEntry(profile('far', 8), openStatus());

  it('puts hospitals that can help first, nearest-scoring first, and those that cannot after', () => {
    const ranked = rankPublic([far, near, mid], 'child', ORIGIN, NOW_MS);
    expect(ranked.map((r) => r.entry.hospitalId)).toEqual(['mid', 'far', 'near']);
    expect(ranked[2].eligible).toBe(false);
    expect(ranked[2].score).toBe(Infinity);
  });

  it('ranks stale data lower', () => {
    const fresh = publicEntry(profile('fresh', 4), openStatus());
    const stale = publicEntry(profile('stale', 3), openStatus({ updatedAt: minutesAgo(45) }));
    const ranked = rankPublic([stale, fresh], 'general', ORIGIN, NOW_MS);
    expect(ranked[0].entry.hospitalId).toBe('fresh');
    expect(ranked[1].stale).toBe(true);
  });

  it('treats a never-updated hospital as stale', () => {
    const never = publicEntry(profile('never', 1), openStatus({ updatedAt: new Date(0).toISOString() }));
    expect(rankPublic([never], 'general', ORIGIN, NOW_MS)[0].stale).toBe(true);
  });

  it('lists only closer hospitals that were skipped', () => {
    const ranked = rankPublic([far, near, mid], 'child', ORIGIN, NOW_MS);
    expect(skippedCloser(ranked).map((r) => r.entry.hospitalId)).toEqual(['near']);
    expect(skippedCloser(rankPublic([mid], 'child', ORIGIN, NOW_MS))).toEqual([]);
  });

  it('returns every hospital exactly once', () => {
    fc.assert(
      fc.property(fc.array(arbStatus, { maxLength: 6 }), fc.constantFrom(...NEED_KEYS), (statuses, need) => {
        const entries: PublicEntry[] = statuses.map((s, i) => publicEntry(profile(`H${i}`, i), s));
        const ranked = rankPublic(entries, need, ORIGIN, NOW_MS);
        expect(ranked.map((r) => r.entry.hospitalId).sort()).toEqual(entries.map((e) => e.hospitalId).sort());
        const firstIneligible = ranked.findIndex((r) => !r.eligible);
        if (firstIneligible >= 0) expect(ranked.slice(firstIneligible).every((r) => !r.eligible)).toBe(true);
      }),
    );
  });
});

describe('nearestOpenEd', () => {
  it('picks the nearest hospital whose emergency department is open', () => {
    const closedNear = publicEntry(profile('closed', 1), openStatus({ depts: { ...openStatus().depts, ed: 'diverting' } }));
    const openFar = publicEntry(profile('open', 5), openStatus());
    expect(nearestOpenEd([closedNear, openFar], ORIGIN, NOW_MS)?.entry.hospitalId).toBe('open');
    expect(nearestOpenEd([closedNear], ORIGIN, NOW_MS)).toBeNull();
  });
});
