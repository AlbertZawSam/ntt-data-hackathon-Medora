import { afterEach, describe, expect, it } from 'vitest';

import { hospitals, pathways, scoring } from '../../src/logic/data';
import {
  bangkokMinutes,
  dataAgeMin,
  distanceKm,
  driveEstimate,
  evaluate,
  failsFor,
  score,
  traffic,
} from '../../src/logic/ranking';
import { remainingWindow } from '../../src/logic/timeBudget';
import type { Hospital, HospitalStatus, PathwayKey } from '../../src/logic/types';

// A time in Bangkok (UTC+7) on a fixed day.
const bkk = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 14, h - 7, m));
const NOON = bkk(12);

const goodStatus = (): HospitalStatus => ({
  beds: 5,
  nicu: 2,
  ageMin: 5,
  conflict: false,
  depts: { ed: 'open', neuro: 'open', cardio: 'open', obstetrics: 'open', pediatrics: 'open', ortho: 'open' },
  equip: { ct: true, cathlab: true },
  oncall: { er: true, neurologist: true, cardiologist: true, obstetrician: true, pediatrician: true },
  rules: { minBeds: 2 },
});

const makeHospital = (id: string, lat: number, lng: number, status: Partial<HospitalStatus> = {}, wait = 20): Hospital => ({
  id,
  name: { en: id, th: id },
  lat,
  lng,
  totalBeds: 20,
  nicuTotal: 2,
  typicalWaitMin: wait,
  status: { ...goodStatus(), ...status },
  specialists: [],
});

describe('bangkokMinutes and traffic', () => {
  it.each([
    [6, 0, 'normal'],
    [6, 59, 'normal'],
    [7, 0, 'rush'],
    [9, 29, 'rush'],
    [9, 30, 'normal'],
    [16, 29, 'normal'],
    [16, 30, 'rush'],
    [19, 29, 'rush'],
    [19, 30, 'normal'],
    [21, 59, 'normal'],
    [22, 0, 'night'],
    [0, 0, 'night'],
    [5, 59, 'night'],
  ] as const)('%i:%i Bangkok time is %s', (h, m, kind) => {
    expect(traffic(bkk(h, m)).kind).toBe(kind);
  });

  it('uses 15, 25 and 40 km/h', () => {
    expect(traffic(bkk(8)).kmh).toBe(15);
    expect(traffic(NOON).kmh).toBe(25);
    expect(traffic(bkk(23)).kmh).toBe(40);
  });

  describe('ignores the device time zone', () => {
    const original = process.env.TZ;
    afterEach(() => {
      process.env.TZ = original;
    });

    it.each(['UTC', 'America/New_York', 'Asia/Tokyo'])('in %s', (tz) => {
      process.env.TZ = tz;
      // 01:00 UTC is 08:00 in Bangkok.
      const at = new Date('2026-10-14T01:00:00Z');
      expect(bangkokMinutes(at)).toBe(8 * 60);
      expect(traffic(at).kind).toBe('rush');
    });
  });
});

describe('distanceKm and driveEstimate', () => {
  const a = { lat: 13.7, lng: 100.5 };
  const b = { lat: 13.8, lng: 100.5 };

  it('measures 0.1° of latitude as about 11.1 km', () => {
    expect(distanceKm(a, b)).toBeCloseTo(11.12, 1);
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 9);
    expect(distanceKm(a, a)).toBe(0);
  });

  it('adds 35% for roads and uses the traffic speed', () => {
    expect(driveEstimate(a, b, { at: NOON })).toMatchObject({ min: 36, traffic: { kind: 'normal' } });
    expect(driveEstimate(a, b, { at: NOON }).km).toBeCloseTo(15.01, 1);
    expect(driveEstimate(a, b, { at: bkk(8) }).min).toBe(60);
    expect(driveEstimate(a, b, { at: bkk(23) }).min).toBe(23);
  });

  it('makes an ambulance 1.5× faster', () => {
    expect(driveEstimate(a, b, { at: NOON, ambulance: true }).min).toBe(24);
  });

  it('is zero minutes to the same place', () => {
    expect(driveEstimate(a, a, { at: NOON }).min).toBe(0);
  });
});

