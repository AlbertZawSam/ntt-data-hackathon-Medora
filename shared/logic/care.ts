/**
 * Patient requests to hospitals: validation, the allowed state changes, auto-accept and the simple
 * labels the public sees. Pure TypeScript, used by the `care-actions` and `find-care` Lambdas and
 * by the apps, so a screen and the server follow the same rules.
 * Requirements: 5.4, 5.5, 6.1 to 6.6, 7.1 to 7.4, 18.6 (public users see simple labels only)
 */
import { pathwayForNeed } from './pathways';
import { dataAgeMin, failsFor, freeBeds, freeNicu } from './ranking';
import { ruleAccepts } from './rules';
import type { CareRequest, CareRequestStatus, HospitalStatus, NeedKey, Pathway, RankedHospital } from './types';

/** Staff can undo an automatic acceptance for this long (AGENTS.md section 4, rule 3). */
export const UNDO_WINDOW_MS = 60_000;
/** A request nobody answers within this time is marked `no_reply` (requirement 6.5). */
export const NO_REPLY_MS = 45_000;

export const NEED_KEYS: readonly NeedKey[] = ['maternity', 'child', 'injury', 'general'];
export const ARRIVAL_MODES = ['car', 'taxi', 'ambulance', 'walking'] as const;
export type ArrivalMode = (typeof ARRIVAL_MODES)[number];

export const MAX_DESCRIPTION = 1000;
export const MAX_NAME = 80;
export const MAX_MESSAGE = 500;

/** Quick replies are stored as keys (so they show in either language); keys match `message.quickReply.*`. */
export const QUICK_REPLY_KEYS = ['onMyWay', 'enterMainEntrance', 'goToEmergency', 'waitingForYou', 'bringDocuments'] as const;
/** Quick replies staff send to a referring doctor: logistics only, never clinical advice. */
export const REFERRAL_REPLY_KEYS = ['bedReady', 'teamWaiting', 'sendEcg', 'sendImaging', 'callBeforeArrival'] as const;
export type QuickReplyKey = (typeof QUICK_REPLY_KEYS)[number] | (typeof REFERRAL_REPLY_KEYS)[number];

/** The quick replies that fit a request: doctor referrals get their own set; patient requests the patient set. */
export function quickRepliesFor(request: { referralId?: string | null }): readonly QuickReplyKey[] {
  return request.referralId ? REFERRAL_REPLY_KEYS : QUICK_REPLY_KEYS;
}

export interface RequestInput {
  hospitalId: string;
  needKey: NeedKey;
  etaMin: number;
  mode: ArrivalMode;
  name?: string;
  phone?: string;
  description: string;
}

export type RequestInputCheck = { ok: true; value: RequestInput } | { ok: false; issue: 'hospital' | 'need' | 'eta' | 'mode' | 'description' | 'name' | 'phone' };

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

export function validateRequestInput(raw: Partial<Record<keyof RequestInput, unknown>>): RequestInputCheck {
  const hospitalId = clean(raw.hospitalId);
  if (!hospitalId || hospitalId.length > 64) return { ok: false, issue: 'hospital' };
  if (!NEED_KEYS.includes(raw.needKey as NeedKey)) return { ok: false, issue: 'need' };
  if (typeof raw.etaMin !== 'number' || !Number.isFinite(raw.etaMin) || raw.etaMin < 0 || raw.etaMin > 600) return { ok: false, issue: 'eta' };
  if (!ARRIVAL_MODES.includes(raw.mode as ArrivalMode)) return { ok: false, issue: 'mode' };
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  if (description.length === 0 || description.length > MAX_DESCRIPTION) return { ok: false, issue: 'description' };
  const name = clean(raw.name);
  if (name.length > MAX_NAME) return { ok: false, issue: 'name' };
  const phone = clean(raw.phone);
  if (phone && !/^[+0-9 ()-]{6,20}$/.test(phone)) return { ok: false, issue: 'phone' };
  return {
    ok: true,
    value: {
      hospitalId,
      needKey: raw.needKey as NeedKey,
      etaMin: Math.round(raw.etaMin),
      mode: raw.mode as ArrivalMode,
      ...(name ? { name } : {}),
      ...(phone ? { phone } : {}),
      description,
    },
  };
}

/** The pathway used to judge a patient's need; a plain visit (general need) is judged by the visit rule. */
export function targetForNeed(need: NeedKey): Pathway | 'visit' {
  return need === 'general' ? 'visit' : pathwayForNeed(need);
}

export interface NewRequestDecision {
  status: Extract<CareRequestStatus, 'waiting' | 'accepted'>;
  auto: boolean;
  reason?: string;
  overrideUntil?: number;
}

/** Accepts at once only when the admin's rule allows it; staff can undo for 60 seconds. */
export function decideNewRequest(status: HospitalStatus, need: NeedKey, nowMs: number): NewRequestDecision {
  if (ruleAccepts(status, targetForNeed(need))) {
    return { status: 'accepted', auto: true, reason: 'accepted_by_rule', overrideUntil: nowMs + UNDO_WINDOW_MS };
  }
  return { status: 'waiting', auto: false };
}

