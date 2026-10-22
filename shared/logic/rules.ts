/**
 * Auto-accept rules set by hospital admins — pure TypeScript, no React Native imports.
 * Requirements: 6.4, 11.2, 19.3
 */
import { failsFor, freeBeds } from './ranking';
import type { AutoAcceptRules, HospitalStatus, Pathway, RuleTarget } from './types';

/**
 * A pathway request is accepted automatically when the admin turned its rule on, the hospital
 * has no failures for it and free beds (reserved beds excluded) are at least the rule's minimum.
 * A patient visit is accepted when the visit rule is on and the emergency department is open.
 */
export function ruleAccepts(status: HospitalStatus, target: Pathway | 'visit'): boolean {
  if (target === 'visit') {
    return status.rules.visit === true && status.depts.ed === 'open';
  }
  return (
    status.rules[target.key] === true &&
    failsFor(status, target).length === 0 &&
    freeBeds(status) >= status.rules.minBeds
  );
}

const RULE_TARGETS = ['stroke', 'stemi', 'preterm', 'peds', 'maternity', 'injury', 'general', 'visit'] as const;

/**
 * Checks admin-submitted auto-accept rules: only known targets with true or false, and a whole
 * number of minimum free beds from 0 to 100. Anything else is refused, never partly applied.
 */
export function sanitizeRules(raw: unknown): AutoAcceptRules | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const minBeds = input.minBeds;
  if (typeof minBeds !== 'number' || !Number.isInteger(minBeds) || minBeds < 0 || minBeds > 100) return null;
  const rules: AutoAcceptRules = { minBeds };
  for (const [key, value] of Object.entries(input)) {
    if (key === 'minBeds') continue;
    if (!(RULE_TARGETS as readonly string[]).includes(key) || typeof value !== 'boolean') return null;
    rules[key as RuleTarget] = value;
  }
  return rules;
}

export { RULE_TARGETS };
