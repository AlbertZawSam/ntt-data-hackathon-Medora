/**
 * Deterministic pieces of a doctor referral. The Lambda calls these both for the normal tool
 * path and for its model-unavailable backup, so safety-critical filtering is never delegated
 * to the model.
 */
import { canConfirmReferral } from './access';
import { PATHWAYS } from './pathways';
import { classifyNeed, evaluate, type LatLng } from './ranking';
import { askPolicy, remainingWindow } from './timeBudget';
import type { Bi, PathwayKey, RankableHospital, RankedHospital } from './types';

const REFERRAL_KEYWORDS: Array<{ pathway: PathwayKey; en: RegExp; th: string[] }> = [
  { pathway: 'stroke', en: /\b(stroke|face droop|slurred speech|one.?sided weakness)\b/i, th: ['หลอดเลือดสมอง', 'หน้าเบี้ยว', 'พูดไม่ชัด', 'อ่อนแรงครึ่งซีก'] },
  { pathway: 'stemi', en: /\b(heart attack|stemi|chest pain|st[- ]elevation)\b/i, th: ['หัวใจขาดเลือด', 'เจ็บหน้าอก', 'กล้ามเนื้อหัวใจ'] },
  { pathway: 'preterm', en: /\b(preterm|premature|early labour)\b/i, th: ['คลอดก่อนกำหนด', 'เจ็บครรภ์ก่อนกำหนด'] },
  { pathway: 'peds', en: /\b(child admission|paediatric|pediatric)\b/i, th: ['เด็กต้องนอนโรงพยาบาล', 'กุมาร'] },
];

/** Fixed-keyword fallback used only when Bedrock is unavailable or exceeds its limits. */
export function classifyReferralPathway(description: string): PathwayKey {
  for (const candidate of REFERRAL_KEYWORDS) {
    if (candidate.en.test(description) || candidate.th.some((word) => description.includes(word))) return candidate.pathway;
  }
  const need = classifyNeed(description);
  return need === 'child' ? 'peds' : need;
}

export interface ReferralAssessment {
  pathway: PathwayKey;
  remainingMin: number;
  askCount: number;
  waitSeconds: number;
  ranked: RankedHospital[];
}

export function assessReferral(
  hospitals: RankableHospital[],
  origin: LatLng,
  pathwayKey: PathwayKey,
  nowMs: number,
  onsetMin?: number,
  driveMinById?: Record<string, number>,
): ReferralAssessment {
  const pathway = PATHWAYS[pathwayKey];
  const remainingMin = onsetMin === undefined ? Infinity : remainingWindow(pathway, onsetMin);
  const policy = askPolicy(pathway, remainingMin);
  return {
    pathway: pathwayKey,
    remainingMin,
    askCount: policy.count,
    waitSeconds: policy.waitSeconds,
    ranked: evaluate(hospitals, pathway, origin, { nowMs, onsetMin, ambulance: true, driveMinById }),
  };
}

/** The next eligible hospitals, excluding those already asked in a prior round. */
export function nextHospitals(assessment: ReferralAssessment, askedIds: Iterable<string>): RankedHospital[] {
  const asked = new Set(askedIds);
  return assessment.ranked.filter((row) => row.eligible && !asked.has(row.hospital.id)).slice(0, assessment.askCount);
}

/** Extract a concrete delay stated by hospital staff, in English or Thai. Free-form text is otherwise ignored. */
export function statedDelayMin(note: string | undefined): number | null {
  if (!note) return null;
  const match = note.match(/\b(\d{1,3})\s*(?:min(?:ute)?s?|นาที)\b/i) ?? note.match(/(\d{1,3})\s*นาที/);
  if (!match) return null;
  const minutes = Number(match[1]);
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= 300 ? minutes : null;
}

