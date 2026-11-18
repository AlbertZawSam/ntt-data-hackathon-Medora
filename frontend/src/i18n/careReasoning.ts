/**
 * "AI reasoning" for Find care: the steps behind the patient's hospital list, in the reader's language. Built only
 * from what the patient already sees (the category, the AI summary, each hospital's label and drive time), so it
 * shows how the choice was made without staff names, notes, counts or faults (AGENTS.md safety rule 6).
 */
import type { PublicHospital } from '@medora/shared/logic/care';
import type { Bi, NeedKey } from '@medora/shared/logic/types';
import type { TimelineStep } from '../ui/Timeline';
import { pick, type Lang, type Params, type StringKey } from './t';

type T = (key: StringKey, params?: Params) => string;

export interface CareReasoningInput {
  need: NeedKey;
  /** False when the AI was unavailable and the keyword backup chose the category. */
  aiUsed: boolean;
  /** The text didn't read as a health problem, so general care is shown. */
  unclear?: boolean;
  summary?: Bi;
  /** In the order the patient sees them: hospitals that can help first. */
  hospitals: readonly PublicHospital[];
}

const LABEL_KEY: Record<PublicHospital['label'], StringKey> = {
  available: 'availability.available',
  limited: 'availability.limited',
  notAvailable: 'availability.notAvailable',
  outdated: 'availability.outdated',
};

export function careReasoning(t: T, lang: Lang, input: CareReasoningInput): TimelineStep[] {
  const need = t(`details.needShort.${input.need}` as StringKey);
  const canHelp = input.hospitals.filter((h) => h.label !== 'notAvailable');
  const cannot = input.hospitals.filter((h) => h.label === 'notAvailable');
  const best = canHelp[0];
  const closerSkipped = best ? cannot.filter((h) => h.driveMin < best.driveMin) : [];
  const names = (list: readonly PublicHospital[]): string => list.map((h) => pick(h.name, lang)).join(', ');

  const understood = input.unclear
    ? t('patient.care.why.understoodUnclear')
    : input.aiUsed
      ? t('patient.care.why.understoodAi', { need }) + (input.summary ? ` ${pick(input.summary, lang)}` : '')
      : t('patient.care.why.understoodKeywords', { need });

  const steps: TimelineStep[] = [
    { id: 'safety', title: t('patient.care.why.safetyTitle'), detail: t('patient.care.why.safetyDetail'), state: 'done' },
    { id: 'understood', title: t('patient.care.why.understoodTitle'), detail: understood, state: 'done' },
    {
      id: 'checked',
      title: t('patient.care.why.checkedTitle', { count: input.hospitals.length }),
      detail:
        t('patient.care.why.checkedDetail', { help: canHelp.length, cannot: cannot.length }) +
        (cannot.length ? ` ${t('patient.care.why.cannotList', { names: names(cannot) })}` : ''),
      state: 'done',
    },
    { id: 'order', title: t('patient.care.why.orderTitle'), detail: t('patient.care.why.orderDetail'), state: 'done' },
  ];
  if (best) {
    steps.push({
      id: 'best',
      title: t('patient.care.why.bestTitle', { name: pick(best.name, lang) }),
      detail:
        t('patient.care.why.bestDetail', { min: best.driveMin, label: t(LABEL_KEY[best.label]) }) +
        (closerSkipped.length ? ` ${t('patient.care.why.closerSkipped', { names: names(closerSkipped) })}` : ''),
      state: 'done',
    });
  } else {
    steps.push({ id: 'best', title: t('patient.care.why.noneTitle'), detail: t('patient.care.why.noneDetail'), state: 'error' });
  }
  steps.push({ id: 'you', title: t('patient.care.why.youTitle'), detail: t('patient.care.why.youDetail'), state: 'active' });
  return steps;
}
