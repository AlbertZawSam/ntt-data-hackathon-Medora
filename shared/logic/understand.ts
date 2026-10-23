/**
 * Patient understanding: safety gate layer 2, then the type of care. The red-flag rules always run
 * first and never involve a model; the model (Nova Lite) only sorts a safe description into one of
 * four needs, and its answer is validated here. If the model is unavailable or answers badly, the
 * keyword rules decide. Pure TypeScript, used by the `patient-understand` Lambda.
 * Requirements: 4.5, 5.1, 22.4
 */
import { NEED_KEYS } from './publicDirectory';
import { classifyNeed } from './ranking';
import { redFlag } from './redFlags';
import type { Bi, NeedKey } from './types';

/** Longest description accepted; longer text is cut before any check or model call. */
export const MAX_DESCRIPTION = 1000;
const MAX_SUMMARY = 160;

export type UnderstandResult =
  | { emergency: true; flag: string }
  | { emergency: false; need: NeedKey; summary?: Bi; source: 'ai' | 'rules' };

export function cleanDescription(text: unknown): string {
  return typeof text === 'string' ? text.trim().slice(0, MAX_DESCRIPTION) : '';
}

/** Layer 2 of the emergency check: the same fixed rules as the phone. */
export function safetyGate(text: string): UnderstandResult | null {
  const match = redFlag(text);
  return match ? { emergency: true, flag: match.key } : null;
}

/** The keyword fallback when the model is unavailable, refused or answered badly. */
export function understandByRules(text: string): UnderstandResult {
  return { emergency: false, need: classifyNeed(text), source: 'rules' };
}

const isNeed = (value: unknown): value is NeedKey => typeof value === 'string' && (NEED_KEYS as readonly string[]).includes(value);

const cleanSummary = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim().replace(/\s+/g, ' ').slice(0, MAX_SUMMARY) : undefined;

/**
 * Reads the model's JSON answer: `{"need": "...", "summary_en": "...", "summary_th": "..."}`.
 * Takes the first JSON object in the text (models sometimes add words around it); returns null for
 * anything else, so the caller falls back to the rules. The summary is dropped if either language is missing.
 */
export function parseUnderstanding(text: string): UnderstandResult | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let value: unknown;
  try {
    value = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (!isNeed(record.need)) return null;
  const en = cleanSummary(record.summary_en);
  const th = cleanSummary(record.summary_th);
  return { emergency: false, need: record.need, ...(en && th ? { summary: { en, th } } : {}), source: 'ai' };
}
