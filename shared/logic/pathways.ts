/**
 * Pathway rules from `data/pathways.json`, bundled with the app and Lambda.
 * Requirements: 5.3, 12.3
 */
import data from '../data/pathways.json';
import type { NeedKey, Pathway, PathwayKey, ScoringWeights } from './types';

type PathwayJson = Omit<Pathway, 'key'>;

const raw = data.pathways as Record<PathwayKey, PathwayJson>;

export const PATHWAY_KEYS = Object.keys(raw) as PathwayKey[];

export const PATHWAYS: Record<PathwayKey, Pathway> = Object.fromEntries(
  PATHWAY_KEYS.map((key) => [key, { ...raw[key], key }]),
) as Record<PathwayKey, Pathway>;

export const SCORING: ScoringWeights = data.scoring;

/** Pathway used to rank hospitals for a patient's classified need. */
export function pathwayForNeed(need: NeedKey): Pathway {
  const map: Record<NeedKey, PathwayKey> = {
    maternity: 'maternity',
    child: 'peds',
    injury: 'injury',
    general: 'general',
  };
  return PATHWAYS[map[need]];
}
