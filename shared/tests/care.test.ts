import { PATHWAYS } from '../logic/pathways';
import { evaluate } from '../logic/ranking';
import {
  ARRIVAL_MODES,
  DECLINE_REASONS,
  NO_REPLY_MS,
  UNDO_WINDOW_MS,
  decideNewRequest,
  isDeclineReason,
  toPublicHospital,
  transition,
  undoSecondsLeft,
  validateRequestInput,
} from '../logic/care';
import { NOW_MS, ORIGIN, minutesAgo, openStatus } from './generators';
import type { CareRequest } from '../logic/types';

const valid = { hospitalId: 'H-1', needKey: 'general', etaMin: 20, mode: 'car', description: 'Fever for two days' } as const;

describe('validateRequestInput', () => {
  it('accepts a complete request and trims optional fields', () => {
    const r = validateRequestInput({ ...valid, name: '  Somchai   P ', phone: '081 234 5678' });
    expect(r).toEqual({ ok: true, value: { ...valid, name: 'Somchai P', phone: '081 234 5678' } });
  });
  it.each([
    [{ hospitalId: '' }, 'hospital'],
    [{ needKey: 'cancer' }, 'need'],
    [{ etaMin: -1 }, 'eta'],
    [{ mode: 'boat' }, 'mode'],
    [{ mode: 'taxi' }, 'mode'],
    [{ description: '   ' }, 'description'],
    [{ description: 'x'.repeat(1001) }, 'description'],
    [{ phone: 'call me' }, 'phone'],
  ])('refuses %j', (patch, issue) => {
    expect(validateRequestInput({ ...valid, ...patch })).toEqual({ ok: false, issue });
  });
  it('offers car, ambulance, bike and walking, and accepts each of them', () => {
    expect([...ARRIVAL_MODES]).toEqual(['car', 'ambulance', 'bike', 'walking']);
    for (const mode of ARRIVAL_MODES) expect(validateRequestInput({ ...valid, mode })).toMatchObject({ ok: true, value: { mode } });
  });
});

describe('decideNewRequest', () => {
  it('accepts a visit when the visit rule is on, with a 60 second undo window', () => {
    const d = decideNewRequest(openStatus({ rules: { visit: true, minBeds: 1 } }), 'general', NOW_MS);
    expect(d).toEqual({ status: 'accepted', auto: true, reason: 'accepted_by_rule', overrideUntil: NOW_MS + UNDO_WINDOW_MS });
  });
  it('waits for staff when no rule applies', () => {
    expect(decideNewRequest(openStatus(), 'general', NOW_MS)).toEqual({ status: 'waiting', auto: false });
  });
  it('uses the pathway rule for a child need', () => {
    expect(decideNewRequest(openStatus({ rules: { peds: true, minBeds: 1 } }), 'child', NOW_MS).auto).toBe(true);
  });
});

