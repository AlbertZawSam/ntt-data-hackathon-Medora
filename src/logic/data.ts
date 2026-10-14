import hospitalsJson from '../../data/hospitals.json';
import pathwaysJson from '../../data/pathways.json';
import redFlagsJson from '../../data/red_flags.json';

import type { Hospital, Pathway, PathwayKey, RedFlagRule, Scoring } from './types';

// Typed views of the bundled synthetic data. JSON imports infer plain strings,
// so the casts narrow them; tests/unit/data.test.ts checks the files match.
export const hospitals = hospitalsJson.hospitals as unknown as Hospital[];
export const pathways = pathwaysJson.pathways as Record<PathwayKey, Pathway>;
export const scoring: Scoring = pathwaysJson.scoring;
export const redFlagRules: RedFlagRule[] = redFlagsJson.flags;
export const redFlagExamples = {
  emergency: redFlagsJson.emergencyExamples,
  safe: redFlagsJson.safeExamples,
};
