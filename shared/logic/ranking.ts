/**
 * Ranking engine — pure TypeScript, no React Native imports.
 * Filters hospitals that can't help (`failsFor`), then ranks the rest by `score` (lowest wins).
 * Requirements: 5.2, 5.3, 5.4
 */
import { SCORING } from './pathways';
import { remainingWindow, tooFar } from './timeBudget';
import type {
  Failure,
  HospitalStatus,
  NeedKey,
  Pathway,
  RankableHospital,
  RankedHospital,
  ScoringWeights,
} from './types';

export interface LatLng {
  lat: number;
  lng: number;
}

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const rad = (d: number): number => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export type Traffic = 'rush' | 'night' | 'normal';

/** Bangkok (UTC+7, no daylight saving) minutes since midnight, so phones and Lambda agree. */
function bangkokMinuteOfDay(at: Date): number {
  return (at.getUTCHours() * 60 + at.getUTCMinutes() + 7 * 60) % (24 * 60);
}

/** Rush hours 07:00–09:30 and 16:30–19:30; night 22:00–06:00; otherwise normal. */
export function traffic(at: Date): Traffic {
  const m = bangkokMinuteOfDay(at);
  if ((m >= 7 * 60 && m < 9 * 60 + 30) || (m >= 16 * 60 + 30 && m < 19 * 60 + 30)) return 'rush';
  if (m >= 22 * 60 || m < 6 * 60) return 'night';
  return 'normal';
}

const SPEED_KMH: Record<Traffic, number> = { rush: 15, night: 40, normal: 25 };
/** Roads are longer than the straight line. */
const ROAD_FACTOR = 1.35;
const AMBULANCE_FACTOR = 1.5;

/** On-device drive estimate in minutes (Lambda uses the Amazon Location route matrix instead). */
export function driveEstimate(distanceKm: number, at: Date, ambulance = false): number {
  const speed = SPEED_KMH[traffic(at)] * (ambulance ? AMBULANCE_FACTOR : 1);
  return ((distanceKm * ROAD_FACTOR) / speed) * 60;
}

/** Ready general beds not held by a reservation; reserved beds count as not free (requirement 19.3). */
export function freeBeds(status: HospitalStatus): number {
  return Math.max(0, status.beds - (status.reservedBeds ?? 0));
}

/** Ready NICU cots not held by a reservation. */
export function freeNicu(status: HospitalStatus): number {
  return Math.max(0, status.nicu - (status.reservedNicu ?? 0));
}

/** Reasons a hospital can't take this pathway right now; empty means it can. */
export function failsFor(status: HospitalStatus, pathway: Pathway): Failure[] {
  const failures: Failure[] = [];
  for (const dept of pathway.departments) {
    if (status.depts[dept] !== 'open') failures.push({ kind: 'dept', item: dept });
  }
  for (const item of pathway.equipment) {
    if (status.equip[item] !== true) failures.push({ kind: 'equip', item });
  }
  for (const role of pathway.onDuty) {
    if (status.oncall[role] !== true) failures.push({ kind: 'onDuty', item: role });
  }
  if (pathway.needsBed && freeBeds(status) <= 0) failures.push({ kind: 'beds' });
  if (pathway.needsNicu && freeNicu(status) <= 0) failures.push({ kind: 'nicu' });
  return failures;
}

/** Minutes since staff last confirmed the status. */
export function dataAgeMin(status: HospitalStatus, nowMs: number): number {
  return Math.max(0, (nowMs - Date.parse(status.updatedAt)) / 60_000);
}

export function isStale(status: HospitalStatus, nowMs: number, weights: ScoringWeights = SCORING): boolean {
  return dataAgeMin(status, nowMs) > weights.staleAfterMin;
}

/**
 * Lower is better:
 * drive + wait × 0.2 + 10 (stale) + 12 (unclear) + 3 (needs a bed and ≤ 1 free) − 3 (preferred dept open).
 */
