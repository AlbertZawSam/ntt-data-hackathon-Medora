import { checkDirectReferral, referralTargets } from '../logic/directReferral';
import { NOW_MS, openStatus } from './generators';

const profile = (hospitalId: string, kmNorth: number) => ({
  hospitalId,
  name: { en: hospitalId, th: hospitalId },
  lat: 13.75 + kmNorth / 111,
  lng: 100.53,
  typicalWaitMin: 20,
});

describe('referralTargets', () => {
  it('lists the other hospitals nearest first, with the public details only', () => {
    const origin = { hospitalId: 'A', lat: 13.75, lng: 100.53 };
    const targets = referralTargets(origin, [
      { profile: profile('A', 0), status: openStatus() },
      { profile: profile('far', 9), status: openStatus() },
      { profile: profile('near', 2), status: openStatus({ beds: 4 }) },
    ], [], NOW_MS);
    expect(targets.map((t) => t.hospitalId)).toEqual(['near', 'far']);
    expect(targets[0].details.freeBeds).toBe(4);
    expect(JSON.stringify(targets)).not.toMatch(/"(nicu|equip|oncall|notes|rules)"/);
  });
});

describe('checkDirectReferral', () => {
  const open = openStatus({ depts: { ed: 'open', cardio: 'open', ortho: 'diverting' } });
  it('allows a patient of my hospital to another hospital and an open department', () => {
    expect(checkDirectReferral('A', { hospitalId: 'A', type: 'visit', status: 'accepted' }, 'B', open, 'cardiology')).toEqual({ ok: true });
    expect(checkDirectReferral('A', { hospitalId: 'A', type: 'visit', status: 'accepted' }, 'B', open, undefined)).toEqual({ ok: true });
  });
  it("refuses another hospital's patient, my own hospital, an unknown hospital and a closed department", () => {
    expect(checkDirectReferral('A', { hospitalId: 'C', type: 'visit', status: 'accepted' }, 'B', open, undefined)).toEqual({ ok: false, reason: 'not-your-patient' });
    expect(checkDirectReferral('A', { hospitalId: 'A', type: 'visit', status: 'accepted' }, 'A', open, undefined)).toEqual({ ok: false, reason: 'same-hospital' });
    expect(checkDirectReferral('A', { hospitalId: 'A', type: 'visit', status: 'accepted' }, 'B', undefined, undefined)).toEqual({ ok: false, reason: 'no-hospital' });
    expect(checkDirectReferral('A', { hospitalId: 'A', type: 'visit', status: 'accepted' }, 'B', open, 'surgery')).toEqual({ ok: false, reason: 'bad-department' });
    expect(checkDirectReferral('A', { hospitalId: 'A', type: 'visit', status: 'accepted' }, 'B', open, 'ward')).toEqual({ ok: false, reason: 'bad-department' });
  });
  it('refuses bookings and requests the patient cancelled or the hospital declined', () => {
    for (const source of [{ type: 'booking', status: 'accepted' }, { type: 'visit', status: 'cancelled' }, { type: 'visit', status: 'declined' }, { type: 'visit', status: 'no_reply' }]) {
      expect(checkDirectReferral('A', { hospitalId: 'A', ...source }, 'B', open, undefined)).toEqual({ ok: false, reason: 'bad-state' });
    }
  });
});

import { isReferablePatient, REFERABLE_FOR_MS } from '../logic/directReferral';

describe('isReferablePatient', () => {
  const now = Date.parse('2026-11-20T10:00:00Z');
  const request = (over: Record<string, unknown> = {}) => ({ hospitalId: 'A', type: 'visit', status: 'accepted', createdAtMs: now - 60_000, ...over });

  it("lists a patient who has arrived, so the doctor can refer them when the hospital lacks what they need", () => {
    for (const status of ['waiting', 'accepted', 'completed']) expect(isReferablePatient(request({ status }), 'A', now)).toBe(true);
  });

  it('never lists another hospital\'s patient, a booking, a referral, a closed request or an old one', () => {
    expect(isReferablePatient(request(), 'B', now)).toBe(false);
    expect(isReferablePatient(request({ type: 'booking' }), 'A', now)).toBe(false);
    expect(isReferablePatient(request({ referralId: 'ref1' }), 'A', now)).toBe(false);
    for (const status of ['declined', 'cancelled', 'no_reply']) expect(isReferablePatient(request({ status }), 'A', now)).toBe(false);
    expect(isReferablePatient(request({ createdAtMs: now - REFERABLE_FOR_MS - 1 }), 'A', now)).toBe(false);
  });

  it('lists exactly the requests the server accepts for a referral', () => {
    const open = { ed: 'open' } as const;
    for (const status of ['waiting', 'accepted', 'completed', 'declined', 'cancelled']) {
      const listed = isReferablePatient(request({ status }), 'A', now);
      const allowed = checkDirectReferral('A', { hospitalId: 'A', type: 'visit', status }, 'B', openStatus({ depts: open }), undefined).ok;
      expect(listed).toBe(allowed);
    }
  });
});
