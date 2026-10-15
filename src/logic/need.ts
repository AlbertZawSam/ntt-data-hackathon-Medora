import { normalize } from './redFlags';
import type { PathwayKey } from './types';

// Keyword backup for "what does the patient need?" (requirement 5.1). The fast model
// answers first once patient-understand is deployed; this runs when it can't, and offline.
// Only call it after the red-flag check has found nothing.

export type PatientNeed = Extract<PathwayKey, 'maternity' | 'peds' | 'injury' | 'general'>;

// Checked in this order: "my baby is coming" is a pregnancy, not a child.
// Thai: "ท้อง" alone also means stomach ("ปวดท้อง"), so only longer pregnancy phrases are used.
const RULES: { need: PatientNeed; words: (string | RegExp)[] }[] = [
  {
    need: 'maternity',
    words: [
      'pregnan', 'weeks along', 'contraction', 'labour', 'labor pain', 'in labor', 'water broke', 'waters broke',
      'baby is coming', 'due date', 'ตั้งครรภ์', 'ตั้งท้อง', 'มีครรภ์', 'คนท้อง', 'ท้องได้', 'คลอด', 'น้ำเดิน', 'มดลูกบีบ',
    ],
  },
  {
    need: 'peds',
    words: [
      'my child', 'my son', 'my daughter', 'my baby', 'my kid', 'toddler', 'infant', 'newborn',
      // Ages under 15 only: "my 40-year-old wife" is not a child.
      /\b(?:[0-9]|1[0-4])[- ]?(?:years?|months?)[- ]old\b/, /\b\d+[- ]?months?[- ]old\b/,
      'ลูก', 'เด็ก', 'ทารก', 'ขวบ', 'เดือนแล้ว',
    ],
  },
  {
    need: 'injury',
    words: [
      'twisted', 'sprain', 'broke', 'fracture', 'fell', 'a fall', 'fall down', 'fallen', 'injur', 'hurt my', 'cut my', 'deep cut',
      'accident', 'crash', 'burned', 'burnt', 'scald', 'swollen ankle', 'dislocat', 'bitten', 'ข้อเท้าพลิก', 'ข้อเท้าแพลง', 'แพลง', 'หกล้ม', 'ล้ม',
      'หัก', 'บาดเจ็บ', 'แผล', 'อุบัติเหตุ', 'รถชน', 'ไฟไหม้', 'น้ำร้อนลวก', 'ถูกกัด', 'เคล็ด',
    ],
  },
];

export function classifyNeed(text: string): PatientNeed {
  const input = normalize(text);
  for (const { need, words } of RULES) {
    if (words.some((w) => (typeof w === 'string' ? input.includes(w) : w.test(input)))) return need;
  }
  return 'general';
}
