import fc from 'fast-check';
import data from '../data/red_flags.json';
import { PATHWAYS } from '../logic/pathways';
import { classifyNeed, driveEstimate, evaluate, failsFor, score, traffic } from '../logic/ranking';
import type { RankableHospital } from '../logic/types';
import { arbHospital, arbPathway, arbStatus, makeHospital, minutesAgo, NOW_MS, openStatus, ORIGIN } from './generators';

const hospital = (overrides: Partial<RankableHospital> = {}): RankableHospital => ({
  id: 'X',
  name: { en: 'X', th: 'X' },
  lat: ORIGIN.lat,
  lng: ORIGIN.lng,
  typicalWaitMin: 30,
  status: openStatus(),
  ...overrides,
});

describe('traffic and driveEstimate', () => {
  it('uses Bangkok time for rush hour and night', () => {
    expect(traffic(new Date('2026-10-13T01:00:00Z'))).toBe('rush'); // 08:00 Bangkok
    expect(traffic(new Date('2026-10-13T02:30:00Z'))).toBe('normal'); // 09:30 Bangkok
    expect(traffic(new Date('2026-10-13T10:00:00Z'))).toBe('rush'); // 17:00 Bangkok
    expect(traffic(new Date('2026-10-13T15:30:00Z'))).toBe('night'); // 22:30 Bangkok
    expect(traffic(new Date('2026-10-12T23:00:00Z'))).toBe('normal'); // 06:00 Bangkok
  });

  it('applies road factor, speed band and ambulance factor', () => {
    expect(driveEstimate(10, new Date('2026-10-13T04:00:00Z'))).toBeCloseTo(32.4); // 25 km/h
    expect(driveEstimate(10, new Date('2026-10-13T01:00:00Z'))).toBeCloseTo(54); // 15 km/h
    expect(driveEstimate(10, new Date('2026-10-13T16:00:00Z'))).toBeCloseTo(20.25); // 40 km/h
    expect(driveEstimate(10, new Date('2026-10-13T04:00:00Z'), true)).toBeCloseTo(21.6); // 37.5 km/h
  });
});

describe('failsFor', () => {
  const stroke = PATHWAYS.stroke;

  it('passes a fully open hospital for every pathway', () => {
    for (const p of Object.values(PATHWAYS)) expect(failsFor(openStatus(), p)).toEqual([]);
  });

  it('fails a diverting or missing department', () => {
    const s = openStatus();
    s.depts.neuro = 'diverting';
    delete s.depts.ed;
    expect(failsFor(s, stroke)).toEqual([
      { kind: 'dept', item: 'ed' },
      { kind: 'dept', item: 'neuro' },
    ]);
  });

  it('fails broken equipment and missing doctors', () => {
    const s = openStatus();
    s.equip.ct = false;
    s.oncall.neurologist = false;
    expect(failsFor(s, stroke)).toEqual([
      { kind: 'equip', item: 'ct' },
      { kind: 'onDuty', item: 'neurologist' },
    ]);
  });

  it('fails no free bed only when the pathway needs one', () => {
    expect(failsFor(openStatus({ beds: 0 }), stroke)).toEqual([{ kind: 'beds' }]);
    expect(failsFor(openStatus({ beds: 0 }), PATHWAYS.general)).toEqual([]);
  });

  it('fails no NICU cot for preterm only', () => {
    expect(failsFor(openStatus({ nicu: 0 }), PATHWAYS.preterm)).toEqual([{ kind: 'nicu' }]);
    expect(failsFor(openStatus({ nicu: 0 }), PATHWAYS.peds)).toEqual([]);
  });
});

describe('score', () => {
  it('adds every penalty', () => {
    const h = hospital({
      status: openStatus({ beds: 1, conflict: true, updatedAt: new Date(NOW_MS - 40 * 60_000).toISOString() }),
    });
    // 10 drive + 6 wait + 10 stale + 12 unclear + 3 low beds
    expect(score(h, PATHWAYS.stroke, 10, NOW_MS)).toBeCloseTo(41);
  });

  it('gives the preferred-department bonus', () => {
    // 10 drive + 6 wait − 3 ortho open
    expect(score(hospital(), PATHWAYS.injury, 10, NOW_MS)).toBeCloseTo(13);
    const noOrtho = openStatus();
    delete noOrtho.depts.ortho;
    expect(score(hospital({ status: noOrtho }), PATHWAYS.injury, 10, NOW_MS)).toBeCloseTo(16);
  });

  it('does not count data exactly 30 minutes old as stale', () => {
    const h = hospital({ status: openStatus({ updatedAt: new Date(NOW_MS - 30 * 60_000).toISOString() }) });
    expect(score(h, PATHWAYS.general, 10, NOW_MS)).toBeCloseTo(16);
  });
});

