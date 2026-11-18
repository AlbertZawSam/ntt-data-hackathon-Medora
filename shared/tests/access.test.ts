import fc from 'fast-check';
import {
  DEFAULT_OWNER_UNIT,
  UNITS,
  canAnswerRequest,
  canConfirmReferral,
  canManageHospital,
  canStartReferral,
  callerFromClaims,
  canUpdateStatusItem,
  checkInvitation,
  isPatientToken,
  isSignedInToken,
  isUnitClaim,
  issuedBy,
  mayRunReferralAgent,
  type Caller,
} from '../logic/access';

// Hospitals and users are made up inside the tests (live data only).
const H1 = 'hosp-a';
const H2 = 'hosp-b';
const nurse = (unit: string, hospitalId = H1): Caller => ({ groups: ['hospital_staff'], hospitalId, unit });
const doctor: Caller & { userId: string } = { groups: ['doctors'], hospitalId: H1, userId: 'doc-1' };
const admin: Caller = { groups: ['admins'], hospitalId: H1 };
const patient: Caller = { groups: ['patients'] };

describe('canUpdateStatusItem', () => {
  it('lets a ward nurse change ward beds at their hospital', () => {
    expect(canUpdateStatusItem(nurse('ward'), { hospitalId: H1, ownerUnit: DEFAULT_OWNER_UNIT.beds })).toBe(true);
  });

  it('refuses a ward nurse for the CT or another hospital', () => {
    expect(canUpdateStatusItem(nurse('ward'), { hospitalId: H1, ownerUnit: DEFAULT_OWNER_UNIT.ct })).toBe(false);
    expect(canUpdateStatusItem(nurse('ward'), { hospitalId: H2, ownerUnit: 'ward' })).toBe(false);
  });

  it('lets a radiology technologist change the CT', () => {
    expect(canUpdateStatusItem(nurse('radiology'), { hospitalId: H1, ownerUnit: DEFAULT_OWNER_UNIT.ct })).toBe(true);
  });

  it('lets the general fallback account change every item of its own hospital only', () => {
    for (const unit of UNITS) expect(canUpdateStatusItem(nurse('all'), { hospitalId: H1, ownerUnit: unit })).toBe(true);
    expect(canUpdateStatusItem(nurse('all'), { hospitalId: H2, ownerUnit: 'ward' })).toBe(false);
  });

  it('refuses doctors, admins, patients and staff without a unit or hospital', () => {
    const item = { hospitalId: H1, ownerUnit: 'ward' };
    expect(canUpdateStatusItem(doctor, item)).toBe(false);
    expect(canUpdateStatusItem(admin, item)).toBe(false);
    expect(canUpdateStatusItem(patient, item)).toBe(false);
    expect(canUpdateStatusItem({ groups: ['hospital_staff'], hospitalId: H1 }, item)).toBe(false);
    expect(canUpdateStatusItem({ groups: ['hospital_staff'], unit: 'ward' }, item)).toBe(false);
  });

  it('Property: a unit account never updates an item owned by another unit', () => {
    fc.assert(
      fc.property(fc.constantFrom(...UNITS), fc.constantFrom(...UNITS), (own, owner) => {
        expect(canUpdateStatusItem(nurse(own), { hospitalId: H1, ownerUnit: owner })).toBe(own === owner);
      }),
    );
  });
});

