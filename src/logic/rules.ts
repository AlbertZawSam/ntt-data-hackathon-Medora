import { pathways as defaultPathways } from './data';
import { failsFor } from './ranking';
import type { HospitalStatus, Pathway, PathwayKey } from './types';

// Auto-accept rules set by hospital admins (Requirement 11). Staff can undo for 60 seconds.

// Pathways an admin can set a rule for; the others always wait for staff.
const RULE_PATHWAYS = ['stroke', 'stemi', 'preterm', 'peds'] as const;
type RulePathway = (typeof RULE_PATHWAYS)[number];

const hasRule = (key: PathwayKey): key is RulePathway => (RULE_PATHWAYS as readonly string[]).includes(key);

// A patient visit: the visit rule is on and the emergency department is open.
// A referral: the pathway's rule is on, the hospital passes every requirement,
// and free beds are at or above the admin's minimum.
export function ruleAccepts(
  status: HospitalStatus,
  target: PathwayKey | 'visit',
  pathways: Record<PathwayKey, Pathway> = defaultPathways,
): boolean {
  if (target === 'visit') return status.rules.visit === true && status.depts.ed === 'open';
  if (!hasRule(target) || status.rules[target] !== true) return false;
  return failsFor(status, pathways[target]).length === 0 && status.beds >= status.rules.minBeds;
}
