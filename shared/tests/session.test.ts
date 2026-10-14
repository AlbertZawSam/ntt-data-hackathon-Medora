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
  it('maps each sign-up role to its groups', () => {
    expect(groupsForRole('patient')).toEqual(['patients']);
    expect(groupsForRole('admin')).toEqual(['hospital_staff', 'admins']);
    expect(groupsForRole('doctor')).toEqual(['doctors']);
  });

  it('never gives staff, doctor or admin groups to anything else', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.constant(undefined), fc.constant('staff'), fc.constant('hospital_staff'), fc.constant('ADMIN')),
        (role) => {
          fc.pre(role !== 'admin' && role !== 'doctor');
          expect(groupsForRole(role)).toEqual(['patients']);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('never makes a doctor or patient an admin', () => {
    expect(groupsForRole('doctor')).not.toContain('admins');
    expect(groupsForRole('patient')).not.toContain('admins');
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