describe('failsFor', () => {
  const stroke = pathways.stroke;

  it('passes a hospital that has everything', () => {
    expect(failsFor(goodStatus(), stroke)).toEqual([]);
  });

  it('fails a diverting department', () => {
    const s = { ...goodStatus(), depts: { ...goodStatus().depts, neuro: 'diverting' as const } };
    expect(failsFor(s, stroke)).toEqual([{ kind: 'dept', item: 'neuro', state: 'diverting' }]);
  });

  it('fails a department the hospital does not have', () => {
    const { neuro: _, ...depts } = goodStatus().depts;
    expect(failsFor({ ...goodStatus(), depts }, stroke)).toEqual([{ kind: 'dept', item: 'neuro', state: 'none' }]);
  });

  it('fails equipment that is down or missing', () => {
    expect(failsFor({ ...goodStatus(), equip: { ct: false } }, stroke)).toEqual([{ kind: 'equip', item: 'ct' }]);
    expect(failsFor({ ...goodStatus(), equip: {} }, stroke)).toEqual([{ kind: 'equip', item: 'ct' }]);
  });

  it('fails a required doctor who is off duty or not listed', () => {
    const off = { ...goodStatus(), oncall: { ...goodStatus().oncall, neurologist: false } };
    expect(failsFor(off, stroke)).toEqual([{ kind: 'oncall', item: 'neurologist' }]);
    const { neurologist: _, ...oncall } = goodStatus().oncall;
    expect(failsFor({ ...goodStatus(), oncall }, stroke)).toEqual([{ kind: 'oncall', item: 'neurologist' }]);
  });

  it('fails no free bed only when the pathway needs one', () => {
    expect(failsFor({ ...goodStatus(), beds: 0 }, stroke)).toEqual([{ kind: 'bed' }]);
    expect(failsFor({ ...goodStatus(), beds: 0 }, pathways.general)).toEqual([]);
  });

  it('fails no NICU cot only when the pathway needs one', () => {
    expect(failsFor({ ...goodStatus(), nicu: 0 }, pathways.preterm)).toEqual([{ kind: 'nicu' }]);
    expect(failsFor({ ...goodStatus(), nicu: 0 }, stroke)).toEqual([]);
  });

  it('lists every failure, not just the first', () => {
    const s: HospitalStatus = { ...goodStatus(), depts: { ed: 'open' }, equip: {}, oncall: { er: true }, beds: 0 };
    expect(failsFor(s, stroke).map((f) => f.kind)).toEqual(['dept', 'equip', 'oncall', 'bed']);
  });

  it('does not require the preferred department', () => {
    const { ortho: _, ...depts } = goodStatus().depts;
    expect(failsFor({ ...goodStatus(), depts }, pathways.injury)).toEqual([]);
  });

  // Worked out separately from the raw JSON, not with this code.
  const expectedCanHelp: Record<PathwayKey, string[]> = {
    stroke: ['H02', 'H07'],
    stemi: ['H01', 'H02', 'H05', 'H07'],
    preterm: ['H03', 'H05'],
    peds: ['H01', 'H03', 'H05', 'H08'],
    maternity: ['H03', 'H04', 'H05', 'H10'],
    injury: ['H01', 'H02', 'H03', 'H04', 'H05', 'H06', 'H07', 'H08', 'H09', 'H10'],
    general: ['H01', 'H02', 'H03', 'H04', 'H05', 'H06', 'H07', 'H08', 'H09', 'H10'],
  };

  it.each(Object.entries(expectedCanHelp))('seed data: %s can be handled by %j', (key, ids) => {
    const pathway = pathways[key as PathwayKey];
    expect(hospitals.filter((h) => failsFor(h.status, pathway).length === 0).map((h) => h.id)).toEqual(ids);
  });

  it('seed data: explains the demo stroke skips', () => {
    const byId = (id: string) => failsFor(hospitals.find((h) => h.id === id)!.status, stroke);
    expect(byId('H05')).toEqual([{ kind: 'dept', item: 'neuro', state: 'diverting' }]);
    expect(byId('H09')).toEqual([{ kind: 'oncall', item: 'neurologist' }]);
  });
});