describe('transition', () => {
  const base = { status: 'waiting', auto: false, createdAtMs: NOW_MS } as Pick<CareRequest, 'status' | 'auto' | 'overrideUntil' | 'createdAtMs'>;
  it('staff accept or decline only a waiting request', () => {
    expect(transition(base, 'accept', NOW_MS)).toEqual({ ok: true, status: 'accepted' });
    expect(transition({ ...base, status: 'declined' }, 'accept', NOW_MS)).toEqual({ ok: false, reason: 'bad-state' });
    expect(transition({ ...base, status: 'accepted' }, 'decline', NOW_MS)).toEqual({ ok: false, reason: 'bad-state' });
  });
  it('undo works only on an automatic acceptance inside the window', () => {
    const auto = { ...base, status: 'accepted', auto: true, overrideUntil: NOW_MS + UNDO_WINDOW_MS } as typeof base;
    expect(transition(auto, 'undo', NOW_MS + 59_000)).toEqual({ ok: true, status: 'declined' });
    expect(transition(auto, 'undo', NOW_MS + 61_000)).toEqual({ ok: false, reason: 'undo-expired' });
    expect(transition({ ...auto, auto: false }, 'undo', NOW_MS)).toEqual({ ok: false, reason: 'bad-state' });
  });
  it('marks no reply only after 45 seconds', () => {
    expect(transition(base, 'expire', NOW_MS + NO_REPLY_MS - 1)).toEqual({ ok: false, reason: 'too-early' });
    expect(transition(base, 'expire', NOW_MS + NO_REPLY_MS)).toEqual({ ok: true, status: 'no_reply' });
  });
  it('the patient cannot cancel a finished request', () => {
    expect(transition({ ...base, status: 'completed' }, 'cancel', NOW_MS)).toEqual({ ok: false, reason: 'bad-state' });
    expect(transition({ ...base, status: 'accepted' }, 'cancel', NOW_MS)).toEqual({ ok: true, status: 'cancelled' });
  });
  it('marks arrival only for an accepted request', () => {
    expect(transition({ ...base, status: 'accepted' }, 'arrived', NOW_MS)).toEqual({ ok: true, status: 'completed' });
    expect(transition(base, 'arrived', NOW_MS)).toEqual({ ok: false, reason: 'bad-state' });
  });
  it('counts down the undo window', () => {
    const auto = { status: 'accepted', auto: true, overrideUntil: NOW_MS + 30_500 } as const;
    expect(undoSecondsLeft(auto, NOW_MS)).toBe(31);
    expect(undoSecondsLeft(auto, NOW_MS + 40_000)).toBe(0);
  });
});

describe('toPublicHospital', () => {
  const hospital = (id: string, status = openStatus({ updatedAt: minutesAgo(5) })) => ({
    id, name: { en: id, th: id }, lat: 13.75, lng: 100.53, typicalWaitMin: 10, status,
  });
  const pathway = PATHWAYS.general;
  const rank = (h: ReturnType<typeof hospital>) => evaluate([h], pathway, ORIGIN, { nowMs: NOW_MS })[0];

  it('never exposes counts or equipment', () => {
    const view = toPublicHospital(rank(hospital('A')), pathway);
    expect(Object.keys(view).sort()).toEqual(['distanceKm', 'driveMin', 'id', 'label', 'lat', 'lng', 'name']);
    expect(view.label).toBe('available');
  });
  it('is limited with two or fewer beds, outdated when stale or conflicting, not available when failing', () => {
    const stroke = PATHWAYS.stroke;
    const two = hospital('B', openStatus({ beds: 2, updatedAt: minutesAgo(5) }));
    expect(toPublicHospital(evaluate([two], stroke, ORIGIN, { nowMs: NOW_MS })[0], stroke).label).toBe('limited');
    expect(toPublicHospital(rank(hospital('C', openStatus({ updatedAt: minutesAgo(600) }))), pathway).label).toBe('outdated');
    expect(toPublicHospital(rank(hospital('D', openStatus({ conflict: true, updatedAt: minutesAgo(5) }))), pathway).label).toBe('outdated');
    const none = hospital('E', openStatus({ beds: 0, updatedAt: minutesAgo(5) }));
    expect(toPublicHospital(evaluate([none], stroke, ORIGIN, { nowMs: NOW_MS })[0], stroke)).toMatchObject({ label: 'notAvailable', skipped: ['beds'] });
  });
  it("shows a hospital that can't help as not available even when its data is old or unclear", () => {
    const stroke = PATHWAYS.stroke;
    for (const status of [openStatus({ beds: 0, updatedAt: minutesAgo(600) }), openStatus({ beds: 0, conflict: true, updatedAt: minutesAgo(5) })]) {
      expect(toPublicHospital(evaluate([hospital('F', status)], stroke, ORIGIN, { nowMs: NOW_MS })[0], stroke).label).toBe('notAvailable');
    }
  });
});

import { couldTreat } from '../logic/care';

