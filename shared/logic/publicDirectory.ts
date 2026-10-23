/**
 * The public view of a hospital for people seeking care: simple labels per type of care and how
 * fresh the data is, never bed counts, equipment faults or staff rosters (AGENTS.md rule 6).
 * The backend derives one entry from the full status whenever it changes; the patient app ranks
 * the entries on the phone. Pure TypeScript, shared by Lambda functions, scripts and the app.
 * Requirements: 4.2, 5.2 to 5.6, 9.2
 */
import { pathwayForNeed, SCORING } from './pathways';
import { driveEstimate, failsFor, freeBeds, haversineKm, type LatLng } from './ranking';
import type { Bi, Failure, HospitalStatus, NeedKey, ScoringWeights } from './types';

export const NEED_KEYS: readonly NeedKey[] = ['maternity', 'child', 'injury', 'general'];

export type PublicLabel = 'available' | 'limited' | 'unavailable';

/**
 * Why a hospital can't help, in words safe for the public: the department is closed or diverting,
 * no specialist is on duty, or it is full. Equipment problems are shown only as "can't take this
 * kind of patient right now" (`notNow`), never as a fault.
 */
export type SkipReason = 'closed' | 'noSpecialist' | 'full' | 'notNow';

export interface PublicNeed {
  label: PublicLabel;
  reason?: SkipReason;
  /**
   * Score bonus when the pathway's preferred department is open (−3). The last-bed penalty is not
   * stored here: it would tell "last bed" apart from "unclear data"; ranking adds it for every
   * "limited" hospital instead.
   */
  adjust: number;
}

export interface PublicEntry {
  hospitalId: string;
  name: Bi;
  lat: number;
  lng: number;
  typicalWaitMin: number;
  /** Emergency department open (for the 1669 screen's nearest open emergency department). */
  edOpen: boolean;
  /** Staff marked the data as unclear. */
  conflict: boolean;
  /** When staff last confirmed the status (ISO). The epoch means "never updated". */
  updatedAt: string;
  needs: Record<NeedKey, PublicNeed>;
}

export interface PublicProfile {
  hospitalId: string;
  name: Bi;
  lat: number;
  lng: number;
  typicalWaitMin: number;
}

function reasonFor(failure: Failure): SkipReason {
  switch (failure.kind) {
    case 'dept':
      return 'closed';
    case 'onDuty':
      return 'noSpecialist';
    case 'beds':
    case 'nicu':
      return 'full';
    default:
      return 'notNow';
  }
}

/** Derives the public labels for one hospital from its full status. */
export function publicEntry(profile: PublicProfile, status: HospitalStatus, weights: ScoringWeights = SCORING): PublicEntry {
  const needs = Object.fromEntries(
    NEED_KEYS.map((need): [NeedKey, PublicNeed] => {
      const pathway = pathwayForNeed(need);
      const failures = failsFor(status, pathway);
      if (failures.length > 0) return [need, { label: 'unavailable', reason: reasonFor(failures[0]), adjust: 0 }];
      const lastBed = pathway.needsBed && freeBeds(status) <= 1;
      const preferOpen = pathway.prefer !== undefined && status.depts[pathway.prefer] === 'open';
      const adjust = preferOpen ? weights.preferBonus : 0;
      return [need, { label: lastBed || status.conflict ? 'limited' : 'available', adjust }];
    }),
  ) as Record<NeedKey, PublicNeed>;
  return {
    hospitalId: profile.hospitalId,
    name: profile.name,
    lat: profile.lat,
    lng: profile.lng,
    typicalWaitMin: profile.typicalWaitMin,
    edOpen: status.depts.ed === 'open',
    conflict: status.conflict,
    updatedAt: status.updatedAt,
    needs,
  };
}

/** Minutes since the entry was last confirmed; Infinity when it never was. */
export function entryAgeMin(entry: PublicEntry, nowMs: number): number {
  const at = Date.parse(entry.updatedAt);
  return Number.isFinite(at) && at > 0 ? Math.max(0, (nowMs - at) / 60_000) : Infinity;
}

