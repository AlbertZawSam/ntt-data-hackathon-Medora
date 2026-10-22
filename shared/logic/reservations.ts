/**
 * Bed reservations: accepting a request holds a bed (or NICU cot) for 2 hours; a decline, undo or
 * cancel releases it; arrival converts it into an occupied bed. Held beds count as not free in
 * ranking and auto-accept. Holds are computed from the reservation rows and the clock, so a hold
 * expires on its own with no scheduled job. Pure TypeScript. Requirements: 19.3, 19.4, 19.6
 */
import { PATHWAYS } from './pathways';
import type { HospitalStatus, NeedKey, Pathway, PathwayKey } from './types';

/** A held bed is released after this long if the patient hasn't arrived. */
export const RESERVATION_MS = 2 * 60 * 60 * 1000;

export type ReservationKind = 'bed' | 'nicu';
export type ReservationState = 'held' | 'released' | 'converted';

export interface Reservation {
  id: string;
  requestId: string;
  hospitalId: string;
  kind: ReservationKind;
  state: ReservationState;
  createdAtMs: number;
  expiresAtMs: number;
}

/** What a request needs held: a NICU cot, a general bed, or nothing (a plain visit holds no bed). */
export function reservationKind(needKey: string): ReservationKind | null {
  const pathway: Pathway | undefined = PATHWAYS[needKey as PathwayKey] ?? undefined;
  if (!pathway) return null;
  if (pathway.needsNicu) return 'nicu';
  return pathway.needsBed ? 'bed' : null;
}

/** The care need a patient request carries maps to a pathway key; `general` holds nothing. */
export function kindForNeed(need: NeedKey | string): ReservationKind | null {
  return reservationKind(need === 'child' ? 'peds' : need);
}

export interface Holds {
  beds: number;
  nicu: number;
}

/** Holds still in force: held, and not past their expiry. */
export function activeHolds(reservations: readonly Reservation[], hospitalId: string, nowMs: number): Holds {
  const holds: Holds = { beds: 0, nicu: 0 };
  for (const r of reservations) {
    if (r.hospitalId !== hospitalId || r.state !== 'held' || r.expiresAtMs <= nowMs) continue;
    if (r.kind === 'nicu') holds.nicu += 1;
    else holds.beds += 1;
  }
  return holds;
}

/** The status with current holds applied, so ranking and auto-accept see reserved beds as not free. */
export function withHolds(status: HospitalStatus, holds: Holds): HospitalStatus {
  return { ...status, reservedBeds: holds.beds, reservedNicu: holds.nicu };
}

/**
 * True when a unit's count is lower than what is already promised to accepted patients. The unit is
 * prompted to check, rather than silently breaking a promise (requirement 19.6).
 */
export function contradictsHolds(status: Pick<HospitalStatus, 'beds' | 'nicu'>, holds: Holds): { beds: boolean; nicu: boolean } {
  return { beds: status.beds < holds.beds, nicu: status.nicu < holds.nicu };
}

/** A new hold, expiring in 2 hours. */
export function newReservation(requestId: string, hospitalId: string, kind: ReservationKind, nowMs: number): Omit<Reservation, 'id'> {
  return { requestId, hospitalId, kind, state: 'held', createdAtMs: nowMs, expiresAtMs: nowMs + RESERVATION_MS };
}
