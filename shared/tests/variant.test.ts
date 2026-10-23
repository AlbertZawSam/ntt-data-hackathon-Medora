import { parseVariant, roleAllowedInVariant, variantPolicy } from '../logic/variant';
import type { Session } from '../logic/session';

const session = (groups: string[], hospitalId?: string): Session => ({ userId: 'u', email: 'a@b.c', groups, hospitalId, approved: true });

describe('variants', () => {
  it('uses the development build with both apps unless a release variant is set exactly', () => {
    expect(parseVariant(undefined)).toBe('all');
    expect(parseVariant('HOSPITAL')).toBe('all');
    expect(parseVariant('hospital')).toBe('hospital');
    expect(parseVariant('patient')).toBe('patient');
  });
  it('the development build keeps both sign-in options and lets every role in', () => {
    expect(variantPolicy('all')).toMatchObject({ showSignUp: true, showPoolSwitch: true });
    expect(roleAllowedInVariant('all', session(['doctors'], 'H1'))).toBe(true);
  });
  it('the hospital app signs in to the staff pool with no sign-up; the patient app signs up to the public pool', () => {
    expect(variantPolicy('hospital')).toMatchObject({ defaultPool: 'staff', showSignUp: false });
    expect(variantPolicy('patient')).toMatchObject({ defaultPool: 'public', showSignUp: true });
  });
  it('keeps patients out of the hospital app and hospital roles out of the patient app', () => {
    const patient = session(['patients']);
    const nurse = session(['hospital_staff'], 'H1');
    const doctor = session(['doctors'], 'H1');
    const admin = session(['admins'], 'H1');
    expect([patient, nurse, doctor, admin].map((s) => roleAllowedInVariant('patient', s))).toEqual([true, false, false, false]);
    expect([patient, nurse, doctor, admin].map((s) => roleAllowedInVariant('hospital', s))).toEqual([false, true, true, true]);
  });
});
