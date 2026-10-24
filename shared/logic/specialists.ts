/**
 * Specialists and clinic slots: input checks for admins, the public view patients see, ordering
 * (nearest first, then soonest slot) and slot booking. Pure TypeScript, used by the
 * `specialist-actions` Lambda and the apps. Requirements: 8.1 to 8.6, 11.1, 18.6
 */
import { haversineKm, type LatLng } from './ranking';
import type { Bi } from './types';

export const SPECIALTIES = ['cardiology', 'neurology', 'obstetrics', 'pediatrics', 'orthopedics', 'general'] as const;
export type Specialty = (typeof SPECIALTIES)[number];
export const LANGUAGES = ['th', 'en'] as const;

export interface Slot {
  id: string;
  /** Calendar day, YYYY-MM-DD. */
  day: string;
  /** Local time, HH:MM. */
  time: string;
  booked: boolean;
}

export interface SpecialistInput {
  name: string;
  specialty: Specialty;
  languages: string[];
  namePublic: boolean;
  slots: Slot[];
}

export type SpecialistCheck = { ok: true; value: SpecialistInput } | { ok: false; issue: 'name' | 'specialty' | 'languages' | 'slots' };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_SLOTS = 60;

export function validateSpecialistInput(raw: Partial<Record<keyof SpecialistInput, unknown>>): SpecialistCheck {
  const name = typeof raw.name === 'string' ? raw.name.trim().replace(/\s+/g, ' ') : '';
  if (!name || name.length > 120) return { ok: false, issue: 'name' };
  if (!(SPECIALTIES as readonly string[]).includes(raw.specialty as string)) return { ok: false, issue: 'specialty' };
  const languages = Array.isArray(raw.languages) ? [...new Set(raw.languages)] : [];
  if (languages.length === 0 || languages.length > LANGUAGES.length || languages.some((l) => !(LANGUAGES as readonly string[]).includes(l as string))) {
    return { ok: false, issue: 'languages' };
  }
  const slots = Array.isArray(raw.slots) ? raw.slots : [];
  if (slots.length > MAX_SLOTS) return { ok: false, issue: 'slots' };
  const seen = new Set<string>();
  const clean: Slot[] = [];
  for (const s of slots as Array<Record<string, unknown>>) {
    if (typeof s?.day !== 'string' || !DAY.test(s.day) || Number.isNaN(Date.parse(s.day)) || typeof s.time !== 'string' || !TIME.test(s.time)) {
      return { ok: false, issue: 'slots' };
    }
    const key = `${s.day} ${s.time}`;
    if (seen.has(key)) return { ok: false, issue: 'slots' };
    seen.add(key);
    clean.push({ id: typeof s.id === 'string' && s.id ? s.id.slice(0, 64) : key.replace(/[^0-9]/g, ''), day: s.day, time: s.time, booked: s.booked === true });
  }
  return { ok: true, value: { name, specialty: raw.specialty as Specialty, languages: languages as string[], namePublic: raw.namePublic === true, slots: clean } };
}

export interface SpecialistRecord {
  id: string;
  hospitalId: string;
  name: string;
  specialty: string;
  languages: string[];
  namePublic: boolean;
  slots: Slot[];
}

export interface PublicSpecialist {
  id: string;
  hospitalId: string;
  hospitalName: Bi;
  lat: number;
  lng: number;
  distanceKm: number;
  specialty: string;
  languages: string[];
  /** Null until booked when the doctor chose not to show their name (requirement 8.5). */
  name: string | null;
  slots: Slot[];
}

const slotMs = (s: Slot): number => Date.parse(`${s.day}T${s.time}:00+07:00`);

/** Open slots in the future, soonest first. Past and booked slots are never offered. */
export function openSlots(slots: readonly Slot[], nowMs: number): Slot[] {
  return slots.filter((s) => !s.booked && slotMs(s) > nowMs).sort((a, b) => slotMs(a) - slotMs(b));
}

export interface SpecialistFilter {
  specialty?: string;
  language?: string;
}

/**
 * The patient's list: only specialists with an open slot, filtered by specialty and language, nearest
 * hospital first, then the soonest slot. Booked slots and unshared names never leave the server.
 */
export function listSpecialists(
  records: readonly SpecialistRecord[],
  hospitals: ReadonlyMap<string, { name: Bi; lat: number; lng: number }>,
  origin: LatLng,
  filter: SpecialistFilter,
  nowMs: number,
): PublicSpecialist[] {
  const out: PublicSpecialist[] = [];
  for (const r of records) {
    const h = hospitals.get(r.hospitalId);
    if (!h) continue;
    if (filter.specialty && r.specialty !== filter.specialty) continue;
    if (filter.language && !r.languages.includes(filter.language)) continue;
    const slots = openSlots(r.slots, nowMs);
    if (slots.length === 0) continue;
    out.push({
      id: r.id,
      hospitalId: r.hospitalId,
      hospitalName: h.name,
      lat: h.lat,
      lng: h.lng,
      distanceKm: Math.round(haversineKm(origin, h) * 10) / 10,
      specialty: r.specialty,
      languages: r.languages,
      name: r.namePublic ? r.name : null,
      slots,
    });
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm || slotMs(a.slots[0]) - slotMs(b.slots[0]));
}

export type BookResult = { ok: true; slots: Slot[]; slot: Slot } | { ok: false; reason: 'no-slot' | 'taken' | 'past' };

/** Locks one slot. A second booking of the same slot is refused, so two patients can't share it. */
export function bookSlot(slots: readonly Slot[], slotId: string, nowMs: number): BookResult {
  const slot = slots.find((s) => s.id === slotId);
  if (!slot) return { ok: false, reason: 'no-slot' };
  if (slot.booked) return { ok: false, reason: 'taken' };
  if (slotMs(slot) <= nowMs) return { ok: false, reason: 'past' };
  const booked = { ...slot, booked: true };
  return { ok: true, slot: booked, slots: slots.map((s) => (s.id === slotId ? booked : s)) };
}

/** Maps a specialty to the care need a search can suggest it from (requirement 8.2). */
export function specialtyForNeed(need: string): Specialty {
  switch (need) {
    case 'maternity':
      return 'obstetrics';
    case 'child':
      return 'pediatrics';
    case 'injury':
      return 'orthopedics';
    default:
      return 'general';
  }
}
