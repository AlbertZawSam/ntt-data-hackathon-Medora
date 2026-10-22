import fc from 'fast-check';
import {
  canOpen,
  groupsForRole,
  homeRoute,
  redirectFor,
  sessionFromClaims,
  type Session,
} from '../logic/session';

const session = (groups: string[], extra: Partial<Session> = {}): Session => ({
  userId: 'u1',
  email: 'a@example.com',
  groups,
  approved: false,
  ...extra,
});

const patient = session(['patients']);
const newAdmin = session(['hospital_staff', 'admins']);
const admin = session(['hospital_staff', 'admins'], { hospitalId: 'H1' });
const staff = session(['hospital_staff'], { hospitalId: 'H1' });
const pendingDoctor = session(['doctors']);
const doctor = session(['doctors'], { hospitalId: 'H1', approved: true });

describe('groupsForRole', () => {
  it('public sign-up always makes a patient, whatever role is claimed', () => {
    for (const role of ['patient', 'admin', 'doctor', 'staff', 'hospital_staff', 'ADMIN', undefined]) {
      expect(groupsForRole(role)).toEqual(['patients']);
    }
  });

  it('never gives any claimed value staff, doctor or admin groups', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.constant(undefined)), (role) => {
        expect(groupsForRole(role)).toEqual(['patients']);
      }),
      { numRuns: 200 },
    );
  });
});

describe('sessionFromClaims', () => {
  it('reads groups, hospital and approval from ID token claims', () => {
    expect(
      sessionFromClaims({
        sub: 'abc',
        email: 'doc@example.com',
        'cognito:groups': ['doctors'],
        'custom:hospitalId': 'H7',
        'custom:approved': 'true',
      }),
    ).toEqual({ userId: 'abc', email: 'doc@example.com', groups: ['doctors'], hospitalId: 'H7', approved: true });
  });

  it('treats missing or unexpected claims as no access', () => {
    expect(sessionFromClaims({ sub: 'x', 'custom:hospitalId': '', 'custom:approved': 'yes' })).toEqual({
      userId: 'x',
      email: '',
      groups: [],
      hospitalId: undefined,
      approved: false,
    });
  });
});

describe('staff pool sessions', () => {
  it('reads the unit and treats invited doctors as approved', () => {
    const claims = { sub: 's', 'cognito:groups': ['doctors'], 'custom:hospitalId': 'H2', 'custom:unit': 'icu' };
    expect(sessionFromClaims(claims, { staffPool: true })).toMatchObject({ unit: 'icu', approved: true });
    expect(sessionFromClaims(claims).approved).toBe(false);
  });

  it('sends a staff-pool admin to the admin area, not the patient app', () => {
    const poolAdmin = session(['admins'], { hospitalId: 'H1' });
    expect(homeRoute(poolAdmin)).toBe('/(admin)/staff-invite');
    expect(canOpen(poolAdmin, 'patient')).toBe(false);
    expect(canOpen(poolAdmin, 'admin', 'staff-invite')).toBe(true);
  });
});

describe('homeRoute', () => {
  it.each([
    ['patient', patient, '/(patient)/home'],
    ['admin without a hospital', newAdmin, '/(admin)/hospital-setup'],
    ['admin with a hospital', admin, '/(staff)/inbox'],
    ['staff', staff, '/(staff)/inbox'],
    ['unapproved doctor', pendingDoctor, '/(doctor)/pending'],
    ['approved doctor without a hospital', session(['doctors'], { approved: true }), '/(doctor)/pending'],
    ['approved doctor', doctor, '/(doctor)/refer'],
    ['user with no group', session([]), '/(patient)/home'],
  ])('%s → %s', (_name, s, route) => {
    expect(homeRoute(s)).toBe(route);
  });
});

describe('canOpen', () => {
  it('moves an admin off hospital setup once the hospital is registered', () => {
    expect(canOpen(admin, 'admin', 'hospital-setup')).toBe(false);
    expect(redirectFor(admin, ['(admin)', 'hospital-setup'])).toBe('/(staff)/inbox');
  });

  it('keeps an admin on hospital setup until the hospital is registered', () => {
    expect(canOpen(newAdmin, 'admin', 'hospital-setup')).toBe(true);
    expect(canOpen(newAdmin, 'admin', 'team')).toBe(false);
    expect(canOpen(newAdmin, 'staff', 'inbox')).toBe(false);
    expect(canOpen(newAdmin, 'patient', 'home')).toBe(false);
  });

  it('lets only approved doctors with a hospital use the doctor screens', () => {
    expect(canOpen(pendingDoctor, 'doctor', 'refer')).toBe(false);
    expect(canOpen(pendingDoctor, 'doctor', 'pending')).toBe(true);
    expect(canOpen(doctor, 'doctor', 'refer')).toBe(true);
    expect(canOpen(doctor, 'doctor', 'pending')).toBe(false);
  });

  it('keeps every role out of the other roles’ screens', () => {
    expect(canOpen(patient, 'staff', 'inbox')).toBe(false);
    expect(canOpen(patient, 'doctor', 'refer')).toBe(false);
    expect(canOpen(patient, 'admin', 'team')).toBe(false);
    expect(canOpen(staff, 'admin', 'team')).toBe(false);
    expect(canOpen(staff, 'doctor', 'refer')).toBe(false);
    expect(canOpen(doctor, 'staff', 'inbox')).toBe(false);
    expect(canOpen(admin, 'admin', 'team')).toBe(true);
    expect(canOpen(admin, 'staff', 'rules')).toBe(true);
  });
});

describe('redirectFor', () => {
  it('sends signed-out users to sign-in, except on the sign-in screens', () => {
    expect(redirectFor(null, [])).toBe('/sign-in');
    expect(redirectFor(null, ['(staff)', 'inbox'])).toBe('/sign-in');
    expect(redirectFor(null, ['sign-in'])).toBeNull();
    expect(redirectFor(null, ['sign-up'])).toBeNull();
  });

  it('sends signed-in users from the start and sign-in screens to their home', () => {
    expect(redirectFor(doctor, [])).toBe('/(doctor)/refer');
    expect(redirectFor(staff, ['sign-in'])).toBe('/(staff)/inbox');
  });

  it('stays on allowed screens and redirects from others', () => {
    expect(redirectFor(patient, ['(patient)', 'care'])).toBeNull();
    expect(redirectFor(patient, ['(staff)', 'inbox'])).toBe('/(patient)/home');
    expect(redirectFor(pendingDoctor, ['(doctor)', 'refer'])).toBe('/(doctor)/pending');
    expect(redirectFor(newAdmin, ['(staff)', 'status'])).toBe('/(admin)/hospital-setup');
  });

  it('never redirects a user to a screen they then get redirected from', () => {
    const all = [patient, newAdmin, admin, staff, pendingDoctor, doctor, session([])];
    for (const s of all) {
      const [area, screen] = homeRoute(s).slice(1).split('/');
      expect(redirectFor(s, [area, screen])).toBeNull();
    }
  });
});
