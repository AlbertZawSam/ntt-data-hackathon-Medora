import fc from 'fast-check';
import { PATHWAYS } from '../logic/pathways';
import { evaluate } from '../logic/ranking';
import { askPolicy, remainingWindow, tooFar } from '../logic/timeBudget';
import { arbHospital, NOW_MS, ORIGIN } from './generators';

describe('remainingWindow', () => {
  it('subtracts onset from the window', () => {
    expect(remainingWindow(PATHWAYS.stroke, 0)).toBe(270);
    expect(remainingWindow(PATHWAYS.stemi, 100)).toBe(20);
  });

  it('goes negative when onset is past the window', () => {
    expect(remainingWindow(PATHWAYS.stemi, 150)).toBe(-30);
  });

  it('is unlimited for pathways without a window', () => {
    expect(remainingWindow(PATHWAYS.preterm, 500)).toBe(Infinity);
  });
});

describe('tooFar', () => {
  it('compares drive plus prep with the time left', () => {
    expect(tooFar(20, 30, 50)).toBe(false);
    expect(tooFar(21, 30, 50)).toBe(true);
  });

  it('is always too far once the window has passed', () => {
    expect(tooFar(0, 0, -1)).toBe(true);
  });

  it('never applies without a window', () => {
    expect(tooFar(999, 999, Infinity)).toBe(false);
  });
});

describe('askPolicy', () => {
  it('asks one hospital for non-urgent pathways', () => {
    expect(askPolicy(PATHWAYS.peds, Infinity)).toEqual({ count: 1, waitSeconds: 60 });
  });

  it('asks three at once when under 90 minutes are left', () => {
    expect(askPolicy(PATHWAYS.stemi, 89)).toEqual({ count: 3, waitSeconds: 30 });
  });

  it('asks two at once for other urgent cases', () => {
    expect(askPolicy(PATHWAYS.stroke, 90)).toEqual({ count: 2, waitSeconds: 45 });
    expect(askPolicy(PATHWAYS.preterm, Infinity)).toEqual({ count: 2, waitSeconds: 45 });
  });
});

// Feature: hospital-referral-app, Property 6: window constraint enforcement
describe('Property 6: window constraint enforcement', () => {
  it('no hospital that is too far is ever eligible', () => {
    fc.assert(
      fc.property(
        fc.array(arbHospital, { maxLength: 10 }),
        fc.constantFrom(PATHWAYS.stroke, PATHWAYS.stemi),
        fc.integer({ min: 0, max: 300 }),
        (hospitals, pathway, onsetMin) => {
          const remaining = remainingWindow(pathway, onsetMin);
          for (const r of evaluate(hospitals, pathway, ORIGIN, { nowMs: NOW_MS, onsetMin })) {
            if (tooFar(r.driveMin, pathway.prepMin, remaining)) {
              expect(r.eligible).toBe(false);
              expect(r.failures).toContainEqual({ kind: 'tooFar' });
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
