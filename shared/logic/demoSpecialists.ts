/**
 * Synthetic specialists for the demo hospitals, so Find a specialist has results right after
 * `npm run seed`. Names are made up. Slots fall on the next three Bangkok days. Pure TypeScript,
 * used by scripts/seed.ts and the tests. Requirements: 8.1 to 8.6, 17.1
 */
import type { Slot, SpecialistInput, Specialty } from './specialists';

interface DemoSpecialist {
  hospitalKey: string;
  name: string;
  specialty: Specialty;
  languages: string[];
  namePublic: boolean;
}

const PEOPLE: DemoSpecialist[] = [
  { hospitalKey: 'rama9', name: 'Dr. Narin Suwan', specialty: 'neurology', languages: ['th', 'en'], namePublic: true },
  { hospitalKey: 'rama9', name: 'Dr. Ploy Kittichai', specialty: 'cardiology', languages: ['th', 'en'], namePublic: true },
  { hospitalKey: 'chaophraya', name: 'Dr. Siriporn Thongdee', specialty: 'obstetrics', languages: ['th', 'en', 'zh'], namePublic: true },
  { hospitalKey: 'chaophraya', name: 'Dr. Anan Wattana', specialty: 'pediatrics', languages: ['th'], namePublic: true },
  { hospitalKey: 'ladprao', name: 'Dr. Kittisak Prasert', specialty: 'cardiology', languages: ['th', 'en', 'ja'], namePublic: true },
  { hospitalKey: 'victory', name: 'Dr. Malee Rattana', specialty: 'pediatrics', languages: ['th', 'en'], namePublic: true },
  { hospitalKey: 'siam', name: 'Dr. Somchai Lert', specialty: 'general', languages: ['th', 'en', 'ar'], namePublic: true },
  { hospitalKey: 'siam', name: 'Dr. Wanida Charoen', specialty: 'orthopedics', languages: ['th', 'en'], namePublic: false },
  { hospitalKey: 'thonburi', name: 'Dr. Preecha Nakorn', specialty: 'general', languages: ['th'], namePublic: true },
];

const TIMES = ['09:00', '10:30', '14:00'];
const BANGKOK_OFFSET_MS = 7 * 60 * 60_000;

/** Three slots on each of the next three days in Bangkok (UTC+7), none booked. */
export function demoSlots(nowMs: number): Slot[] {
  const slots: Slot[] = [];
  for (let d = 1; d <= 3; d += 1) {
    const day = new Date(nowMs + BANGKOK_OFFSET_MS + d * 86_400_000).toISOString().slice(0, 10);
    for (const time of TIMES) slots.push({ id: `${day.replace(/-/g, '')}${time.replace(':', '')}`, day, time, booked: false });
  }
  return slots;
}

/** Every demo specialist as admin input, with fresh slots from `nowMs`. */
export function demoSpecialists(nowMs: number): Array<{ hospitalKey: string; input: SpecialistInput }> {
  const slots = demoSlots(nowMs);
  return PEOPLE.map(({ hospitalKey, ...person }) => ({ hospitalKey, input: { ...person, slots: slots.map((s) => ({ ...s })) } }));
}
