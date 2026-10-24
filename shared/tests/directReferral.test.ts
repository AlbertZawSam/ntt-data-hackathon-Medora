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
    expect(targets[0].details.bedsFree).toBe('3-5');
    expect(JSON.stringify(targets)).not.toMatch(/"(nicu|equip|oncall|notes|rules)"/);
  });
});

describe('checkDirectReferral', () => {
  const open = openStatus({ depts: { ed: 'open', cardio: 'open', ortho: 'diverting' } });
  it('allows a patient of my hospital to another hospital and an open department', () => {
    expect(checkDirectReferral('A', { hospitalId: 'A' }, 'B', open, 'cardiology')).toEqual({ ok: true });
    expect(checkDirectReferral('A', { hospitalId: 'A' }, 'B', open, undefined)).toEqual({ ok: true });
  });
  it("refuses another hospital's patient, my own hospital, an unknown hospital and a closed department", () => {
    expect(checkDirectReferral('A', { hospitalId: 'C' }, 'B', open, undefined)).toEqual({ ok: false, reason: 'not-your-patient' });
    expect(checkDirectReferral('A', { hospitalId: 'A' }, 'A', open, undefined)).toEqual({ ok: false, reason: 'same-hospital' });
    expect(checkDirectReferral('A', { hospitalId: 'A' }, 'B', undefined, undefined)).toEqual({ ok: false, reason: 'no-hospital' });
    expect(checkDirectReferral('A', { hospitalId: 'A' }, 'B', open, 'surgery')).toEqual({ ok: false, reason: 'bad-department' });
    expect(checkDirectReferral('A', { hospitalId: 'A' }, 'B', open, 'ward')).toEqual({ ok: false, reason: 'bad-department' });
  });
});
