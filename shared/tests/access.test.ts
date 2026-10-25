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
  isUnitClaim,
  itemsForUnit,
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

  it('lists only the caller unit items; the fallback sees all; no unit sees none', () => {
    const items = [{ ownerUnit: 'ward' }, { ownerUnit: 'radiology' }, { ownerUnit: 'radiology' }];
    expect(itemsForUnit('radiology', items)).toHaveLength(2);
    expect(itemsForUnit('ward', items)).toHaveLength(1);
    expect(itemsForUnit('all', items)).toHaveLength(3);
    expect(itemsForUnit(undefined, items)).toHaveLength(0);
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
