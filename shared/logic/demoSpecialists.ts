/**
 * Synthetic specialists for the demo hospitals, so Find a specialist has results right after
 * `npm run seed`. Names are made up (team data set in `data/specialists.json`, 18 Nov 2026). Each doctor keeps
 * weekly clinic sessions ("Mon AM", "Thu PM"); seeding turns them into open slots for the next seven Bangkok
 * days, which the specialist page shows again as weekly hours. Pure TypeScript, used by scripts/seed.ts and
 * the tests. Requirements: 8.1 to 8.6, 17.1
 */
import data from '../data/specialists.json';
import type { Slot, SpecialistInput, Specialty } from './specialists';

interface DemoSpecialist {
  hospitalKey: string;
  name: string;
  /** The name in Thai, when the doctor has one. */
  nameTh?: string;
  specialty: Specialty;
  /** The doctor's own field ("Interventional cardiology"); Find a specialist groups by `specialty`. */
  focus: string;
  languages: string[];
  namePublic: boolean;
  /** Weekly clinic sessions: a weekday and AM or PM, for example "Mon AM". */
  sessions: string[];
}

// JSON imports widen literal types, so the shape is asserted here and checked by tests/demoSpecialists.test.ts.
export const DEMO_SPECIALISTS = data.specialists as unknown as DemoSpecialist[];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** Morning and afternoon clinic hours. */
export const SESSION_HOURS: Record<string, { start: string; end: string }> = { AM: { start: '09:00', end: '12:00' }, PM: { start: '13:00', end: '16:00' } };

const BANGKOK_OFFSET_MS = 7 * 60 * 60_000;
/** An admin may save at most 60 slots per specialist (specialists.ts), so busy clinics use one-hour appointments. */
const MAX_SLOTS = 60;

const toMin = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const toTime = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Open slots for weekly sessions ("Mon AM") on the next seven Bangkok days (tomorrow onwards), none booked. */
export function sessionSlots(sessions: readonly string[], nowMs: number): Slot[] {
  const blocks: Array<{ day: string; start: number; end: number }> = [];
  for (let d = 1; d <= 7; d += 1) {
    const date = new Date(nowMs + BANGKOK_OFFSET_MS + d * 86_400_000);
    const weekday = WEEKDAYS[(date.getUTCDay() + 6) % 7];
    const day = date.toISOString().slice(0, 10);
    for (const part of ['AM', 'PM']) {
      if (!sessions.includes(`${weekday} ${part}`)) continue;
      blocks.push({ day, start: toMin(SESSION_HOURS[part].start), end: toMin(SESSION_HOURS[part].end) });
    }
  }
  const halfHours = blocks.reduce((n, b) => n + (b.end - b.start) / 30, 0);
  const step = halfHours <= MAX_SLOTS ? 30 : 60;
  const slots: Slot[] = [];
  for (const block of blocks) {
    for (let m = block.start; m + step <= block.end; m += step) {
      const time = toTime(m);
      slots.push({ id: `${block.day.replace(/-/g, '')}${time.replace(':', '')}`, day: block.day, time, booked: false });
    }
  }
  return slots;
}

/** Every demo specialist as admin input, with fresh slots from `nowMs`. */
export function demoSpecialists(nowMs: number): Array<{ hospitalKey: string; input: SpecialistInput }> {
  return DEMO_SPECIALISTS.map(({ hospitalKey, sessions, focus: _focus, ...person }) => ({ hospitalKey, input: { ...person, slots: sessionSlots(sessions, nowMs) } }));
}