export function score(
  hospital: RankableHospital,
  pathway: Pathway,
  driveMin: number,
  nowMs: number,
  weights: ScoringWeights = SCORING,
): number {
  const { status } = hospital;
  let s = driveMin + hospital.typicalWaitMin * weights.waitWeight;
  if (isStale(status, nowMs, weights)) s += weights.stalePenalty;
  if (status.conflict) s += weights.unclearPenalty;
  if (pathway.needsBed && freeBeds(status) <= 1) s += weights.lowBedPenalty;
  if (pathway.prefer !== undefined && status.depts[pathway.prefer] === 'open') s += weights.preferBonus;
  return s;
}

export interface EvaluateOptions {
  nowMs: number;
  ambulance?: boolean;
  /** Minutes since symptom onset; enables the "too far" check for pathways with a window. */
  onsetMin?: number;
  /** Drive minutes by hospital id (e.g. from a route matrix); falls back to `driveEstimate`. */
  driveMinById?: Record<string, number>;
}

/**
 * Ranks every hospital: those that can help first by ascending score (ties: shorter drive),
 * then those that can't, nearest first, each with its failures.
 */
export function evaluate(
  hospitals: RankableHospital[],
  pathway: Pathway,
  origin: LatLng,
  opts: EvaluateOptions,
): RankedHospital[] {
  const at = new Date(opts.nowMs);
  const remaining = opts.onsetMin === undefined ? Infinity : remainingWindow(pathway, opts.onsetMin);

  const ranked = hospitals.map((hospital): RankedHospital => {
    const distanceKm = haversineKm(origin, hospital);
    const driveMin = opts.driveMinById?.[hospital.id] ?? driveEstimate(distanceKm, at, opts.ambulance);
    const failures = failsFor(hospital.status, pathway);
    if (tooFar(driveMin, pathway.prepMin, remaining)) failures.push({ kind: 'tooFar' });
    const eligible = failures.length === 0;
    return {
      hospital,
      driveMin,
      distanceKm,
      score: eligible ? score(hospital, pathway, driveMin, opts.nowMs) : Infinity,
      stale: isStale(hospital.status, opts.nowMs),
      failures,
      eligible,
    };
  });

  return ranked.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (a.eligible && a.score !== b.score) return a.score - b.score;
    return a.driveMin - b.driveMin;
  });
}

// English keywords match whole words; Thai has no spaces between words, so Thai keywords match as substrings.
const NEED_KEYWORDS: Array<{ need: NeedKey; en: RegExp; th: string[] }> = [
  {
    need: 'maternity',
    en: /\b(pregnan\w*|labou?r pains?|in labou?r|contractions?|waters? broke|weeks? pregnant|giving birth|midwife)\b/,
    th: ['ตั้งครรภ์', 'ตั้งท้อง', 'คลอด', 'น้ำเดิน', 'มดลูกบีบ'],
  },
  {
    need: 'child',
    en: /\b(child|children|kids?|son|daughter|baby|babies|infant|toddler|newborn|\d+[- ]?(year|month)[- ]old)\b/,
    th: ['เด็ก', 'ลูก', 'ทารก', 'ขวบ'],
  },
  {
    need: 'injury',
    en: /\b(injur\w*|fractur\w*|broken|break|sprain\w*|twist\w*|wound|cut|fell|fall|accident|crash|burn\w*|dislocat\w*)\b/,
    th: ['บาดเจ็บ', 'อุบัติเหตุ', 'กระดูก', 'แพลง', 'ล้ม', 'แผล', 'รถชน'],
  },
];

/** Keyword fallback when the AI classifier is unavailable. */
export function classifyNeed(description: string): NeedKey {
  const text = description.toLowerCase();
  for (const { need, en, th } of NEED_KEYWORDS) {
    if (en.test(text) || th.some((word) => text.includes(word))) return need;
  }
  return 'general';
}
