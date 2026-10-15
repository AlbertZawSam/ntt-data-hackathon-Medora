import { scoring as defaultScoring } from './data';
import { dataAgeMin, type Evaluation, type Failure } from './ranking';
import type { Pathway, Scoring } from './types';

// What patients may see about a hospital (requirement 5.6, safety rule 6): simple labels,
// never bed counts, equipment faults or rosters. Screens turn these keys into text.

export type Availability = 'available' | 'limited' | 'unavailable';

// Limited: it can help, but with its last bed, unclear data, or data nobody confirmed recently.
export function availability(e: Evaluation, pathway: Pathway, nowMs: number, s: Scoring = defaultScoring): Availability {
  if (!e.canHelp) return 'unavailable';
  const { status } = e.hospital;
  const lastBed = pathway.needsBed && status.beds <= 1;
  const stale = dataAgeMin(status, nowMs) > s.staleAfterMin;
  return lastBed || status.conflict || stale ? 'limited' : 'available';
}

export type Freshness = { kind: 'fresh'; minutes: number } | { kind: 'stale' } | { kind: 'unknown' };

export function freshness(e: Evaluation, nowMs: number, s: Scoring = defaultScoring): Freshness {
  const age = dataAgeMin(e.hospital.status, nowMs);
  if (!Number.isFinite(age)) return { kind: 'unknown' };
  return age > s.staleAfterMin ? { kind: 'stale' } : { kind: 'fresh', minutes: Math.round(age) };
}

export type SkipReason = 'notTaking' | 'noDepartment' | 'cantTreat' | 'noDoctor' | 'noBed' | 'tooFar';

// One plain reason a hospital can't help, most useful first. An equipment fault is
// reported only as "can't treat this right now".
export function skipReason(fails: Failure[]): SkipReason | null {
  const has = (kind: Failure['kind']) => fails.some((f) => f.kind === kind);
  if (fails.some((f) => f.kind === 'dept' && f.state === 'diverting')) return 'notTaking';
  if (fails.some((f) => f.kind === 'dept' && f.state === 'none')) return 'noDepartment';
  if (has('equip')) return 'cantTreat';
  if (has('oncall')) return 'noDoctor';
  if (has('bed') || has('nicu')) return 'noBed';
  if (has('tooFar')) return 'tooFar';
  return null;
}

// The closest hospital by distance when it can't help, so the screen can say why it was
// skipped (requirement 5.5). Null when the closest one can help.
export function skippedNearest(rows: Evaluation[]): Evaluation | null {
  if (rows.length === 0) return null;
  const nearest = rows.reduce((a, b) => (b.km < a.km ? b : a));
  return nearest.canHelp ? null : nearest;
}
