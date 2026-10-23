import { decisionRows, MAX_ROWS, parseDecisionRows } from '../logic/decisionTable';
import { assessReferral } from '../logic/referral';
import type { CareRequest } from '../logic/types';
import { makeHospital, NOW_MS, ORIGIN } from './generators';

function request(hospitalId: string, changes: Partial<CareRequest> = {}): CareRequest {
  return {
    id: `R-${hospitalId}`,
    type: 'referral',
    hospitalId,
    ownerId: 'doctor',
    needKey: 'stroke',
    etaMin: 10,
    status: 'waiting',
    auto: false,
    patient: { mode: 'ambulance', description: 'synthetic' },
    referralId: 'REF',
    createdAtMs: NOW_MS,
    ...changes,
  };
}

describe('decisionRows', () => {
  const near = makeHospital('near', 2);
  near.status.equip.ct = false;
  const mid = makeHospital('mid', 4);
  const far = makeHospital('far', 7);
  const assessment = assessReferral([far, near, mid], ORIGIN, 'stroke', NOW_MS, 30);

  it('lists every hospital in rank order with reason codes for those that cannot help', () => {
    const rows = decisionRows(assessment.ranked, []);
    expect(rows.map((row) => row.hospitalId)).toEqual(['mid', 'far', 'near']);
    expect(rows[2]).toMatchObject({ canHelp: false, whyNot: ['equip'], reply: 'notAsked' });
    expect(rows.every((row) => !row.chosen)).toBe(true);
  });

  it('shows each reply, rule acceptances, decline reasons and the chosen hospital', () => {
    const rows = decisionRows(
      assessment.ranked,
      [request('mid', { status: 'accepted', auto: true }), request('far', { status: 'declined', reason: 'busy' })],
      'mid',
    );
    expect(rows[0]).toMatchObject({ reply: 'acceptedByRule', chosen: true });
    expect(rows[1]).toMatchObject({ reply: 'declined', declineReason: 'busy', chosen: false });
  });

  it('keeps a stated delay but never the staff note text', () => {
    const rows = decisionRows(assessment.ranked, [request('mid', { status: 'accepted', note: 'Neurologist in surgery, free in about 40 minutes' })]);
    expect(rows[0].delayMin).toBe(40);
    expect(JSON.stringify(rows)).not.toContain('surgery');
  });

  it('uses the latest request when a hospital was asked twice', () => {
    const rows = decisionRows(assessment.ranked, [
      request('mid', { status: 'no_reply', createdAtMs: NOW_MS }),
      request('mid', { id: 'second', status: 'accepted', createdAtMs: NOW_MS + 1 }),
    ]);
    expect(rows[0].reply).toBe('accepted');
  });

  it('keeps every asked hospital and caps the rest', () => {
    const many = Array.from({ length: 15 }, (_, i) => makeHospital(`H${i}`, i + 1));
    const ranked = assessReferral(many, ORIGIN, 'general', NOW_MS).ranked;
    const rows = decisionRows(ranked, [request('H14', { status: 'waiting' })]);
    expect(rows).toHaveLength(MAX_ROWS);
    expect(rows.some((row) => row.hospitalId === 'H14')).toBe(true);
  });

  it('round-trips through the API and drops malformed rows', () => {
    const rows = decisionRows(assessment.ranked, [request('mid', { status: 'accepted' })], 'mid');
    expect(parseDecisionRows(JSON.stringify(rows))).toEqual(rows);
    expect(parseDecisionRows([{ hospitalId: 'x' }, ...rows])).toEqual(rows);
    expect(parseDecisionRows('not json')).toEqual([]);
    expect(parseDecisionRows(null)).toEqual([]);
  });
});
