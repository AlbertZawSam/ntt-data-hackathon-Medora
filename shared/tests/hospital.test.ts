import { checkRegistration, validateHospitalInput } from '../logic/hospital';

const valid = { nameEn: 'Rama 9 Hospital', nameTh: 'โรงพยาบาลพระราม 9', lat: 13.7585, lng: 100.5655, totalBeds: 120, nicuTotal: 8 };
const POOL = 'us-east-1_PUBLIC';
const iss = `https://cognito-idp.us-east-1.amazonaws.com/${POOL}`;
const adminClaims = { iss, token_use: 'id', sub: 'sub-1', 'cognito:groups': ['admins'], 'cognito:username': 'u-1' };

describe('validateHospitalInput', () => {
  it('accepts a complete Bangkok hospital and trims names', () => {
    const result = validateHospitalInput({ ...valid, nameEn: '  Rama   9 Hospital ' });
    expect(result).toEqual({ ok: true, value: valid });
  });

  it('requires both names', () => {
    expect(validateHospitalInput({ ...valid, nameTh: '  ' })).toEqual({ ok: false, issue: 'name' });
    expect(validateHospitalInput({ ...valid, nameEn: '' })).toEqual({ ok: false, issue: 'name' });
    expect(validateHospitalInput({ ...valid, nameEn: 'x'.repeat(121) })).toEqual({ ok: false, issue: 'name' });
  });

  it('refuses a location outside Bangkok or not a number', () => {
    expect(validateHospitalInput({ ...valid, lat: 18.79, lng: 98.98 })).toEqual({ ok: false, issue: 'location' });
    expect(validateHospitalInput({ ...valid, lat: '13.7' })).toEqual({ ok: false, issue: 'location' });
    expect(validateHospitalInput({ ...valid, lng: NaN })).toEqual({ ok: false, issue: 'location' });
  });

  it('needs whole bed counts in range, and allows zero NICU cots', () => {
    expect(validateHospitalInput({ ...valid, totalBeds: 0 })).toEqual({ ok: false, issue: 'beds' });
    expect(validateHospitalInput({ ...valid, totalBeds: 12.5 })).toEqual({ ok: false, issue: 'beds' });
    expect(validateHospitalInput({ ...valid, totalBeds: 5001 })).toEqual({ ok: false, issue: 'beds' });
    expect(validateHospitalInput({ ...valid, nicuTotal: -1 })).toEqual({ ok: false, issue: 'nicu' });
    expect(validateHospitalInput({ ...valid, nicuTotal: 0 }).ok).toBe(true);
  });
});

describe('checkRegistration', () => {
  it('lets a staff-pool admin without a hospital register one', () => {
    expect(checkRegistration(adminClaims, POOL)).toEqual({ ok: true, username: 'u-1', sub: 'sub-1' });
  });

  it('refuses an admin who already has a hospital', () => {
    expect(checkRegistration({ ...adminClaims, 'custom:hospitalId': 'H02' }, POOL)).toEqual({ ok: false, reason: 'already-registered' });
  });

  it('refuses a patient or doctor even with a valid token', () => {
    expect(checkRegistration({ ...adminClaims, 'cognito:groups': ['patients'] }, POOL)).toEqual({ ok: false, reason: 'not-admin' });
    expect(checkRegistration({ ...adminClaims, 'cognito:groups': ['doctors'] }, POOL)).toEqual({ ok: false, reason: 'not-admin' });
    expect(checkRegistration({ ...adminClaims, 'cognito:groups': undefined }, POOL)).toEqual({ ok: false, reason: 'not-admin' });
  });

  it('refuses tokens from another pool, or missing claims or pool id', () => {
    const other = { ...adminClaims, iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_STAFF' };
    expect(checkRegistration(other, POOL)).toEqual({ ok: false, reason: 'wrong-pool' });
    expect(checkRegistration(undefined, POOL)).toEqual({ ok: false, reason: 'wrong-pool' });
    expect(checkRegistration(adminClaims, undefined)).toEqual({ ok: false, reason: 'wrong-pool' });
    expect(checkRegistration({ ...adminClaims, 'cognito:username': undefined }, POOL)).toEqual({ ok: false, reason: 'wrong-token' });
    expect(checkRegistration({ ...adminClaims, sub: undefined }, POOL)).toEqual({ ok: false, reason: 'wrong-token' });
  });

  it('refuses access tokens, which lack the custom claims', () => {
    expect(checkRegistration({ ...adminClaims, token_use: 'access' }, POOL)).toEqual({ ok: false, reason: 'wrong-token' });
  });
});
