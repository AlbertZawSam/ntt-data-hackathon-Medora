/**
 * Auto-accept rules set by hospital admins — pure TypeScript, no React Native imports.
 * Requirements: 6.4, 11.2
 */
import { failsFor } from './ranking';
import type { HospitalStatus, Pathway } from './types';

/**
 * A pathway request is accepted automatically when the admin turned its rule on, the hospital
 * has no failures for it and free beds are at least the rule's minimum.
 * A patient visit is accepted when the visit rule is on and the emergency department is open.
 */
export function ruleAccepts(status: HospitalStatus, target: Pathway | 'visit'): boolean {
  if (target === 'visit') {
    return status.rules.visit === true && status.depts.ed === 'open';
  }
  return (
    status.rules[target.key] === true &&
    failsFor(status, target).length === 0 &&
    status.beds >= status.rules.minBeds
  );
}
