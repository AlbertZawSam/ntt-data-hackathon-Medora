/**
 * Registering a hospital: the checks the `register-hospital` Lambda applies, and the same input
 * validation the Hospital Setup screen uses to give early feedback. Pure TypeScript.
 * Requirements: 1.3, 1.5, 18.1, 18.6
 */
import { isInBangkok } from './places';
import { GROUPS } from './session';

export interface HospitalInput {
  nameEn: string;
  nameTh: string;
  lat: number;
  lng: number;
  totalBeds: number;
  nicuTotal: number;
}

export type HospitalInputIssue = 'name' | 'location' | 'beds' | 'nicu';

export type HospitalInputCheck = { ok: true; value: HospitalInput } | { ok: false; issue: HospitalInputIssue };

const MAX_NAME = 120;
const MAX_BEDS = 5000;
const MAX_NICU = 500;

const cleanName = (value: unknown): string => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '');
const isCount = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/** Names are required in both languages; the hospital must be inside Bangkok; counts are whole numbers. */
export function validateHospitalInput(raw: Partial<Record<keyof HospitalInput, unknown>>): HospitalInputCheck {
  const nameEn = cleanName(raw.nameEn);
  const nameTh = cleanName(raw.nameTh);
  if (!nameEn || !nameTh || nameEn.length > MAX_NAME || nameTh.length > MAX_NAME) return { ok: false, issue: 'name' };
  const { lat, lng } = raw;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !isInBangkok({ lat, lng })) return { ok: false, issue: 'location' };
  if (!isCount(raw.totalBeds, 1, MAX_BEDS)) return { ok: false, issue: 'beds' };
  if (!isCount(raw.nicuTotal, 0, MAX_NICU)) return { ok: false, issue: 'nicu' };
  return { ok: true, value: { nameEn, nameTh, lat, lng, totalBeds: raw.totalBeds, nicuTotal: raw.nicuTotal } };
}

export type RegistrationCheck =
  | { ok: true; username: string; sub: string }
  | { ok: false; reason: 'wrong-pool' | 'wrong-token' | 'not-admin' | 'already-registered' };

/**
 * An admin without a hospital may register one, once. The token must come from the public pool
 * (the staff pool's admins are created with a hospital already), must carry the `admins` group,
 * and must not already have `custom:hospitalId`. A token issued before registering stays valid for up
 * to an hour, so the Lambda also derives the profile id from `sub`: a second attempt then fails.
 */
export function checkRegistration(claims: Record<string, unknown> | undefined, publicPoolId: string | undefined): RegistrationCheck {
  if (!claims || !publicPoolId || typeof claims.iss !== 'string' || !claims.iss.endsWith(`/${publicPoolId}`)) {
    return { ok: false, reason: 'wrong-pool' };
  }
  const groups = claims['cognito:groups'];
  if (!Array.isArray(groups) || !groups.map(String).includes(GROUPS.admins)) return { ok: false, reason: 'not-admin' };
  const hospitalId = claims['custom:hospitalId'];
  if (typeof hospitalId === 'string' && hospitalId.length > 0) return { ok: false, reason: 'already-registered' };
  // Only an ID token carries the custom claims that make the "already registered" check meaningful.
  if (claims.token_use !== 'id') return { ok: false, reason: 'wrong-token' };
  const username = claims['cognito:username'];
  const sub = claims.sub;
  if (typeof username !== 'string' || username.length === 0 || typeof sub !== 'string' || sub.length === 0) {
    return { ok: false, reason: 'wrong-token' };
  }
  return { ok: true, username, sub };
}
