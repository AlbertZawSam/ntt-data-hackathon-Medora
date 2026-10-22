/**
 * Status reminders: how stale a hospital's status is decides what the unit owner and the admin are
 * told. Pure TypeScript, so the apps and a later scheduled job (EventBridge Scheduler + push) follow
 * the same thresholds. Requirements: 19.5, 19.9
 */
import { dataAgeMin } from './ranking';
import type { HospitalStatus } from './types';

/** Minutes between reminders to the unit owners (30 seconds in the demo stage). */
export const REMIND_AFTER_MIN = 30;
export const DEMO_REMIND_AFTER_MIN = 0.5;
/** After this long without any confirmation, the admin is alerted. */
export const ADMIN_ALERT_AFTER_MIN = 120;

export type ReminderState = 'fresh' | 'remind' | 'adminAlert';

export interface ReminderOptions {
  /** The demo stage uses a 30 second reminder so the flow can be shown live. */
  demo?: boolean;
}

/**
 * `fresh` until the reminder time, `remind` for the unit owners after it, and `adminAlert` once two
 * hours have passed (the admin sees the alert too; the status is shown as unclear to everyone).
 * A hospital that has never confirmed its status counts as stale from the start.
 */
export function reminderState(status: HospitalStatus, nowMs: number, options: ReminderOptions = {}): ReminderState {
  const never = Date.parse(status.updatedAt) <= 0;
  const age = never ? Infinity : dataAgeMin(status, nowMs);
  if (age >= ADMIN_ALERT_AFTER_MIN) return 'adminAlert';
  return age >= (options.demo ? DEMO_REMIND_AFTER_MIN : REMIND_AFTER_MIN) ? 'remind' : 'fresh';
}

/** Public and ranking views call a hospital "status unclear" once the admin alert level is reached. */
export const isStatusUnclear = (status: HospitalStatus, nowMs: number): boolean => reminderState(status, nowMs) === 'adminAlert';
