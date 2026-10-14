/**
 * Emergency red-flag check: fixed rules from `data/red_flags.json`, English and Thai.
 * Runs on the device before any AI call and works offline. Never route this through a model.
 * Requirements: 4.1
 */
import data from '../data/red_flags.json';
import type { Bi } from './types';

export interface RedFlagRule {
  key: string;
  label: Bi;
  patterns: string[];
}

export interface RedFlagMatch {
  key: string;
  label: Bi;
  /** The pattern that matched, for the activity log. */
  pattern: string;
}

export const RED_FLAGS: RedFlagRule[] = data.flags;

/**
 * Lower-cases, turns curly apostrophes from phone keyboards into straight ones
 * and collapses whitespace, so "Can’t  breathe" matches "can't breathe".
 */
export function normalize(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/\s+/g, ' ');
}

/** Returns the first matching red flag, or null when the text has none. */
export function redFlag(text: string, rules: RedFlagRule[] = RED_FLAGS): RedFlagMatch | null {
  const haystack = normalize(text);
  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      if (haystack.includes(normalize(pattern))) {
        return { key: rule.key, label: rule.label, pattern };
      }
    }
  }
  return null;
}
