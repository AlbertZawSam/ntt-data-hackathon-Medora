import { classifyNeed, type PatientNeed } from '@/logic/need';
import type { Bi } from '@/logic/types';

// "What does the patient need?" (requirement 5.1). The caller has already run the
// red-flag check; this is never reached for an emergency.

export type Understanding = {
  need: PatientNeed;
  // A short restatement for staff, from the model only.
  summary?: Bi;
  // 'keywords' when the model wasn't used or didn't answer.
  source: 'ai' | 'keywords';
};

// Task 10.1 adds the fast-model call through the understandNeed mutation once the
// backend is deployed, keeping this keyword result as the fallback.
export async function understandNeed(text: string): Promise<Understanding> {
  return { need: classifyNeed(text), source: 'keywords' };
}