describe('dataAgeMin', () => {
  const now = NOON.getTime();

  it('uses updatedAt when present', () => {
    expect(dataAgeMin({ ...goodStatus(), updatedAt: now - 31 * 60_000 }, now)).toBe(31);
  });

  it('treats a clock that is ahead as fresh, not negative', () => {
    expect(dataAgeMin({ ...goodStatus(), updatedAt: now + 60_000 }, now)).toBe(0);
  });

  it('falls back to the seeded ageMin, and to stale when neither is set', () => {
    expect(dataAgeMin({ ...goodStatus(), ageMin: 12 }, now)).toBe(12);
    expect(dataAgeMin({ ...goodStatus(), ageMin: undefined }, now)).toBe(Infinity);
  });
});

describe('score', () => {
  const now = NOON.getTime();
  const h = (status: Partial<HospitalStatus> = {}) => makeHospital('X', 13.7, 100.5, status, 20);

  it('is drive time plus wait × 0.2', () => {
    expect(score(h(), pathways.stroke, 10, now)).toBe(14);
  });

  it('adds 10 when data is over 30 minutes old', () => {
    expect(score(h({ ageMin: 30 }), pathways.stroke, 10, now)).toBe(14);
    expect(score(h({ ageMin: 31 }), pathways.stroke, 10, now)).toBe(24);
    expect(score(h({ ageMin: undefined, updatedAt: now - 45 * 60_000 }), pathways.stroke, 10, now)).toBe(24);
  });

  it('adds 12 when data is marked unclear', () => {
    expect(score(h({ conflict: true }), pathways.stroke, 10, now)).toBe(26);
  });

  it('adds 3 for the last free bed only when a bed is needed', () => {
    expect(score(h({ beds: 1 }), pathways.stroke, 10, now)).toBe(17);
    expect(score(h({ beds: 2 }), pathways.stroke, 10, now)).toBe(14);
    expect(score(h({ beds: 1 }), pathways.general, 10, now)).toBe(14);
  });

  it('takes 3 off when the preferred department is open', () => {
    expect(score(h(), pathways.injury, 10, now)).toBe(11);
    expect(score(h({ depts: { ed: 'open', ortho: 'diverting' } }), pathways.injury, 10, now)).toBe(14);
  });

  it('adds every penalty together', () => {
    expect(score(h({ ageMin: 60, conflict: true, beds: 1 }), pathways.stroke, 10, now)).toBe(14 + 10 + 12 + 3);
  });

  it('uses the weights it is given', () => {
    expect(score(h({ conflict: true }), pathways.stroke, 10, now, { ...scoring, waitWeight: 1, unclearPenalty: 0 })).toBe(30);
  });
});

