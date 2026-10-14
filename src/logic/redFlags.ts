import { redFlagRules } from './data';
import type { Bi, RedFlagRule } from './types';

// Fixed emergency rules, checked before any AI call and offline (AGENTS.md safety rule 1).
// Never route this through a model.

export type RedFlagMatch = { key: string; label: Bi; pattern: string };

// Phone keyboards and pasted text vary in ways that would otherwise hide a match:
// smart apostrophes ("can’t"), zero-width spaces in Thai text, line breaks and repeated spaces.
export function normalize(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[​-‍⁠﻿]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

const compiled = (rules: RedFlagRule[]) =>
  rules.map((rule) => ({ rule, patterns: rule.patterns.map(normalize) }));

const defaultRules = compiled(redFlagRules);

// Returns the first rule whose phrase appears in the text, or null.
// Errs towards flagging: a negated phrase ("no chest pain") still matches.
export function redFlag(text: string, rules?: RedFlagRule[]): RedFlagMatch | null {
  const input = normalize(text);
  if (!input) return null;
  for (const { rule, patterns } of rules ? compiled(rules) : defaultRules) {
    const i = patterns.findIndex((p) => p && input.includes(p));
    if (i >= 0) return { key: rule.key, label: rule.label, pattern: rule.patterns[i] };
  }
  return null;
}