describe('requests, referrals and settings', () => {
  it('lets staff of the request hospital answer, and nobody else', () => {
    expect(canAnswerRequest(nurse('ward'), { hospitalId: H1 })).toBe(true);
    expect(canAnswerRequest(nurse('ward'), { hospitalId: H2 })).toBe(false);
    expect(canAnswerRequest(doctor, { hospitalId: H1 })).toBe(false);
    expect(canAnswerRequest(admin, { hospitalId: H1 })).toBe(false);
    expect(canAnswerRequest(patient, { hospitalId: H1 })).toBe(false);
  });

  it('routes a department request to that department only, and general requests to the other units', () => {
    const cardio = nurse('cardiology' as never);
    expect(canAnswerRequest(cardio, { hospitalId: H1, department: 'cardiology' })).toBe(true);
    expect(canAnswerRequest(nurse('surgery' as never), { hospitalId: H1, department: 'cardiology' })).toBe(false);
    expect(canAnswerRequest(nurse('er'), { hospitalId: H1, department: 'cardiology' })).toBe(false);
    expect(canAnswerRequest(cardio, { hospitalId: H2, department: 'cardiology' })).toBe(false);
    expect(canAnswerRequest(cardio, { hospitalId: H1 })).toBe(false);
    expect(canAnswerRequest(nurse('er'), { hospitalId: H1, department: null })).toBe(true);
    expect(canAnswerRequest(nurse('all' as never), { hospitalId: H1, department: 'obstetrics' })).toBe(true);
    // A doctor's referral routed to Cardiology: Cardiology answers, the emergency unit can step in, other departments can't.
    const referral = { hospitalId: H1, department: 'cardiology', referralId: 'f1' };
    expect(canAnswerRequest(cardio, referral)).toBe(true);
    expect(canAnswerRequest(nurse('er'), referral)).toBe(true);
    expect(canAnswerRequest(nurse('surgery' as never), referral)).toBe(false);
    // The receiving hospital's doctors accept referrals themselves, but not patients' own requests.
    expect(canAnswerRequest(doctor, referral)).toBe(true);
    expect(canAnswerRequest(doctor, { hospitalId: H1, department: 'cardiology' })).toBe(false);
    expect(canAnswerRequest({ ...doctor, hospitalId: H2 }, referral)).toBe(false);
    expect(canAnswerRequest(doctor, { ...referral, fromHospitalId: H1 })).toBe(false);
  });

  it('lets a doctor start and confirm their own referral only', () => {
    expect(canStartReferral(doctor)).toBe(true);
    expect(canConfirmReferral(doctor, { ownerId: 'doc-1' })).toBe(true);
    expect(canConfirmReferral(doctor, { ownerId: 'doc-2' })).toBe(false);
    expect(canStartReferral(nurse('er'))).toBe(false);
    expect(canStartReferral(patient)).toBe(false);
  });

  it('lets only an admin manage their own hospital', () => {
    expect(canManageHospital(admin, H1)).toBe(true);
    expect(canManageHospital(admin, H2)).toBe(false);
    expect(canManageHospital(nurse('ward'), H1)).toBe(false);
    expect(canManageHospital(doctor, H1)).toBe(false);
  });
});

describe('checkInvitation', () => {
  it('lets an admin invite a nurse with a unit at their hospital', () => {
    expect(checkInvitation(admin, { hospitalId: H1, group: 'hospital_staff', unit: 'ward' })).toEqual({ ok: true });
    expect(checkInvitation(admin, { hospitalId: H1, group: 'hospital_staff', unit: 'cardiology' })).toEqual({ ok: true });
    expect(checkInvitation(admin, { hospitalId: H2, group: 'hospital_staff', unit: 'cardiology' })).toEqual({ ok: false, reason: 'other-hospital' });
    expect(checkInvitation(admin, { hospitalId: H1, group: 'hospital_staff', unit: 'all' })).toEqual({ ok: true });
    expect(checkInvitation(admin, { hospitalId: H1, group: 'doctors' })).toEqual({ ok: true });
  });

  it('refuses another hospital, non-admins, unknown units and groups', () => {
    expect(checkInvitation(admin, { hospitalId: H2, group: 'hospital_staff', unit: 'ward' })).toEqual({ ok: false, reason: 'other-hospital' });
    expect(checkInvitation(nurse('ward'), { hospitalId: H1, group: 'hospital_staff', unit: 'ward' })).toEqual({ ok: false, reason: 'not-admin' });
    expect(checkInvitation(admin, { hospitalId: H1, group: 'hospital_staff', unit: 'pharmacy' })).toEqual({ ok: false, reason: 'bad-unit' });
    expect(checkInvitation(admin, { hospitalId: H1, group: 'hospital_staff' })).toEqual({ ok: false, reason: 'bad-unit' });
    expect(checkInvitation(admin, { hospitalId: H1, group: 'doctors', unit: 'ward' })).toEqual({ ok: false, reason: 'bad-unit' });
    expect(checkInvitation(admin, { hospitalId: H1, group: 'patients' })).toEqual({ ok: false, reason: 'bad-group' });
  });
});

