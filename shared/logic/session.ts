/**
 * Roles, Cognito groups and role routing — pure TypeScript, shared by the app and the
 * post-confirmation Lambda.
 * Requirements: 1.1, 1.3, 1.4, 18.1, 18.6, 18.7
 */

export const GROUPS = {
  patients: 'patients',
  staff: 'hospital_staff',
  doctors: 'doctors',
  admins: 'admins',
} as const;

export type Group = (typeof GROUPS)[keyof typeof GROUPS];

/**
 * Public sign-up creates patients only. Hospital admins, unit staff and doctors exist only in the
 * invite-only staff pool (AGENTS.md 4b.1); the first admin of a hospital is created with
 * `scripts/create-first-admin.mjs`.
 */
export const SIGN_UP_ROLES = ['patient'] as const;
export type SignUpRole = (typeof SIGN_UP_ROLES)[number];

/**
 * Groups for a public-pool sign-up. Whatever role the request claims, the result is `patients`, so a
 * tampered sign-up can never reach staff, doctor or admin rights.
 */
export function groupsForRole(_role?: unknown): Group[] {
  return [GROUPS.patients];
}

export interface Session {
  userId: string;
  email: string;
  groups: string[];
  /** Hospital the user works at; set only by the backend. */
  hospitalId?: string;
  /** Unit staff only (`ward`, `icu`, ... or `all`); set only by an admin when inviting. */
  unit?: string;
  /** Doctors only: an admin of their hospital approved them. Set only by the backend. */
  approved: boolean;
}

/**
 * Builds a session from ID token claims. `staffPool` is true when the token came from the invite-only
 * staff pool: an admin invited those doctors, so they need no separate approval. This only decides
 * which screens to show; the server checks the claims itself.
 */
export function sessionFromClaims(claims: Record<string, unknown>, options: { staffPool?: boolean } = {}): Session {
  const groups = claims['cognito:groups'];
  const hospitalId = claims['custom:hospitalId'];
  const unit = claims['custom:unit'];
  return {
    userId: String(claims.sub ?? ''),
    email: String(claims.email ?? ''),
    groups: Array.isArray(groups) ? groups.map(String) : [],
    hospitalId: typeof hospitalId === 'string' && hospitalId !== '' ? hospitalId : undefined,
    unit: typeof unit === 'string' && unit !== '' ? unit : undefined,
    approved: options.staffPool === true || claims['custom:approved'] === 'true',
  };
}

const inGroup = (session: Session, group: Group): boolean => session.groups.includes(group);

/** Route groups under `app/`. */
export type Area = 'patient' | 'staff' | 'doctor' | 'admin';

/** The screen a signed-in user lands on. */
export function homeRoute(session: Session): string {
  if (inGroup(session, GROUPS.doctors)) {
    return session.approved && session.hospitalId ? '/(doctor)/refer' : '/(doctor)/pending';
  }
  if (inGroup(session, GROUPS.admins) && !session.hospitalId) return '/(admin)/hospital-setup';
  if (inGroup(session, GROUPS.staff)) return '/(staff)/inbox';
  if (inGroup(session, GROUPS.admins)) return '/(admin)/staff-invite';
  return '/(patient)/home';
}

/** Whether the user may open a screen in `area` (`screen` is the file name, e.g. "pending"). */
export function canOpen(session: Session, area: Area, screen?: string): boolean {
  const isAdmin = inGroup(session, GROUPS.admins);
  // An admin must register their hospital before any other screen.
  if (isAdmin && !session.hospitalId) return area === 'admin' && screen === 'hospital-setup';
  // Hospital setup is a one-time step: once registered, the admin moves on to their area.
  if (area === 'admin' && screen === 'hospital-setup') return false;
  switch (area) {
    case 'patient':
      return !inGroup(session, GROUPS.staff) && !inGroup(session, GROUPS.doctors) && !isAdmin;
    case 'staff':
      return inGroup(session, GROUPS.staff) && session.hospitalId !== undefined;
    case 'admin':
      return isAdmin;
    case 'doctor':
      if (!inGroup(session, GROUPS.doctors)) return false;
      return screen === 'pending' ? !session.approved || !session.hospitalId : session.approved && !!session.hospitalId;
  }
}

const AREAS: Record<string, Area> = {
  '(patient)': 'patient',
  '(staff)': 'staff',
  '(doctor)': 'doctor',
  '(admin)': 'admin',
};

const PUBLIC_SCREENS = ['sign-in', 'sign-up'];

/**
 * Where the auth gate should send the user for the current route segments, or null to stay.
 * Signed-out users go to sign-in; signed-in users leave the sign-in screens and any area
 * their role can't open.
 */
export function redirectFor(session: Session | null, segments: string[]): string | null {
  const [first, second] = segments;
  const onPublic = first !== undefined && PUBLIC_SCREENS.includes(first);
  if (!session) return onPublic ? null : '/sign-in';
  if (onPublic || first === undefined) return homeRoute(session);
  const area = AREAS[first];
  if (area === undefined) return null; // unknown route: let the router show its not-found screen
  return canOpen(session, area, second) ? null : homeRoute(session);
}
