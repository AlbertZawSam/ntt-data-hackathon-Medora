/**
 * A doctor refers one of their hospital's patients to a hospital and department they choose (the AI
 * agent stays available as the alternative). The receiving department accepts or declines; the doctor
 * then confirms the transfer as for an AI referral. Pure TypeScript, used by `referral-actions`,
 * `care-actions` and the doctor screen. Requirements: 13.1, 13.2
 */
import { isDepartment, openDepartments } from './departments';
import { hospitalDetails, type HospitalDetails } from './hospitalDetails';
import type { PublicProfile } from './publicDirectory';
import { driveEstimate, haversineKm } from './ranking';
import type { SpecialistRecord } from './specialists';
import type { Bi, HospitalStatus } from './types';

export interface ReferralTarget {
  hospitalId: string;
  name: Bi;
  lat: number;
  lng: number;
  /** Estimated drive from the referring hospital. */
  driveMin: number;
  /** The same public view patients get: labels, bed ranges, departments, specialties on duty. */
  details: HospitalDetails;
}

/** Every other hospital the doctor can refer to, nearest first. */
export function referralTargets(
  origin: { hospitalId: string; lat: number; lng: number },
  hospitals: ReadonlyArray<{ profile: PublicProfile; status: HospitalStatus }>,
  specialists: readonly SpecialistRecord[],
  nowMs: number,
): ReferralTarget[] {
  const at = new Date(nowMs);
  return hospitals
    .filter((h) => h.profile.hospitalId !== origin.hospitalId)
    .map((h) => ({
      hospitalId: h.profile.hospitalId,
      name: h.profile.name,
      lat: h.profile.lat,
      lng: h.profile.lng,
      driveMin: Math.round(driveEstimate(haversineKm(origin, h.profile), at)),
      details: hospitalDetails(h.profile, h.status, specialists, nowMs),
    }))
    .sort((a, b) => a.driveMin - b.driveMin);
}

export type DirectReferralCheck = { ok: true } | { ok: false; reason: 'not-your-patient' | 'same-hospital' | 'no-hospital' | 'bad-department' };

/**
 * The doctor may refer only a patient whose request is at their own hospital, to another hospital that
 * exists, and to a department that hospital has open (or to no department: its emergency unit).
 */
export function checkDirectReferral(
  doctorHospitalId: string,
  source: { hospitalId: string },
  toHospitalId: string,
  toStatus: HospitalStatus | undefined,
  department: unknown,
): DirectReferralCheck {
  if (source.hospitalId !== doctorHospitalId) return { ok: false, reason: 'not-your-patient' };
  if (toHospitalId === doctorHospitalId) return { ok: false, reason: 'same-hospital' };
  if (!toStatus) return { ok: false, reason: 'no-hospital' };
  if (department !== undefined && department !== null && department !== '' && !(isDepartment(department) && openDepartments(toStatus).includes(department))) {
    return { ok: false, reason: 'bad-department' };
  }
  return { ok: true };
}