describe('unit values and the My unit list', () => {
  it('accepts exactly the six units and "all"', () => {
    for (const u of [...UNITS, 'all']) expect(isUnitClaim(u)).toBe(true);
    for (const u of ['', 'pharmacy', 'WARD', undefined, 3]) expect(isUnitClaim(u)).toBe(false);
  });
});

describe('callerFromClaims', () => {
  const POOL = 'us-east-1_staff';
  const iss = `https://cognito-idp.us-east-1.amazonaws.com/${POOL}`;

  it('reads groups, hospital and unit from a staff-pool token', () => {
    expect(
      callerFromClaims({ iss, 'cognito:groups': ['hospital_staff'], 'custom:hospitalId': H1, 'custom:unit': 'ward' }, POOL),
    ).toEqual({ groups: ['hospital_staff'], hospitalId: H1, unit: 'ward' });
  });

  it('refuses a token from another pool, or a missing pool id or issuer', () => {
    const claims = { iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_public', 'cognito:groups': ['admins'], 'custom:hospitalId': H1 };
    expect(callerFromClaims(claims, POOL)).toBeUndefined();
    expect(callerFromClaims({ iss, 'cognito:groups': ['admins'] }, undefined)).toBeUndefined();
    expect(callerFromClaims({ 'cognito:groups': ['admins'] }, POOL)).toBeUndefined();
    expect(callerFromClaims(undefined, POOL)).toBeUndefined();
  });

  it('gives no hospital or unit for an access token without custom claims or with empty values', () => {
    const access = callerFromClaims({ iss, 'cognito:groups': ['admins'] }, POOL);
    expect(access).toEqual({ groups: ['admins'], hospitalId: undefined, unit: undefined });
    expect(canManageHospital(access!, H1)).toBe(false);
    const empty = callerFromClaims({ iss, 'cognito:groups': ['hospital_staff'], 'custom:hospitalId': H1, 'custom:unit': '' }, POOL)!;
    expect(canUpdateStatusItem(empty, { hospitalId: H1, ownerUnit: 'ward' })).toBe(false);
  });
});

// Tokens as Cognito issues them: the issuer names the pool. Pool ids are made up.
const PUBLIC_POOL = 'us-east-1_PUB';
const STAFF_POOL = 'us-east-1_STF';
const token = (pool: string, groups: unknown, extra: Record<string, unknown> = {}) => ({
  iss: `https://cognito-idp.us-east-1.amazonaws.com/${pool}`,
  'cognito:groups': groups,
  ...extra,
});
const pools = { publicPoolId: PUBLIC_POOL, staffPoolId: STAFF_POOL };

describe('token checks: each group only from its own pool', () => {
  it('matches the issuer exactly at the end, never a pool id that merely contains it', () => {
    expect(issuedBy(token(PUBLIC_POOL, []), PUBLIC_POOL)).toBe(true);
    expect(issuedBy(token(`${PUBLIC_POOL}X`, []), PUBLIC_POOL)).toBe(false);
    expect(issuedBy(token(PUBLIC_POOL, []), undefined)).toBe(false);
    expect(issuedBy(undefined, PUBLIC_POOL)).toBe(false);
    expect(issuedBy({ iss: 42 }, PUBLIC_POOL)).toBe(false);
  });

  it('accepts a patient only from the public pool', () => {
    expect(isPatientToken(token(PUBLIC_POOL, ['patients']), PUBLIC_POOL)).toBe(true);
    expect(isPatientToken(token(STAFF_POOL, ['patients']), PUBLIC_POOL)).toBe(false);
    expect(isPatientToken(token(PUBLIC_POOL, ['doctors']), PUBLIC_POOL)).toBe(false);
    expect(isPatientToken(token(PUBLIC_POOL, 'patients'), PUBLIC_POOL)).toBe(false); // not a list
    expect(isPatientToken(token(PUBLIC_POOL, ['patients']), undefined)).toBe(false); // pool id not configured
  });

  it('accepts patients from the public pool and hospital groups from the staff pool, nothing else', () => {
    expect(isSignedInToken(token(PUBLIC_POOL, ['patients']), pools)).toBe(true);
    for (const g of ['hospital_staff', 'doctors', 'admins']) {
      expect(isSignedInToken(token(STAFF_POOL, [g]), pools)).toBe(true);
      expect(isSignedInToken(token(PUBLIC_POOL, [g]), pools)).toBe(false); // a public-pool "doctor" or "admin"
    }
    expect(isSignedInToken(token(STAFF_POOL, ['patients']), pools)).toBe(false);
    expect(isSignedInToken(token(STAFF_POOL, []), pools)).toBe(false);
    expect(isSignedInToken(token('us-east-1_OTHER', ['patients']), pools)).toBe(false);
    expect(isSignedInToken(undefined, pools)).toBe(false);
  });
});

describe('mayRunReferralAgent (agent-runner)', () => {
  const doctorToken = () => token(STAFF_POOL, ['doctors'], { 'custom:hospitalId': H1 });

  it('lets the doctor of the staff pool who owns the referral run it', () => {
    expect(mayRunReferralAgent({ sub: 'doc-1', claims: doctorToken() }, 'doc-1', STAFF_POOL, false)).toBe(true);
  });

  it("refuses another doctor's referral, and a call with no user id", () => {
    expect(mayRunReferralAgent({ sub: 'doc-2', claims: doctorToken() }, 'doc-1', STAFF_POOL, false)).toBe(false);
    expect(mayRunReferralAgent({ claims: doctorToken() }, 'doc-1', STAFF_POOL, false)).toBe(false);
    expect(mayRunReferralAgent(null, 'doc-1', STAFF_POOL, false)).toBe(false);
  });

  it('refuses a public-pool token with a doctors group, a nurse, an admin, and a doctor with no hospital', () => {
    expect(mayRunReferralAgent({ sub: 'doc-1', claims: token(PUBLIC_POOL, ['doctors'], { 'custom:hospitalId': H1 }) }, 'doc-1', STAFF_POOL, false)).toBe(false);
    expect(mayRunReferralAgent({ sub: 'doc-1', claims: token(STAFF_POOL, ['hospital_staff'], { 'custom:hospitalId': H1, 'custom:unit': 'er' }) }, 'doc-1', STAFF_POOL, false)).toBe(false);
    expect(mayRunReferralAgent({ sub: 'doc-1', claims: token(STAFF_POOL, ['admins'], { 'custom:hospitalId': H1 }) }, 'doc-1', STAFF_POOL, false)).toBe(false);
    expect(mayRunReferralAgent({ sub: 'doc-1', claims: token(STAFF_POOL, ['doctors']) }, 'doc-1', STAFF_POOL, false)).toBe(false);
    expect(mayRunReferralAgent({ sub: 'doc-1', claims: doctorToken() }, 'doc-1', undefined, false)).toBe(false); // pool id missing
  });

  it('refuses a token-less call through AppSync; a direct evaluation invoke must still name the owner', () => {
    expect(mayRunReferralAgent({ sub: 'doc-1' }, 'doc-1', STAFF_POOL, false)).toBe(false);
    expect(mayRunReferralAgent({ sub: 'doc-1' }, 'doc-1', STAFF_POOL, true)).toBe(true);
    expect(mayRunReferralAgent({ sub: 'doc-2' }, 'doc-1', STAFF_POOL, true)).toBe(false);
    // A direct invoke that carries a forged token is checked like any other call.
    expect(mayRunReferralAgent({ sub: 'doc-1', claims: token(PUBLIC_POOL, ['doctors']) }, 'doc-1', STAFF_POOL, true)).toBe(false);
  });
});