describe('evaluate', () => {
  const opts = { nowMs: NOW_MS };

  it('ranks hospitals that can help first, lowest score first', () => {
    const near = makeHospital('near', 1);
    const far = makeHospital('far', 8);
    const closed = makeHospital('closed', 0.5, { depts: { ed: 'diverting' } });
    const ranked = evaluate([far, closed, near], PATHWAYS.general, ORIGIN, opts);
    expect(ranked.map((r) => r.hospital.id)).toEqual(['near', 'far', 'closed']);
    expect(ranked[2]).toMatchObject({ eligible: false, score: Infinity });
  });

  it.each(Object.keys(PATHWAYS) as Array<keyof typeof PATHWAYS>)('keeps the order valid for %s', (key) => {
    const hospitals = [1, 3, 5, 7].map((km, i) => makeHospital(`h${i}`, km, { beds: i, conflict: i === 2 }));
    const ranked = evaluate(hospitals, PATHWAYS[key], ORIGIN, opts);
    expect(ranked).toHaveLength(hospitals.length);
    const eligible = ranked.filter((r) => r.eligible);
    expect(ranked.slice(0, eligible.length)).toEqual(eligible);
    for (let i = 1; i < eligible.length; i++) expect(eligible[i].score).toBeGreaterThanOrEqual(eligible[i - 1].score);
  });

  it('excludes a hospital whose neurology is diverting from stroke, with the reason', () => {
    const status = openStatus();
    status.depts.neuro = 'diverting';
    const [r] = evaluate([makeHospital('h', 2, status)], PATHWAYS.stroke, ORIGIN, opts);
    expect(r.eligible).toBe(false);
    expect(r.failures).toContainEqual({ kind: 'dept', item: 'neuro' });
  });

  it('marks data over 30 minutes old as stale', () => {
    const ranked = evaluate(
      [makeHospital('old', 2, { updatedAt: minutesAgo(130) }), makeHospital('fresh', 2, { updatedAt: minutesAgo(8) })],
      PATHWAYS.general,
      ORIGIN,
      opts,
    );
    expect(ranked.find((r) => r.hospital.id === 'old')?.stale).toBe(true);
    expect(ranked.find((r) => r.hospital.id === 'fresh')?.stale).toBe(false);
  });

  it('uses route-matrix drive times when given', () => {
    const [r] = evaluate([makeHospital('h', 2)], PATHWAYS.general, ORIGIN, { ...opts, driveMinById: { h: 99 } });
    expect(r.driveMin).toBe(99);
  });

  it('marks every hospital too far once the stroke window is nearly over', () => {
    const ranked = evaluate([makeHospital('a', 1), makeHospital('b', 5)], PATHWAYS.stroke, ORIGIN, { ...opts, onsetMin: 265 });
    expect(ranked.every((r) => !r.eligible && r.failures.some((f) => f.kind === 'tooFar'))).toBe(true);
  });
});

describe('ranking properties', () => {
  // Feature: hospital-referral-app, Property 3: ranking excludes ineligible hospitals
  it('Property 3: no hospital with failures is ever eligible or ranked above an eligible one', () => {
    fc.assert(
      fc.property(fc.array(arbHospital, { maxLength: 12 }), arbPathway, (hospitals, pathway) => {
        const ranked = evaluate(hospitals, pathway, ORIGIN, { nowMs: NOW_MS });
        let seenIneligible = false;
        for (const r of ranked) {
          const fails = failsFor(r.hospital.status, pathway);
          if (fails.length > 0) expect(r.eligible).toBe(false);
          if (!r.eligible) seenIneligible = true;
          else expect(seenIneligible).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });

  // Feature: hospital-referral-app, Property 4: score monotonicity on drive time
  it('Property 4: with everything else equal, a shorter drive scores lower', () => {
    fc.assert(
      fc.property(
        arbStatus,
        arbPathway,
        fc.integer({ min: 0, max: 120 }),
        fc.double({ min: 0, max: 120, noNaN: true }),
        fc.double({ min: 0.01, max: 120, noNaN: true }),
        (status, pathway, wait, drive, extra) => {
          const h = hospital({ status, typicalWaitMin: wait });
          expect(score(h, pathway, drive, NOW_MS)).toBeLessThan(score(h, pathway, drive + extra, NOW_MS));
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('classifyNeed', () => {
  it.each([
    ["I'm 30 weeks pregnant with mild cramps", 'maternity'],
    ['ตั้งครรภ์ 8 เดือน น้ำเดิน', 'maternity'],
    ['My 6-year-old has a 39°C fever', 'child'],
    ['ลูกอายุ 6 ขวบ มีไข้ 39 องศา', 'child'],
    ["Twisted my ankle, it's swollen", 'injury'],
    ['ข้อเท้าแพลง บวมมาก', 'injury'],
    ['I have a bad headache and nausea', 'general'],
    ['ปวดท้องมาก', 'general'],
  ])('"%s" → %s', (text, need) => {
    expect(classifyNeed(text)).toBe(need);
  });

  it('classifies every safe example from red_flags.json', () => {
    for (const text of data.safeExamples) expect(classifyNeed(text)).not.toBe('general');
  });
});
