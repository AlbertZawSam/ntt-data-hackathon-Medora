/**
 * Hospital roles and unit ownership (docs/roles.md) — pure TypeScript, no React Native imports,
 * so AppSync resolvers and Lambda functions apply exactly the same checks as the app.
 * Every right is enforced on the server with these functions; hiding screens is only a convenience.
 * Requirements: 1.3, 1.5, 9.1, 19.1, 19.8, 19.10
 */
import { DEPARTMENTS, isDepartment } from './departments';
import { GROUPS } from './session';

/** The units a nurse or technologist can own: exactly one per account (`custom:unit`). */
export const UNITS = ['ward', 'icu', 'nicu', 'er', 'radiology', 'cathlab', ...DEPARTMENTS] as const;
export type Unit = (typeof UNITS)[number];

/** Demo fallback: a general staff account that may update every item of its hospital. */
export const ALL_UNITS = 'all';
export type UnitClaim = Unit | typeof ALL_UNITS;

/** The status items of a hospital and the unit that owns each by default (specialists: DEFAULT_SPECIALIST_UNIT). */
export const DEFAULT_OWNER_UNIT: Record<'beds' | 'icu' | 'nicu' | 'ed' | 'ct' | 'mri' | 'cathlab', Unit> = {
  beds: 'ward',
  icu: 'icu',
  nicu: 'nicu',
  ed: 'er',
  ct: 'radiology',
  mri: 'radiology',
  cathlab: 'cathlab',
};

/** Specialist on-duty switches default to the emergency unit until an admin assigns another. */
export const DEFAULT_SPECIALIST_UNIT: Unit = 'er';

export function isUnit(value: unknown): value is Unit {
  return typeof value === 'string' && (UNITS as readonly string[]).includes(value);
}

/** True for a value an admin may put in `custom:unit` when inviting staff. */
export function isUnitClaim(value: unknown): value is UnitClaim {
  return value === ALL_UNITS || isUnit(value);
}

/** What the server knows about the caller, read from the ID token. */
export interface Caller {
  groups: readonly string[];
  hospitalId?: string;
  unit?: string;
}

const inGroup = (caller: Caller, group: string): boolean => caller.groups.includes(group);

/** True when the caller belongs to a hospital (has an id) — every staff-pool right needs this. */
const hasHospital = (caller: Caller): caller is Caller & { hospitalId: string } =>
  typeof caller.hospitalId === 'string' && caller.hospitalId.length > 0;

/** Unit staff update only the items their unit owns; `all` is the demo fallback. */
export function canUpdateStatusItem(
  caller: Caller,
  item: { hospitalId: string; ownerUnit: string },
): boolean {
  return (
    inGroup(caller, GROUPS.staff) &&
    hasHospital(caller) &&
    caller.hospitalId === item.hospitalId &&
    (caller.unit === ALL_UNITS || (isUnit(caller.unit) && caller.unit === item.ownerUnit))
  );
}

/**
 * Accept, decline, undo and messages on requests: unit staff of the request's hospital. A request
 * sent to a department (Cardiology, Surgery, Obstetrics) belongs to that department's staff only;
 * a request without one (general care) to the other units. A doctor's referral routed to a department is
 * answered by that department and, as a fallback, the other units, and by the receiving hospital's
 * doctors, who accept or decline referrals themselves. `all` answers everything.
 */
export function canAnswerRequest(caller: Caller, request: { hospitalId: string; department?: string | null; referralId?: string | null; fromHospitalId?: string | null }): boolean {
  if (!hasHospital(caller) || caller.hospitalId !== request.hospitalId) return false;
  // A doctor's referral is accepted or declined by the receiving hospital's doctors themselves, never by a
  // doctor of the hospital that sent it (no accepting your own referral).
  if (request.referralId && inGroup(caller, GROUPS.doctors) && request.fromHospitalId !== caller.hospitalId) return true;
  if (!inGroup(caller, GROUPS.staff)) return false;
  if (caller.unit === ALL_UNITS) return true;
  if (!isDepartment(request.department)) return !isDepartment(caller.unit);
  // A doctor's referral to a department can also be taken by the emergency and other units, so an urgent
  // transfer never waits at a hospital that has the department open but no department staff account.
  return caller.unit === request.department || (Boolean(request.referralId) && !isDepartment(caller.unit));
}

/** Doctors start referrals from their own hospital. */
export function canStartReferral(caller: Caller): boolean {
  return inGroup(caller, GROUPS.doctors) && hasHospital(caller);
}

/** Only the doctor who started a referral confirms or sets it aside. */
export function canConfirmReferral(caller: Caller & { userId?: string }, referral: { ownerId: string }): boolean {
  return canStartReferral(caller) && caller.userId !== undefined && caller.userId === referral.ownerId;
}

