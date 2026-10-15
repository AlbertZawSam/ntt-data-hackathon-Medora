import { describe, expect, it } from 'vitest';

import { pathways } from '../../src/logic/data';
import type { Evaluation, Failure } from '../../src/logic/ranking';
import { availability, freshness, skippedNearest, skipReason } from '../../src/logic/publicLabels';
import type { Hospital, HospitalStatus } from '../../src/logic/types';

const NOW = Date.UTC(2026, 9, 14, 5);

const row = (status: Partial<HospitalStatus>, extra: Partial<Evaluation> = {}): Evaluation => {
  const hospital: Hospital = {
    id: 'H',
    name: { en: 'H', th: 'H' },
    lat: 13.75,
    lng: 100.5,
    totalBeds: 10,
    nicuTotal: 0,
    typicalWaitMin: 20,
    specialists: [],
    status: { beds: 5, nicu: 0, ageMin: 5, conflict: false, depts: {}, equip: {}, oncall: {}, rules: { minBeds: 2 }, ...status },
  };
  return { hospital, km: 1, driveMin: 5, score: 6, fails: [], canHelp: true, ...extra };
};

describe('availability', () => {
  const peds = pathways.peds; // needs a bed
  const injury = pathways.injury; // no bed needed

  it('is available when it can help with fresh, clear data and beds', () => {
    expect(availability(row({}), peds, NOW)).toBe('available');
  });

  it('is limited on the last bed, unclear data or stale data', () => {
    expect(availability(row({ beds: 1 }), peds, NOW)).toBe('limited');
    expect(availability(row({ conflict: true }), peds, NOW)).toBe('limited');
    expect(availability(row({ ageMin: 45 }), peds, NOW)).toBe('limited');
  });

  it('ignores beds when the need has no bed', () => {
    expect(availability(row({ beds: 0 }), injury, NOW)).toBe('available');
  });

  it('is unavailable when it cannot help', () => {
    expect(availability(row({}, { canHelp: false, fails: [{ kind: 'bed' }] }), peds, NOW)).toBe('unavailable');
  });
});

describe('freshness', () => {
  it('reports minutes while fresh, then stale', () => {
    expect(freshness(row({ ageMin: 5 }), NOW)).toEqual({ kind: 'fresh', minutes: 5 });
    expect(freshness(row({ ageMin: 31 }), NOW)).toEqual({ kind: 'stale' });
  });

  it('uses updatedAt when present', () => {
    expect(freshness(row({ ageMin: undefined, updatedAt: NOW - 12 * 60_000 }), NOW)).toEqual({ kind: 'fresh', minutes: 12 });
  });

  it('is unknown with no time at all', () => {
    expect(freshness(row({ ageMin: undefined }), NOW)).toEqual({ kind: 'unknown' });
  });
});

describe('skipReason', () => {
  const cases: [Failure[], string | null][] = [
    [[{ kind: 'dept', item: 'neuro', state: 'diverting' }], 'notTaking'],
    [[{ kind: 'dept', item: 'obstetrics', state: 'none' }], 'noDepartment'],
    [[{ kind: 'equip', item: 'ct' }], 'cantTreat'],
    [[{ kind: 'oncall', item: 'pediatrician' }], 'noDoctor'],
    [[{ kind: 'bed' }], 'noBed'],
    [[{ kind: 'nicu' }], 'noBed'],
    [[{ kind: 'tooFar' }], 'tooFar'],
    [[], null],
  ];
  it.each(cases)('%j → %s', (fails, reason) => {
    expect(skipReason(fails)).toBe(reason);
  });

  it('prefers the most useful reason when there are several', () => {
    expect(skipReason([{ kind: 'bed' }, { kind: 'dept', item: 'ed', state: 'diverting' }])).toBe('notTaking');
  });
});

describe('skippedNearest', () => {
  it('returns the closest hospital when it cannot help', () => {
    const near = row({}, { km: 1, canHelp: false, fails: [{ kind: 'bed' }] });
    const far = row({}, { km: 5 });
    expect(skippedNearest([far, near])).toBe(near);
  });

  it('returns null when the closest can help, or with no rows', () => {
    expect(skippedNearest([row({}, { km: 1 }), row({}, { km: 5, canHelp: false })])).toBeNull();
    expect(skippedNearest([])).toBeNull();
  });
});
