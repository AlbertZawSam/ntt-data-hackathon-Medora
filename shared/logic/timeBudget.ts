/**
 * Time budget helpers — pure TypeScript, no React Native imports.
 * Requirements: 12.3
 */
import type { Pathway } from './types';

/** Minutes left in the treatment window; Infinity when the pathway has no window. */
export function remainingWindow(pathway: Pathway, onsetMin: number): number {
  if (pathway.windowMin === null) return Infinity;
  return pathway.windowMin - onsetMin;
}

/** True when driving there and getting ready would take longer than the time left. */
export function tooFar(driveMin: number, prepMin: number, remainingMin: number): boolean {
  if (!Number.isFinite(remainingMin)) return false;
  return driveMin + prepMin > remainingMin;
}

export interface AskPolicy {
  /** Hospitals to ask at once. */
  count: number;
  waitSeconds: number;
}

/** Non-urgent: 1 at a time, wait 60 s; urgent under 90 minutes left: 3, 30 s; other urgent: 2, 45 s. */
export function askPolicy(pathway: Pathway, remainingMin: number): AskPolicy {
  if (!pathway.urgent) return { count: 1, waitSeconds: 60 };
  if (remainingMin < 90) return { count: 3, waitSeconds: 30 };
  return { count: 2, waitSeconds: 45 };
}
