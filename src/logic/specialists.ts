import { bangkokMinutes, driveEstimate } from './ranking';
import type { Hospital, LatLng, PathwayKey, Specialist } from './types';

// Find a specialist (requirement 8). Pure, so it works offline and in tests.

export const SPECIALTIES = [
  'Internal medicine',
  'Obstetrics',
  'Pediatrics',
  'Orthopedics',
  'Cardiology',
  'Neurology',
  'Dermatology',
] as const;
export type Specialty = (typeof SPECIALTIES)[number];

export const LANGUAGES = ['Thai', 'English', 'Chinese', 'Japanese'] as const;
export type SpokenLanguage = (typeof LANGUAGES)[number];

// From the last Find care need (requirement 8.2). Null when there was none.
export function suggestSpecialty(need: PathwayKey | null | undefined): Specialty | null {
  if (!need) return null;
  if (need === 'maternity' || need === 'preterm') return 'Obstetrics';
  if (need === 'peds') return 'Pediatrics';
  if (need === 'injury') return 'Orthopedics';
  return 'Internal medicine';
}

export type Slot = { day: string; time: string };

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const BANGKOK_OFFSET_MS = 7 * 60 * 60_000;

// Minutes from now until the slot starts, Bangkok time; null if it has already started
// or the day isn't understood. A weekday name means its next occurrence after today.
export function minutesUntil(slot: Slot, at: Date): number | null {
  const [h, m] = slot.time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const today = new Date(at.getTime() + BANGKOK_OFFSET_MS).getUTCDay();
  let days: number;
  if (slot.day === 'today') days = 0;
  else if (slot.day === 'tomorrow') days = 1;
  else {
    const i = WEEKDAYS.indexOf(slot.day);
    if (i < 0) return null;
    days = (i - today + 7) % 7 || 7;
  }
  const until = days * 24 * 60 + h * 60 + m - bangkokMinutes(at);
  return until > 0 ? until : null;
}

export type SpecialistRow = {
  hospital: Hospital;
  specialist: Specialist;
  km: number;
  driveMin: number;
  // Open slots, soonest first.
  slots: Slot[];
};

export type SpecialistFilter = { specialty: Specialty; language: SpokenLanguage | null };

// Matching specialists, nearest hospital first, then the soonest open slot (requirement 8.3).
export function findSpecialists(hospitals: Hospital[], filter: SpecialistFilter, from: LatLng, at: Date): SpecialistRow[] {
  const rows: (SpecialistRow & { soonest: number })[] = [];
  for (const hospital of hospitals) {
    const matches = hospital.specialists.filter(
      (s) => s.specialty === filter.specialty && (!filter.language || s.languages.includes(filter.language)),
    );
    if (matches.length === 0) continue;
    const { km, min } = driveEstimate(from, hospital, { at });
    for (const specialist of matches) {
      const open = specialist.slots
        .map((slot) => ({ slot, until: minutesUntil(slot, at) }))
        .filter((s): s is { slot: Slot; until: number } => s.until !== null)
        .sort((a, b) => a.until - b.until);
      rows.push({
        hospital,
        specialist,
        km,
        driveMin: min,
        slots: open.map((s) => s.slot),
        soonest: open[0]?.until ?? Infinity,
      });
    }
  }
  return rows
    .sort((a, b) => a.km - b.km || a.soonest - b.soonest)
    .map(({ soonest: _soonest, ...row }) => row);
}