describe('evaluate', () => {
  const origin = { lat: 13.7, lng: 100.5 };

  it('puts hospitals that can help first, best score first, then the rest nearest first', () => {
    const list = [
      makeHospital('FAR_FAIL', 13.9, 100.5, { beds: 0 }),
      makeHospital('NEAR_FAIL', 13.71, 100.5, { depts: { ed: 'open' } }),
      makeHospital('MID_OK', 13.75, 100.5),
      makeHospital('NEAR_UNCLEAR', 13.72, 100.5, { conflict: true }),
    ];
    const rows = evaluate(list, pathways.stroke, origin, { at: NOON });
    expect(rows.map((r) => r.hospital.id)).toEqual(['MID_OK', 'NEAR_UNCLEAR', 'NEAR_FAIL', 'FAR_FAIL']);
    expect(rows.map((r) => r.canHelp)).toEqual([true, true, false, false]);
    expect(rows[0].score).toBeLessThan(rows[1].score);
  });

  it('returns drive time, distance and failures for each hospital', () => {
    const [row] = evaluate([makeHospital('A', 13.8, 100.5)], pathways.stroke, origin, { at: NOON });
    expect(row).toMatchObject({ driveMin: 36, fails: [], canHelp: true, score: 36 + 20 * 0.2 });
    expect(row.km).toBeCloseTo(15.01, 1);
  });

  it('passes the ambulance option to the drive estimate', () => {
    const [row] = evaluate([makeHospital('A', 13.8, 100.5)], pathways.stroke, origin, { at: NOON, ambulance: true });
    expect(row.driveMin).toBe(24);
  });

  it('marks a hospital too far when drive + preparation exceeds the time left', () => {
    // 36 minutes' drive + 30 minutes' stroke preparation = 66.
    const near = makeHospital('NEAR', 13.75, 100.5);
    const far = makeHospital('FAR', 13.8, 100.5);
    const rows = evaluate([far, near], pathways.stroke, origin, { at: NOON, window: remainingWindow(pathways.stroke, 210) });
    expect(rows.map((r) => [r.hospital.id, r.canHelp])).toEqual([
      ['NEAR', true],
      ['FAR', false],
    ]);
    expect(rows[1].fails).toEqual([{ kind: 'tooFar' }]);
    expect(evaluate([far], pathways.stroke, origin, { at: NOON, window: remainingWindow(pathways.stroke, 204) })[0].canHelp).toBe(true);
  });

  it('skips the too-far check without a time budget', () => {
    const far = makeHospital('FAR', 13.95, 100.5);
    expect(evaluate([far], pathways.stroke, origin, { at: NOON })[0].canHelp).toBe(true);
    expect(evaluate([far], pathways.stroke, origin, { at: NOON, window: null })[0].canHelp).toBe(true);
  });

  it('skips the too-far check once the window has passed', () => {
    const far = makeHospital('FAR', 13.95, 100.5);
    const rows = evaluate([far], pathways.stroke, origin, { at: NOON, window: remainingWindow(pathways.stroke, 300) });
    expect(rows[0]).toMatchObject({ canHelp: true, fails: [] });
  });

  it('adds too far after the status failures', () => {
    const window = remainingWindow(pathways.stroke, 260);
    const row = evaluate([makeHospital('A', 13.8, 100.5, { beds: 0 })], pathways.stroke, origin, { at: NOON, window })[0];
    expect(row.fails).toEqual([{ kind: 'bed' }, { kind: 'tooFar' }]);
  });

  it('breaks ties by distance, then by ID', () => {
    const list = [makeHospital('B', 13.8, 100.5), makeHospital('A', 13.8, 100.5)];
    expect(evaluate(list, pathways.stroke, origin, { at: NOON }).map((r) => r.hospital.id)).toEqual(['A', 'B']);
  });

  it('does not change the list it is given', () => {
    const list = [makeHospital('B', 13.9, 100.5), makeHospital('A', 13.71, 100.5)];
    evaluate(list, pathways.stroke, origin, { at: NOON });
    expect(list.map((h) => h.id)).toEqual(['B', 'A']);
  });

  it('seed data: stroke from Siam ranks only H02 and H07 as able to help, and lists all ten', () => {
    const siam = { lat: 13.7456, lng: 100.5347 };
    const rows = evaluate(hospitals, pathways.stroke, siam, { at: NOON });
    expect(rows).toHaveLength(10);
    expect(rows.filter((r) => r.canHelp).map((r) => r.hospital.id)).toEqual(['H02', 'H07']);
    const skipped = rows.filter((r) => !r.canHelp);
    expect(skipped.map((r) => r.km)).toEqual([...skipped.map((r) => r.km)].sort((x, y) => x - y));
  });
});
