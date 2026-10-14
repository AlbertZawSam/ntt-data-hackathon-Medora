import type { Pathway } from './types';

// Treatment time budget (design.md "Remaining window" and "Ask policy").
// Windows in data/pathways.json are illustrative until clinicians confirm them.

export type Window = {
  // Minutes left in the treatment window, never below 0; null when the pathway has no window.
  remainingMin: number | null;
  // The window has already passed.
  expired: boolean;
};

// windowMin − onsetMin. Without an onset time we assume the whole window is left,
// so the "too far" check still rules out hospitals that could never be reached in time.
export function remainingWindow(pathway: Pathway, onsetMin?: number | null): Window {
  if (pathway.windowMin === null) return { remainingMin: null, expired: false };
  const left = pathway.windowMin - Math.max(0, onsetMin ?? 0);
  return { remainingMin: Math.max(0, left), expired: left <= 0 };
}

// A hospital is too far when drive + preparation won't fit in the time left.
export function tooFar(driveMin: number, pathway: Pathway, remainingMin: number | null): boolean {
  if (remainingMin === null) return false;
  return driveMin + pathway.prepMin > remainingMin;
}

export type AskPolicy = { count: number; waitSec: number };

// How many hospitals to ask at once, and how long to wait for replies.
export function askPolicy(pathway: Pathway, remainingMin: number | null): AskPolicy {
  if (!pathway.urgent) return { count: 1, waitSec: 60 };
  if (remainingMin !== null && remainingMin < 90) return { count: 3, waitSec: 30 };
  return { count: 2, waitSec: 45 };
}