/**
 * Who may run the referral agent (agent-runner). Through AppSync: a doctor of the staff pool who owns the
 * referral; a public-pool token is refused even if it carries a `doctors` group. `direct` is true only for a
 * direct Lambda invoke by the evaluation runner (it needs IAM `lambda:InvokeFunction`, and AppSync never
 * forwards the field that marks it); such an invoke has no token claims and must still name the owner.
 */
export function mayRunReferralAgent(
  identity: { sub?: string; claims?: Record<string, unknown> } | null | undefined,
  ownerId: string,
  staffPoolId: string | undefined,
  direct: boolean,
): boolean {
  const sub = identity?.sub;
  if (typeof sub !== 'string' || !sub || sub !== ownerId) return false;
  if (direct && !identity?.claims) return true;
  const caller = callerFromClaims(identity?.claims, staffPoolId);
  return !!caller && canConfirmReferral({ ...caller, userId: sub }, { ownerId });
}

/** Settings, specialists, slots, auto-accept rules, unit ownership: admins of that hospital. */
export function canManageHospital(caller: Caller, hospitalId: string): boolean {
  return inGroup(caller, GROUPS.admins) && hasHospital(caller) && caller.hospitalId === hospitalId;
}

/**
 * Builds the caller from ID token claims, but only when the token was issued by the given user
 * pool. A token from another pool (for example a patient who self-registered as an admin in the
 * public pool) or an access token without the custom claims yields `undefined`.
 */
export function callerFromClaims(claims: Record<string, unknown> | undefined, poolId: string | undefined): Caller | undefined {
  if (!claims || !issuedBy(claims, poolId)) return undefined;
  const text = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
  return {
    groups: groupsOf(claims),
    hospitalId: text(claims['custom:hospitalId']),
    unit: text(claims['custom:unit']),
  };
}

/** True when the ID token was issued by the given user pool (its `iss` ends in `/<poolId>`). */
export function issuedBy(claims: Record<string, unknown> | undefined, poolId: string | undefined): boolean {
  return !!claims && !!poolId && typeof claims.iss === 'string' && claims.iss.endsWith(`/${poolId}`);
}

function groupsOf(claims: Record<string, unknown> | undefined): string[] {
  const groups = claims?.['cognito:groups'];
  return Array.isArray(groups) ? groups.map(String) : [];
}

/**
 * A patient: an ID token from the public pool with the `patients` group. A staff-pool token, or a
 * public-pool token without the group, is refused.
 */
export function isPatientToken(claims: Record<string, unknown> | undefined, publicPoolId: string | undefined): boolean {
  return issuedBy(claims, publicPoolId) && groupsOf(claims).includes(GROUPS.patients);
}

/** Any Medora account: a patient of the public pool, or a hospital account (any hospital group) of the staff pool. */
export function isSignedInToken(claims: Record<string, unknown> | undefined, pools: { publicPoolId?: string; staffPoolId?: string }): boolean {
  if (isPatientToken(claims, pools.publicPoolId)) return true;
  const hospitalGroups: readonly string[] = [GROUPS.staff, GROUPS.doctors, GROUPS.admins];
  return issuedBy(claims, pools.staffPoolId) && groupsOf(claims).some((g) => hospitalGroups.includes(g));
}

export interface Invitation {
  hospitalId: string;
  group: string;
  unit?: string;
}

export type InvitationCheck = { ok: true } | { ok: false; reason: 'not-admin' | 'other-hospital' | 'bad-group' | 'bad-unit' };

const INVITABLE_GROUPS: readonly string[] = [GROUPS.staff, GROUPS.doctors, GROUPS.admins];

/**
 * Checks an `invite-staff` call: only an admin, only for their own hospital, only staff-pool
 * groups, and unit staff must come with a valid `custom:unit`.
 */
export function checkInvitation(caller: Caller, invitation: Invitation): InvitationCheck {
  if (!inGroup(caller, GROUPS.admins) || !hasHospital(caller)) return { ok: false, reason: 'not-admin' };
  if (caller.hospitalId !== invitation.hospitalId) return { ok: false, reason: 'other-hospital' };
  if (!INVITABLE_GROUPS.includes(invitation.group)) return { ok: false, reason: 'bad-group' };
  if (invitation.group === GROUPS.staff && !isUnitClaim(invitation.unit)) return { ok: false, reason: 'bad-unit' };
  if (invitation.group !== GROUPS.staff && invitation.unit !== undefined) return { ok: false, reason: 'bad-unit' };
  return { ok: true };
}
