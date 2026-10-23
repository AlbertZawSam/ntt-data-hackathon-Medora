/**
 * The synthetic demo hospitals in `data/hospitals.json`, typed, for `scripts/seed.ts` and the tests.
 * The app never reads this file: screens see hospitals only through the live API.
 * Requirements: 17.1 (task 5.3)
 */
import data from '../data/hospitals.json';
import type { Bi, HospitalStatus } from './types';

export interface DemoHospital {
  key: string;
  name: Bi;
  lat: number;
  lng: number;
  totalBeds: number;
  nicuTotal: number;
  typicalWaitMin: number;
  departments: string[];
  equipment: string[];
  /** What this hospital shows in the demo. */
  demo: string;
  status: Omit<HospitalStatus, 'updatedAt'> & { updatedMinAgo: number };
}

// JSON imports widen literal types, so the shape is asserted here and checked by tests/demoHospitals.test.ts.
export const DEMO_HOSPITALS = data.hospitals as unknown as DemoHospital[];

/** The hospital's live status as of `nowMs`: `updatedMinAgo` becomes the confirmation time. */
export function demoStatus(hospital: DemoHospital, nowMs: number): HospitalStatus {
  const { updatedMinAgo, ...rest } = hospital.status;
  return { ...rest, updatedAt: new Date(nowMs - updatedMinAgo * 60_000).toISOString() };
}