describe('couldTreat', () => {
  it('is true when the hospital passes the need and false when it fails', () => {
    expect(couldTreat(openStatus(), 'child')).toBe(true);
    expect(couldTreat(openStatus({ beds: 0 }), 'child')).toBe(false);
    const diverting = openStatus();
    diverting.depts.ed = 'diverting';
    expect(couldTreat(diverting, 'general')).toBe(false);
  });
});

import { QUICK_REPLY_KEYS, REFERRAL_REPLY_KEYS, quickRepliesFor } from '../logic/care';

describe('quickRepliesFor', () => {
  it('gives doctor referrals the referral set and patient requests the patient set', () => {
    expect(quickRepliesFor({ referralId: 'f1' })).toBe(REFERRAL_REPLY_KEYS);
    expect(quickRepliesFor({})).toBe(QUICK_REPLY_KEYS);
    expect(quickRepliesFor({ referralId: null })).toBe(QUICK_REPLY_KEYS);
  });
});

import { blocksNewRequest, patientCanCancel } from '../logic/care';
import { RESERVATION_MS } from '../logic/reservations';
import type { ReferralProgressStatus } from '../logic/types';

const referred = (status: ReferralProgressStatus, atMs = NOW_MS) => ({ name: { en: 'Siam Central', th: 'สยามเซ็นทรัล' }, status, atMs });

describe('patientCanCancel', () => {
  it('lets the patient cancel an open request, also while a doctor is referring them on', () => {
    expect(patientCanCancel({ status: 'waiting' })).toBe(true);
    expect(patientCanCancel({ status: 'no_reply' })).toBe(true);
    for (const status of ['waiting', 'accepted', 'declined', 'set_aside'] as const) {
      expect(patientCanCancel({ status: 'accepted', referredTo: referred(status) })).toBe(true);
    }
  });
  it('refuses once the transfer is confirmed or the request is closed', () => {
    expect(patientCanCancel({ status: 'accepted', referredTo: referred('confirmed') })).toBe(false);
    expect(patientCanCancel({ status: 'accepted', referredTo: referred('arrived') })).toBe(false);
    for (const status of ['declined', 'cancelled', 'completed'] as const) expect(patientCanCancel({ status })).toBe(false);
  });
});

describe('blocksNewRequest', () => {
  const open = { type: 'visit', status: 'accepted', createdAtMs: NOW_MS - 60_000 } as const;
  it('counts a recent open request as the one open request', () => {
    expect(blocksNewRequest(open, NOW_MS)).toBe(true);
    expect(blocksNewRequest({ ...open, status: 'waiting' }, NOW_MS)).toBe(true);
  });
  it('ignores closed requests and bookings', () => {
    expect(blocksNewRequest({ ...open, status: 'cancelled' }, NOW_MS)).toBe(false);
    expect(blocksNewRequest({ ...open, type: 'booking' }, NOW_MS)).toBe(false);
  });
  it('stops blocking once nothing happened to it for the reservation time', () => {
    const old = { ...open, createdAtMs: NOW_MS - RESERVATION_MS };
    expect(blocksNewRequest(old, NOW_MS)).toBe(false);
    // A recent referral reply keeps it open.
    expect(blocksNewRequest({ ...old, referredTo: referred('accepted', NOW_MS - 60_000) }, NOW_MS)).toBe(true);
    expect(blocksNewRequest({ ...old, acceptedAtMs: NOW_MS - 60_000 }, NOW_MS)).toBe(true);
  });
});

describe('decline reasons', () => {
  it('accepts exactly the four reasons the app offers, and nothing else', () => {
    expect([...DECLINE_REASONS]).toEqual(['nobed', 'busy', 'equip', 'divert']);
    for (const r of DECLINE_REASONS) expect(isDeclineReason(r)).toBe(true);
    for (const r of ['', 'NOBED', 'undone_by_staff', undefined, null, 3, { reason: 'nobed' }]) expect(isDeclineReason(r)).toBe(false);
  });
});
