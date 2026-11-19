/**
 * Demo replies (task 21): when the demo switch is on, demo hospitals without an auto-accept rule
 * answer a referral after a short delay with a preset reply, so the agent demo runs without a
 * second person at a staff screen. Off unless `DEMO_REPLIES=true`; never used for real hospitals.
 * The presets live with each hospital in `data/hospitals.json` (`demoReply`). Pure TypeScript. Requirements: 17.2
 */
import { DEMO_HOSPITALS, type DemoReply } from './demoHospitals';
import type { PathwayKey } from './types';

export type { DemoReply };

/** Seconds before a demo hospital replies (requirement 17.2). */
export const DEMO_REPLY_AFTER_SEC = 8;

/** The preset reply for a demo hospital, its note in the doctor's language; hospitals with no preset accept with no note. */
export function demoReply(hospitalKey: string, pathway: PathwayKey, lang: 'en' | 'th' = 'en'): DemoReply {
  const presets = DEMO_HOSPITALS.find((h) => h.key === hospitalKey)?.demoReply;
  const preset = presets?.[pathway] ?? presets?.['*'];
  if (!preset) return { status: 'accepted' };
  const { note, ...rest } = preset;
  return { ...rest, ...(note ? { note: note[lang] || note.en } : {}) };
}

/**
 * Demo hospitals with real department staff accounts (all three departments) and no preset reply: no automatic
 * demo replies there, so every referral waits for that hospital's doctor, department or emergency unit to answer it.
 */
export function hasDepartmentStaff(hospitalKey: string): boolean {
  const hospital = DEMO_HOSPITALS.find((h) => h.key === hospitalKey);
  return hospital !== undefined && hospital.demoReply === undefined && ['cardio', 'ortho', 'obstetrics'].every((d) => hospital.departments.includes(d));
}
