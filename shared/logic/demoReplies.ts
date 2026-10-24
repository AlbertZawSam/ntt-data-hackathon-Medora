/**
 * Demo replies (task 21): when the demo switch is on, demo hospitals without an auto-accept rule
 * answer a referral after a short delay with a preset reply, so the agent demo runs without a
 * second person at a staff screen. Off unless `DEMO_REPLIES=true`; never used for real hospitals.
 * Pure TypeScript. Requirements: 17.2
 */
import { DEMO_HOSPITALS } from './demoHospitals';
import type { PathwayKey } from './types';

/** Seconds before a demo hospital replies (requirement 17.2). */
export const DEMO_REPLY_AFTER_SEC = 8;

export interface DemoReply {
  status: 'accepted' | 'declined';
  /** A decline reason code, as staff pick in the inbox. */
  reason?: string;
  /** A short staff note; a stated delay in it is read by the agent's time-window check. */
  note?: string;
}

/** Preset replies by demo hospital key (`data/hospitals.json`) and pathway; `*` is any pathway. */
const PRESETS: Record<string, Partial<Record<PathwayKey | '*', DemoReply>>> = {
  rama9: { stroke: { status: 'accepted', note: 'Neurologist in surgery, free in about 40 minutes' } },
  chatuchak: { '*': { status: 'declined', reason: 'busy' } },
  thonburi: { '*': { status: 'declined', reason: 'nobed' } },
};

/** The preset reply for a demo hospital; demo hospitals with no preset accept with no note. */
export function demoReply(hospitalKey: string, pathway: PathwayKey): DemoReply {
  const preset = PRESETS[hospitalKey];
  return preset?.[pathway] ?? preset?.['*'] ?? { status: 'accepted' };
}

/**
 * Demo hospitals with department staff accounts (all three departments): their department referrals wait
 * for that department to accept, so the demo shows the cardiology team taking the patient.
 */
export function hasDepartmentStaff(hospitalKey: string): boolean {
  const hospital = DEMO_HOSPITALS.find((h) => h.key === hospitalKey);
  return hospital !== undefined && ['cardio', 'ortho', 'obstetrics'].every((d) => hospital.departments.includes(d));
}