export interface PublicRanked {
  entry: PublicEntry;
  need: PublicNeed;
  distanceKm: number;
  driveMin: number;
  /** Lower is better; Infinity when the hospital can't help. */
  score: number;
  /** Data older than 30 minutes: shown as "may be outdated" and ranked lower. */
  stale: boolean;
  eligible: boolean;
}

/**
 * Ranks hospitals for one need from the patient's position, with the same score as the full ranking:
 * drive + wait × 0.2 + 10 if stale + 12 if unclear + 3 if limited + the preferred-department bonus. Hospitals that can help
 * come first by score; then those that can't, nearest first.
 */
export function rankPublic(
  entries: readonly PublicEntry[],
  need: NeedKey,
  origin: LatLng,
  nowMs: number,
  weights: ScoringWeights = SCORING,
): PublicRanked[] {
  const at = new Date(nowMs);
  return entries
    .map((entry): PublicRanked => {
      const needInfo = entry.needs[need] ?? { label: 'unavailable', reason: 'notNow', adjust: 0 };
      const distanceKm = haversineKm(origin, entry);
      const driveMin = driveEstimate(distanceKm, at);
      const stale = entryAgeMin(entry, nowMs) > weights.staleAfterMin;
      const eligible = needInfo.label !== 'unavailable';
      const score = eligible
        ? driveMin +
          entry.typicalWaitMin * weights.waitWeight +
          (stale ? weights.stalePenalty : 0) +
          (entry.conflict ? weights.unclearPenalty : 0) +
          (needInfo.label === 'limited' ? weights.lowBedPenalty : 0) +
          needInfo.adjust
        : Infinity;
      return { entry, need: needInfo, distanceKm, driveMin, score, stale, eligible };
    })
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      if (a.eligible && a.score !== b.score) return a.score - b.score;
      return a.driveMin - b.driveMin;
    });
}

/**
 * Closer hospitals than the best one that can't help: the "skipped because" explanations (5.5).
 * Only hospitals nearer than the top recommendation are listed, nearest first.
 */
export function skippedCloser(ranked: readonly PublicRanked[]): PublicRanked[] {
  const best = ranked.find((r) => r.eligible);
  const limit = best ? best.driveMin : Infinity;
  return ranked.filter((r) => !r.eligible && r.driveMin < limit).sort((a, b) => a.driveMin - b.driveMin);
}

/** The nearest hospital with an open emergency department, for the 1669 screen (4.2). */
export function nearestOpenEd(entries: readonly PublicEntry[], origin: LatLng, nowMs: number): { entry: PublicEntry; driveMin: number; distanceKm: number } | null {
  const at = new Date(nowMs);
  let best: { entry: PublicEntry; driveMin: number; distanceKm: number } | null = null;
  for (const entry of entries) {
    if (!entry.edOpen) continue;
    const distanceKm = haversineKm(origin, entry);
    const driveMin = driveEstimate(distanceKm, at);
    if (!best || driveMin < best.driveMin) best = { entry, driveMin, distanceKm };
  }
  return best;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validates an entry read from the API (AWSJSON); malformed rows are dropped rather than guessed. */
export function parsePublicEntry(raw: unknown): PublicEntry | null {
  const value = typeof raw === 'string' ? safeParse(raw) : raw;
  if (!isRecord(value) || !isRecord(value.name) || !isRecord(value.needs)) return null;
  const { hospitalId, lat, lng, typicalWaitMin, edOpen, conflict, updatedAt } = value;
  if (
    typeof hospitalId !== 'string' ||
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    typeof typicalWaitMin !== 'number' ||
    typeof edOpen !== 'boolean' ||
    typeof conflict !== 'boolean' ||
    typeof updatedAt !== 'string' ||
    typeof value.name.en !== 'string' ||
    typeof value.name.th !== 'string'
  ) {
    return null;
  }
  const needs = value.needs;
  for (const need of NEED_KEYS) {
    const n = needs[need];
    if (!isRecord(n) || (n.label !== 'available' && n.label !== 'limited' && n.label !== 'unavailable')) return null;
  }
  return value as unknown as PublicEntry;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
