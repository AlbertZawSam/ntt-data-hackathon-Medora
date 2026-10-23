/**
 * Success metrics for the demo (requirement 20), worked out from records the app already keeps:
 * time to an accepted request and whether that hospital could treat the need, time to a referral
 * recommendation and whether placement fell inside the treatment window, and the share of status
 * items updated within 30 minutes. No patient text is used; only times, ids and yes/no outcomes.
 */
import { PATHWAYS } from './pathways';
import type { CareRequest, HospitalStatus, PathwayKey, Referral } from './types';

export const FRESH_WITHIN_MIN = 30;

export interface RequestMetrics {
  /** Requests that reached `accepted` (or completed). */
  accepted: number;
  total: number;
  /** Median seconds from submitting to acceptance; null when none were accepted. */
  medianSecondsToAccept: number | null;
  /** Share (0 to 1) of accepted requests whose hospital could treat the need; null when none were accepted. */
  couldTreatShare: number | null;
}

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

/** Patient and booking requests only: referral requests are measured in `referralMetrics`. */
export function requestMetrics(requests: readonly CareRequest[]): RequestMetrics {
  const own = requests.filter((r) => !r.referralId);
  const accepted = own.filter((r) => (r.status === 'accepted' || r.status === 'completed') && typeof r.acceptedAtMs === 'number');
  const seconds = accepted.map((r) => Math.max(0, Math.round(((r.acceptedAtMs as number) - r.createdAtMs) / 1000)));
  const treat = accepted.filter((r) => r.couldTreat !== undefined);
  return {
    accepted: accepted.length,
    total: own.length,
    medianSecondsToAccept: median(seconds),
    couldTreatShare: treat.length === 0 ? null : treat.filter((r) => r.couldTreat === true).length / treat.length,
  };
}

export interface ReferralMetrics {
  recommended: number;
  total: number;
  medianSecondsToRecommendation: number | null;
  /** Share of recommended referrals with a window whose placement fell inside it; null when none had a window. */
  insideWindowShare: number | null;
}

/**
 * Inside the window when the time already spent, the drive and the hospital's preparation still fit
 * in the pathway's window from symptom onset. Pathways with no window, or referrals with no stated
 * onset, are left out of the share.
 */
export function placementInsideWindow(referral: Referral): boolean | null {
  const pathway = referral.pathway ? PATHWAYS[referral.pathway as PathwayKey] : undefined;
  if (!pathway || pathway.windowMin === null || referral.onsetMin === undefined || referral.etaMin === undefined) return null;
  const elapsedMin = (referral.elapsedSec ?? 0) / 60;
  return referral.onsetMin + elapsedMin + referral.etaMin + pathway.prepMin <= pathway.windowMin;
}

export function referralMetrics(referrals: readonly Referral[]): ReferralMetrics {
  const done = referrals.filter((r) => typeof r.recommendedAtMs === 'number' && r.chosenId && r.status !== 'failed');
  const seconds = done.map((r) => Math.max(0, Math.round(((r.recommendedAtMs as number) - r.startedAtMs) / 1000)));
  const windows = done.map(placementInsideWindow).filter((v): v is boolean => v !== null);
  return {
    recommended: done.length,
    total: referrals.length,
    medianSecondsToRecommendation: median(seconds),
    insideWindowShare: windows.length === 0 ? null : windows.filter(Boolean).length / windows.length,
  };
}

/** Share (0 to 1) of status items last changed within 30 minutes; null when no item has ever been updated. */
export function freshItemShare(status: HospitalStatus, nowMs: number): number | null {
  const times = Object.entries(status.meta ?? {})
    .filter(([id]) => id !== 'confirm')
    .map(([, m]) => Date.parse(m.at))
    .filter((t) => Number.isFinite(t));
  if (times.length === 0) return null;
  return times.filter((t) => nowMs - t <= FRESH_WITHIN_MIN * 60_000).length / times.length;
}
