import type { Hospital, HospitalStatus } from './types';

// Staff edits to their hospital's status (requirement 9.1). Each returns a new status
// stamped with the time of the change (9.2); the input is never modified.

const stamp = (status: HospitalStatus, nowMs: number, change: Partial<HospitalStatus>): HospitalStatus => ({
  ...status,
  ...change,
  updatedAt: nowMs,
});

const clamp = (n: number, max: number) => Math.min(max, Math.max(0, Math.round(n)));

// Free beds and NICU cots stay between 0 and the hospital's total.
export function setBeds(hospital: Hospital, status: HospitalStatus, beds: number, nowMs: number): HospitalStatus {
  return stamp(status, nowMs, { beds: clamp(beds, hospital.totalBeds) });
}

export function setNicu(hospital: Hospital, status: HospitalStatus, nicu: number, nowMs: number): HospitalStatus {
  return stamp(status, nowMs, { nicu: clamp(nicu, hospital.nicuTotal) });
}

// Open ↔ diverting. A department the hospital doesn't have is left alone.
export function toggleDept(status: HospitalStatus, key: string, nowMs: number): HospitalStatus {
  const state = status.depts[key];
  if (!state) return status;
  return stamp(status, nowMs, { depts: { ...status.depts, [key]: state === 'open' ? 'diverting' : 'open' } });
}

// Working ↔ down.
export function toggleEquip(status: HospitalStatus, key: string, nowMs: number): HospitalStatus {
  if (!(key in status.equip)) return status;
  return stamp(status, nowMs, { equip: { ...status.equip, [key]: !status.equip[key] } });
}

// On duty ↔ not on duty.
export function toggleOncall(status: HospitalStatus, key: string, nowMs: number): HospitalStatus {
  if (!(key in status.oncall)) return status;
  return stamp(status, nowMs, { oncall: { ...status.oncall, [key]: !status.oncall[key] } });
}
