/**
 * The synthetic demo hospitals in `data/hospitals.json`, typed, for `scripts/seed.ts` and the tests.
 * The app never reads this file: screens see hospitals only through the live API.
 * Requirements: 17.1 (task 5.3)
 */
import data from '../data/hospitals.json';
import type { Bi, HospitalStatus, PathwayKey } from './types';

/** A preset answer to a doctor's referral (task 21): a decline reason code, or a short staff note with any delay. */
export interface DemoReply {
  status: 'accepted' | 'declined';
  reason?: string;
  note?: string;
}

/** A preset as stored with the hospital: the note in English and Thai, written in the referring doctor's language. */
export type DemoReplyPreset = Omit<DemoReply, 'note'> & { note?: Bi };

export interface DemoHospital {
  key: string;
  /** The team data set's id (H01 to H10), used by the demo account list. */
  teamId?: string;
  name: Bi;
  lat: number;
  lng: number;
  totalBeds: number;
  nicuTotal: number;
  typicalWaitMin: number;
  departments: string[];
  /** Other departments shown to patients (internal medicine, surgery, eye, ENT…); not tracked live, so always open. */
  extraDepartments?: string[];
  equipment: string[];
  /** District and hospital type, for the scenario notes. */
  area?: Bi;
  type?: string;
  /** What this hospital shows in the demo. */
  demo: string;
  /** Preset replies to doctor referrals by pathway; `*` is any pathway. */
  demoReply?: Partial<Record<PathwayKey | '*', DemoReplyPreset>>;
  status: Omit<HospitalStatus, 'updatedAt'> & { updatedMinAgo: number };
}

// JSON imports widen literal types, so the shape is asserted here and checked by tests/demoHospitals.test.ts.
export const DEMO_HOSPITALS = data.hospitals as unknown as DemoHospital[];

/** The hospital's live status as of `nowMs`: `updatedMinAgo` becomes the confirmation time. */
export function demoStatus(hospital: DemoHospital, nowMs: number): HospitalStatus {
  const { updatedMinAgo, ...rest } = hospital.status;
  return { ...rest, updatedAt: new Date(nowMs - updatedMinAgo * 60_000).toISOString() };
}
