/**
 * Simulated transfer tracking for the demo: progress and minutes left from the start time and the
 * drive estimate. Pure TypeScript. Requirements: 13.2, 13.3
 */
export interface TransferTiming {
  startedAt: number;
  etaMin: number;
  status: string;
}

export interface TransferProgress {
  /** 0 to 1 along the drive. */
  fraction: number;
  /** Whole minutes left, rounded up; 0 once the drive time has passed. */
  minutesLeft: number;
  /** The drive time has passed or the transfer was marked arrived. */
  due: boolean;
}

export function transferProgress(transfer: TransferTiming, nowMs: number): TransferProgress {
  if (transfer.status === 'arrived') return { fraction: 1, minutesLeft: 0, due: true };
  const totalMs = Math.max(1, transfer.etaMin) * 60_000;
  const elapsed = Math.max(0, nowMs - transfer.startedAt);
  const fraction = Math.min(1, elapsed / totalMs);
  const minutesLeft = Math.max(0, Math.ceil((totalMs - elapsed) / 60_000));
  return { fraction, minutesLeft, due: fraction >= 1 };
}

/** The simulated ambulance position: a straight line from the sending to the receiving hospital. */
export function positionAlong(from: { lat: number; lng: number }, to: { lat: number; lng: number }, fraction: number): { lat: number; lng: number } {
  const f = Math.min(1, Math.max(0, fraction));
  return { lat: from.lat + (to.lat - from.lat) * f, lng: from.lng + (to.lng - from.lng) * f };
}