/** Whether the hospital could treat this need right now (for the success metrics, requirement 20.1). */
export function couldTreat(status: HospitalStatus, need: NeedKey): boolean {
  const target = targetForNeed(need);
  return target === 'visit' ? status.depts.ed === 'open' : failsFor(status, target).length === 0;
}

export type RequestAction = 'accept' | 'decline' | 'undo' | 'cancel' | 'expire' | 'arrived';

export type TransitionResult = { ok: true; status: CareRequestStatus } | { ok: false; reason: 'bad-state' | 'undo-expired' | 'too-early' };

/**
 * The only allowed moves. Staff accept or decline a waiting request; undo reverses an automatic
 * acceptance within 60 seconds; the patient cancels a waiting or accepted request; `expire` marks an
 * unanswered request no_reply after 45 seconds.
 */
export function transition(
  request: Pick<CareRequest, 'status' | 'auto' | 'overrideUntil' | 'createdAtMs'>,
  action: RequestAction,
  nowMs: number,
): TransitionResult {
  switch (action) {
    case 'accept':
      return request.status === 'waiting' || request.status === 'no_reply' ? { ok: true, status: 'accepted' } : { ok: false, reason: 'bad-state' };
    case 'decline':
      return request.status === 'waiting' || request.status === 'no_reply' ? { ok: true, status: 'declined' } : { ok: false, reason: 'bad-state' };
    case 'undo':
      if (request.status !== 'accepted' || !request.auto) return { ok: false, reason: 'bad-state' };
      return typeof request.overrideUntil === 'number' && nowMs <= request.overrideUntil
        ? { ok: true, status: 'declined' }
        : { ok: false, reason: 'undo-expired' };
    case 'cancel':
      return request.status === 'waiting' || request.status === 'accepted' || request.status === 'no_reply'
        ? { ok: true, status: 'cancelled' }
        : { ok: false, reason: 'bad-state' };
    case 'arrived':
      return request.status === 'accepted' ? { ok: true, status: 'completed' } : { ok: false, reason: 'bad-state' };
    case 'expire':
      if (request.status !== 'waiting') return { ok: false, reason: 'bad-state' };
      return nowMs - request.createdAtMs >= NO_REPLY_MS ? { ok: true, status: 'no_reply' } : { ok: false, reason: 'too-early' };
  }
}

/** Seconds left in the undo window, 0 when over; the inbox shows this as a countdown. */
export function undoSecondsLeft(request: Pick<CareRequest, 'status' | 'auto' | 'overrideUntil'>, nowMs: number): number {
  if (request.status !== 'accepted' || !request.auto || typeof request.overrideUntil !== 'number') return 0;
  return Math.max(0, Math.ceil((request.overrideUntil - nowMs) / 1000));
}

export type PublicLabel = 'available' | 'limited' | 'notAvailable' | 'outdated';

/**
 * The only availability the public sees: a simple label, never bed counts, equipment faults or
 * rosters (AGENTS.md 4, rule 6). Old or conflicting data is "may be outdated" rather than a guess.
 */
export function publicLabel(row: RankedHospital, pathway: Pathway): PublicLabel {
  const { status } = row.hospital;
  // "Can't help" comes first: old or unclear data must never make a closed department look requestable.
  if (!row.eligible) return 'notAvailable';
  if (status.conflict || row.stale) return 'outdated';
  const spare = pathway.needsNicu ? Math.min(freeBeds(status), freeNicu(status)) : pathway.needsBed ? freeBeds(status) : Infinity;
  return spare <= 2 ? 'limited' : 'available';
}

export interface PublicHospital {
  id: string;
  name: { en: string; th: string };
  lat: number;
  lng: number;
  driveMin: number;
  distanceKm: number;
  label: PublicLabel;
  /** For hospitals closer than the first one that can help: the simple reason keys (no counts). */
  skipped?: Array<'dept' | 'equip' | 'onDuty' | 'beds' | 'nicu' | 'tooFar'>;
  /** Failure item for the first skipped reason, e.g. a department key, so the text can name it. */
  skippedItem?: string;
}

export function toPublicHospital(row: RankedHospital, pathway: Pathway): PublicHospital {
  const first = row.failures[0];
  return {
    id: row.hospital.id,
    name: row.hospital.name,
    lat: row.hospital.lat,
    lng: row.hospital.lng,
    driveMin: Math.round(row.driveMin),
    distanceKm: Math.round(row.distanceKm * 10) / 10,
    label: publicLabel(row, pathway),
    ...(row.failures.length > 0 ? { skipped: [...new Set(row.failures.map((f) => f.kind))] } : {}),
    ...(first && 'item' in first ? { skippedItem: first.item } : {}),
  };
}

/** Minutes the data is old, for freshness labels in the hospital app. */
export function freshnessMin(status: HospitalStatus, nowMs: number): number {
  return Math.round(dataAgeMin(status, nowMs));
}