/** True only when an explicit staff delay pushes an otherwise eligible route beyond its window. */
export function delayExceedsWindow(assessment: ReferralAssessment, row: RankedHospital, delayMin: number | null): boolean {
  if (delayMin === null || !Number.isFinite(assessment.remainingMin)) return false;
  return row.driveMin + PATHWAYS[assessment.pathway].prepMin + delayMin > assessment.remainingMin;
}

export type ReferralDecision = 'confirm' | 'set_aside';

export type ReferralDecisionCheck =
  | { ok: true; status: 'confirmed' | 'set_aside' }
  | { ok: false; reason: 'not-owner' | 'bad-state' | 'no-hospital' | 'not-accepted' };

/**
 * Only the doctor who started a referral confirms or sets it aside, only while it awaits a decision,
 * and a transfer is confirmed only to a hospital that has accepted this referral. The agent has no
 * way to reach this check: it never confirms (AGENTS.md section 4, rule 2).
 */
export function checkReferralDecision(
  caller: { groups: readonly string[]; hospitalId?: string; userId?: string },
  referral: { ownerId: string; fromHospitalId: string; status: string; chosenId?: string | null },
  decision: ReferralDecision,
  acceptedHospitalIds: readonly string[],
): ReferralDecisionCheck {
  if (!canConfirmReferral(caller, referral) || caller.hospitalId !== referral.fromHospitalId) return { ok: false, reason: 'not-owner' };
  if (referral.status !== 'awaiting') return { ok: false, reason: 'bad-state' };
  if (decision === 'set_aside') return { ok: true, status: 'set_aside' };
  if (!referral.chosenId) return { ok: false, reason: 'no-hospital' };
  if (!acceptedHospitalIds.includes(referral.chosenId)) return { ok: false, reason: 'not-accepted' };
  return { ok: true, status: 'confirmed' };
}

/** Seconds a simulated hospital takes to reply in the demo stage (requirement 17.2). */
export const DEMO_REPLY_DELAY_SEC = 8;

/**
 * Preset reply for the demo stage only, for hospitals that have no auto-accept rule: the best-ranked
 * hospital asked for a stroke says its neurologist is free in about 40 minutes (so the agent must weigh
 * the treatment window); the others accept plainly. The caller labels these as simulated in the trace.
 */
export function demoReplyFor(pathway: PathwayKey, askedIndex: number): { note?: string } {
  if (pathway === 'stroke' && askedIndex === 0) {
    return { note: 'Neurologist free in about 40 minutes / แพทย์ระบบประสาทว่างในอีกประมาณ 40 นาที' };
  }
  return {};
}

/** Why a doctor set a recommendation aside; sent and stored as a key, shown in both languages. */
export const SET_ASIDE_REASONS = ['tooFar', 'patientChoice', 'clinical', 'other'] as const;
export type SetAsideReason = (typeof SET_ASIDE_REASONS)[number];

export const SET_ASIDE_TEXT: Record<SetAsideReason, Bi> = {
  tooFar: { en: 'too far for this patient', th: 'ไกลเกินไปสำหรับผู้ป่วยรายนี้' },
  patientChoice: { en: "patient's or family's choice", th: 'ผู้ป่วยหรือญาติเลือกที่อื่น' },
  clinical: { en: 'clinical judgement', th: 'ดุลยพินิจทางคลินิก' },
  other: { en: 'other reason', th: 'เหตุผลอื่น' },
};

export const isSetAsideReason = (value: unknown): value is SetAsideReason => SET_ASIDE_REASONS.some((reason) => reason === value);

/**
 * A doctor's AI referral runs since midnight UTC. The cap is on model calls, so a direct referral to a
 * hospital the doctor chose (mode 'direct') doesn't count.
 */
export function aiRunsToday(referrals: ReadonlyArray<{ startedAtMs: number; mode?: unknown }>, nowMs: number): number {
  const startOfDay = new Date(nowMs);
  startOfDay.setUTCHours(0, 0, 0, 0);
  return referrals.filter((entry) => entry.startedAtMs >= startOfDay.getTime() && entry.mode !== 'direct').length;
}
