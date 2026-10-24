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

/** The status items of a hospital, and the unit that owns each by default. */
export const STATUS_ITEM_TYPES = [
  'beds',
  'icu',
  'nicu',
  'ed',
  'ct',
  'mri',
  'cathlab',
  'specialist',
] as const;
export type StatusItemType = (typeof STATUS_ITEM_TYPES)[number];

export const DEFAULT_OWNER_UNIT: Record<Exclude<StatusItemType, 'specialist'>, Unit> = {
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
 * answered by that department and, as a fallback, the other units. `all` answers everything.
 */
export function canAnswerRequest(caller: Caller, request: { hospitalId: string; department?: string | null; referralId?: string | null }): boolean {
  if (!inGroup(caller, GROUPS.staff) || !hasHospital(caller) || caller.hospitalId !== request.hospitalId) return false;
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
  if (!claims || !poolId || typeof claims.iss !== 'string' || !claims.iss.endsWith(`/${poolId}`)) return undefined;
  const groups = claims['cognito:groups'];
  const text = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
  return {
    groups: Array.isArray(groups) ? groups.map(String) : [],
    hospitalId: text(claims['custom:hospitalId']),
    unit: text(claims['custom:unit']),
  };
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

/** Items shown on a staff member's "My unit" screen. */
export function itemsForUnit<T extends { ownerUnit: string }>(unit: string | undefined, items: readonly T[]): T[] {
  if (unit === ALL_UNITS) return [...items];
  return isUnit(unit) ? items.filter((i) => i.ownerUnit === unit) : [];
}
