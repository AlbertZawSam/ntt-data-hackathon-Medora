import { scoring as defaultScoring } from './data';
import { tooFar } from './timeBudget';
import type { Hospital, HospitalStatus, LatLng, Pathway, Scoring } from './types';

// Phone-side drive estimate and hospital ranking (design.md "Shared logic").
// Lambda replaces the drive estimate with an Amazon Location route matrix.

const ROAD_FACTOR = 1.35;
const AMBULANCE_SPEEDUP = 1.5;
// Thailand is UTC+7 all year. Lambda runs in UTC, so never use the device's time zone.
const BANGKOK_OFFSET_MIN = 7 * 60;

export type TrafficKind = 'rush' | 'night' | 'normal';
export type Traffic = { kind: TrafficKind; kmh: number };

const hm = (h: number, m = 0) => h * 60 + m;

// Minutes since midnight, Bangkok time.
export function bangkokMinutes(at: Date): number {
  const utc = at.getUTCHours() * 60 + at.getUTCMinutes();
  return (utc + BANGKOK_OFFSET_MIN) % (24 * 60);
}

// Rush hours 07:00–09:30 and 16:30–19:30; night (our choice, the spec leaves it open) 22:00–06:00.
export function traffic(at: Date): Traffic {
  const m = bangkokMinutes(at);
  if ((m >= hm(7) && m < hm(9, 30)) || (m >= hm(16, 30) && m < hm(19, 30))) return { kind: 'rush', kmh: 15 };
  if (m >= hm(22) || m < hm(6)) return { kind: 'night', kmh: 40 };
  return { kind: 'normal', kmh: 25 };
}

// Straight-line distance (haversine).
export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export type DriveOptions = { at: Date; ambulance?: boolean };
export type Drive = { km: number; min: number; traffic: Traffic };

// Road distance is straight-line × 1.35. An ambulance drives 1.5× faster (our reading of "ambulances × 1.5").
export function driveEstimate(from: LatLng, to: LatLng, { at, ambulance = false }: DriveOptions): Drive {
  const km = distanceKm(from, to) * ROAD_FACTOR;
  const t = traffic(at);
  const kmh = t.kmh * (ambulance ? AMBULANCE_SPEEDUP : 1);
  return { km, min: Math.round((km / kmh) * 60), traffic: t };
}

export type Failure =
  | { kind: 'dept'; item: string; state: 'diverting' | 'none' }
  | { kind: 'equip'; item: string }
  | { kind: 'oncall'; item: string }
  | { kind: 'bed' }
  | { kind: 'nicu' }
  // Drive + preparation won't fit in the treatment window (set by evaluate, not failsFor).
  | { kind: 'tooFar' };

// Every reason this hospital can't take the pathway right now; empty means it can.
export function failsFor(status: HospitalStatus, pathway: Pathway): Failure[] {
  const fails: Failure[] = [];
  for (const item of pathway.departments) {
    const state = status.depts[item];
    if (state !== 'open') fails.push({ kind: 'dept', item, state: state ?? 'none' });
  }
  for (const item of pathway.equipment) if (!status.equip[item]) fails.push({ kind: 'equip', item });
  for (const item of pathway.onDuty) if (!status.oncall[item]) fails.push({ kind: 'oncall', item });
  if (pathway.needsBed && status.beds < 1) fails.push({ kind: 'bed' });
  if (pathway.needsNicu && status.nicu < 1) fails.push({ kind: 'nicu' });
  return fails;
}

// Minutes since staff last confirmed the status; unknown counts as stale.
export function dataAgeMin(status: HospitalStatus, nowMs: number): number {
  if (status.updatedAt !== undefined) return Math.max(0, (nowMs - status.updatedAt) / 60_000);
  return status.ageMin ?? Infinity;
}

// Lower is better: drive + wait × 0.2, plus penalties for stale or unclear data and a last free bed,
// minus a bonus when the preferred department is open.
export function score(
  hospital: Hospital,
  pathway: Pathway,
  driveMin: number,
  nowMs: number,
  s: Scoring = defaultScoring,
): number {
  const { status } = hospital;
  let total = driveMin + hospital.typicalWaitMin * s.waitWeight;
  if (dataAgeMin(status, nowMs) > s.staleAfterMin) total += s.stalePenalty;
  if (status.conflict) total += s.unclearPenalty;
  if (pathway.needsBed && status.beds <= 1) total += s.lowBedPenalty;
  if (pathway.prefer && status.depts[pathway.prefer] === 'open') total += s.preferBonus;
  return total;
}

export type Evaluation = {
  hospital: Hospital;
  km: number;
  driveMin: number;
  score: number;
  fails: Failure[];
  canHelp: boolean;
};

export type EvaluateOptions = DriveOptions & {
  scoring?: Scoring;
  // Minutes left in the treatment window (timeBudget.remainingWindow); omit to skip the "too far" check.
  remainingMin?: number | null;
};

// Hospitals that can help come first, best score first; the rest follow nearest first,
// so the screen can explain why a closer hospital was skipped.
export function evaluate(
  hospitals: Hospital[],
  pathway: Pathway,
  origin: LatLng,
  { scoring: s = defaultScoring, remainingMin = null, ...drive }: EvaluateOptions,
): Evaluation[] {
  const nowMs = drive.at.getTime();
  const rows = hospitals.map((hospital) => {
    const { km, min } = driveEstimate(origin, hospital, drive);
    const fails = failsFor(hospital.status, pathway);
    if (tooFar(min, pathway, remainingMin)) fails.push({ kind: 'tooFar' });
    return { hospital, km, driveMin: min, score: score(hospital, pathway, min, nowMs, s), fails, canHelp: fails.length === 0 };
  });
  return rows.sort(
    (a, b) =>
      Number(b.canHelp) - Number(a.canHelp) ||
      (a.canHelp ? a.score - b.score : 0) ||
      a.km - b.km ||
      a.hospital.id.localeCompare(b.hospital.id),
  );
}
