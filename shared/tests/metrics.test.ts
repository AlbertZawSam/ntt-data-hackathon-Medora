import { freshItemShare, placementInsideWindow, referralMetrics, requestMetrics } from '../logic/metrics';
import type { CareRequest, Referral } from '../logic/types';
import { NOW_MS, minutesAgo, openStatus } from './generators';

const req = (over: Partial<CareRequest>): CareRequest =>
  ({ id: 'r', type: 'visit', hospitalId: 'H1', ownerId: 'p', needKey: 'general', etaMin: 10, status: 'accepted', auto: false, patient: { mode: 'car', description: '' }, createdAtMs: 1000, ...over }) as CareRequest;
const ref = (over: Partial<Referral>): Referral =>
  ({ id: 'f', fromHospitalId: 'H1', ownerId: 'd', text: '', lang: 'en', status: 'confirmed', mode: 'ai', requestIds: [], startedAtMs: 0, ...over }) as Referral;

describe('requestMetrics', () => {
  it('reports the median time to accept and the share the hospital could treat', () => {
    const m = requestMetrics([
      req({ id: '1', acceptedAtMs: 11_000, couldTreat: true }),
      req({ id: '2', acceptedAtMs: 31_000, couldTreat: false }),
      req({ id: '3', acceptedAtMs: 21_000, couldTreat: true }),
      req({ id: '4', status: 'waiting' }),
      req({ id: '5', referralId: 'f1', acceptedAtMs: 2000, couldTreat: true }), // a referral request: not counted here
    ]);
    expect(m).toEqual({ accepted: 3, total: 4, medianSecondsToAccept: 20, couldTreatShare: 2 / 3 });
  });
  it('returns nulls when nothing was accepted', () => {
    expect(requestMetrics([req({ status: 'waiting' })])).toEqual({ accepted: 0, total: 1, medianSecondsToAccept: null, couldTreatShare: null });
  });
});

describe('referralMetrics', () => {
  const stroke = { pathway: 'stroke', chosenId: 'H2', recommendedAtMs: 60_000, elapsedSec: 60 };
  it('knows when placement fits the treatment window', () => {
    // stroke window 270, prep 30: 20 onset + 1 elapsed + 25 drive + 30 prep = 76 <= 270
    expect(placementInsideWindow(ref({ ...stroke, onsetMin: 20, etaMin: 25 }))).toBe(true);
    expect(placementInsideWindow(ref({ ...stroke, onsetMin: 240, etaMin: 25 }))).toBe(false);
  });
  it('leaves out pathways with no window or no onset', () => {
    expect(placementInsideWindow(ref({ ...stroke, pathway: 'preterm', onsetMin: 10, etaMin: 5 }))).toBeNull();
    expect(placementInsideWindow(ref({ ...stroke, etaMin: 5 }))).toBeNull();
  });
  it('summarises recommended referrals', () => {
    const m = referralMetrics([
      ref({ ...stroke, id: 'a', onsetMin: 20, etaMin: 25 }),
      ref({ ...stroke, id: 'b', onsetMin: 240, etaMin: 25, recommendedAtMs: 120_000 }),
      ref({ id: 'c', status: 'failed' }),
    ]);
    expect(m).toEqual({ recommended: 2, total: 3, medianSecondsToRecommendation: 90, insideWindowShare: 0.5 });
  });
});

describe('freshItemShare', () => {
  it('is the share of items changed within 30 minutes, ignoring confirmations', () => {
    const status = openStatus({
      meta: { beds: { unit: 'ward', at: minutesAgo(5) }, icu: { unit: 'icu', at: minutesAgo(90) }, confirm: { unit: 'ward', at: minutesAgo(1) } },
    });
    expect(freshItemShare(status, NOW_MS)).toBe(0.5);
  });
  it('is null when nothing was ever updated', () => {
    expect(freshItemShare(openStatus({ meta: {} }), NOW_MS)).toBeNull();
  });
});
