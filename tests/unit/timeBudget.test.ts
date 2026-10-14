import { describe, expect, it } from 'vitest';

import { pathways } from '../../src/logic/data';
import { askPolicy, remainingWindow, tooFar } from '../../src/logic/timeBudget';

const { stroke, stemi, preterm, peds, maternity, general } = pathways;

describe('remainingWindow', () => {
  it('is the window minus the time since onset', () => {
    expect(remainingWindow(stroke, 60)).toEqual({ remainingMin: 210, expired: false });
    expect(remainingWindow(stemi, 45)).toEqual({ remainingMin: 75, expired: false });
  });

  it('assumes the whole window is left when onset is not given', () => {
    expect(remainingWindow(stroke)).toEqual({ remainingMin: 270, expired: false });
    expect(remainingWindow(stroke, null)).toEqual({ remainingMin: 270, expired: false });
  });

  it('treats a negative onset as zero', () => {
    expect(remainingWindow(stroke, -10).remainingMin).toBe(270);
  });

  it('stops at zero and marks the window expired once it has passed', () => {
    expect(remainingWindow(stemi, 120)).toEqual({ remainingMin: 0, expired: true });
    expect(remainingWindow(stemi, 200)).toEqual({ remainingMin: 0, expired: true });
    expect(remainingWindow(stemi, 119)).toEqual({ remainingMin: 1, expired: false });
  });

  it('has no window for pathways without one', () => {
    for (const p of [preterm, peds, maternity, general]) {
      expect(remainingWindow(p, 500)).toEqual({ remainingMin: null, expired: false });
    }
  });
});

describe('tooFar', () => {
  it('fails when drive plus preparation is over the time left', () => {
    // Stroke preparation is 30 minutes.
    expect(tooFar(40, stroke, 70)).toBe(false);
    expect(tooFar(40, stroke, 69)).toBe(true);
  });

  it('allows a drive that exactly fits', () => {
    expect(tooFar(45, stemi, 75)).toBe(false);
  });

  it('never fails when there is no window', () => {
    expect(tooFar(500, preterm, null)).toBe(false);
  });

  it('fails every hospital once the window has passed', () => {
    expect(tooFar(0, stemi, remainingWindow(stemi, 130).remainingMin)).toBe(true);
  });
});

describe('askPolicy', () => {
  it('asks one hospital and waits 60 seconds when not urgent', () => {
    expect(askPolicy(peds, null)).toEqual({ count: 1, waitSec: 60 });
  });

  it('asks three at once and waits 30 seconds with under 90 minutes left', () => {
    expect(askPolicy(stemi, 89)).toEqual({ count: 3, waitSec: 30 });
    expect(askPolicy(stroke, 0)).toEqual({ count: 3, waitSec: 30 });
  });

  it('asks two at once and waits 45 seconds for other urgent cases', () => {
    expect(askPolicy(stemi, 90)).toEqual({ count: 2, waitSec: 45 });
    expect(askPolicy(stroke, 210)).toEqual({ count: 2, waitSec: 45 });
    expect(askPolicy(preterm, null)).toEqual({ count: 2, waitSec: 45 });
  });

  it('matches the demo cases', () => {
    // Heart attack 45 minutes ago: 75 minutes left.
    expect(askPolicy(stemi, remainingWindow(stemi, 45).remainingMin)).toEqual({ count: 3, waitSec: 30 });
    // Stroke 60 minutes ago: 210 minutes left.
    expect(askPolicy(stroke, remainingWindow(stroke, 60).remainingMin)).toEqual({ count: 2, waitSec: 45 });
  });
});
