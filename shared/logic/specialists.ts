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

/** Words people use for each specialty, in English and Thai, so a typed search finds it without the exact name. */
export const SPECIALTY_KEYWORDS: Record<(typeof SPECIALTIES)[number], readonly string[]> = {
  cardiology: ['cardiology', 'cardiologist', 'heart', 'cardiac', 'chest', 'palpitation', 'blood pressure', 'hypertension', 'หัวใจ', 'อายุรกรรมหัวใจ', 'เจ็บหน้าอก', 'ความดัน', 'ใจสั่น'],
  neurology: ['neurology', 'neurologist', 'brain', 'stroke', 'nerve', 'headache', 'migraine', 'dizzy', 'dizziness', 'seizure', 'numb', 'สมอง', 'ระบบประสาท', 'อัมพาต', 'ปวดหัว', 'ปวดศีรษะ', 'เวียนหัว', 'ไมเกรน', 'ชา'],
  obstetrics: ['obstetrics', 'obstetrician', 'gynecology', 'gynaecology', 'pregnancy', 'pregnant', 'maternity', 'ob-gyn', 'birth', 'labour', 'labor', 'period', 'women', 'สูติ', 'ตั้งครรภ์', 'สตรี', 'ท้อง', 'คลอด', 'นรีเวช', 'ประจำเดือน'],
  pediatrics: ['pediatrics', 'paediatrics', 'pediatrician', 'child', 'children', 'baby', 'babies', 'kid', 'kids', 'infant', 'toddler', 'son', 'daughter', 'กุมาร', 'เด็ก', 'ทารก', 'ลูก'],
  orthopedics: ['orthopedics', 'orthopaedics', 'orthopedic', 'bone', 'fracture', 'broken', 'joint', 'spine', 'back pain', 'surgery', 'surgeon', 'surgical', 'injury', 'sprain', 'ankle', 'knee', 'wrist', 'shoulder', 'hip', 'muscle', 'sport', 'กระดูก', 'ข้อ', 'เส้นเอ็น', 'ผ่าตัด', 'ศัลย', 'หัก', 'ข้อเท้า', 'เข่า', 'ปวดหลัง', 'บาดเจ็บ'],
  general: ['general', 'family', 'physician', 'internal', 'medicine', 'fever', 'cough', 'cold', 'flu', 'sore throat', 'stomach', 'diarrhea', 'vomit', 'tired', 'check-up', 'checkup', 'ทั่วไป', 'อายุรกรรม', 'ไข้', 'ไอ', 'หวัด', 'เจ็บคอ', 'ปวดท้อง', 'ท้องเสีย', 'อาเจียน', 'ตรวจสุขภาพ'],
};

const norm = (text: string): string => text.toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim();

/** Words that say nothing about which specialist: "I need a doctor for my son's ..." keeps only "son's ...". */
const FILLER = new Set(['i', 'im', "i'm", 'my', 'me', 'a', 'an', 'the', 'for', 'with', 'and', 'or', 'of', 'in', 'on', 'to', 'is', 'am', 'are', 'have', 'has', 'had', 'need', 'want', 'find', 'see', 'looking', 'doctor', 'doctors', 'specialist', 'specialists', 'hospital', 'clinic', 'pain', 'please', 'help', 'หมอ', 'แพทย์', 'ผู้เชี่ยวชาญ', 'ปวด', 'เจ็บ', 'อยาก', 'หา', 'ช่วย']);

const meaningfulWords = (query: string): string[] => norm(query).replace(/[^\p{L}\p{M}\p{N}\s'-]/gu, ' ').split(' ').filter((w) => w && !FILLER.has(w));

/** A typed word matches a keyword when either contains the other ("surgeon" ~ "surgery" share 5 letters). */
const wordMatches = (word: string, haystack: string): boolean => haystack.includes(word) || (word.length >= 5 && haystack.includes(word.slice(0, 5)));

/**
 * Whether a specialist matches what the person typed: any meaningful word they typed (filler such as "my",
 * "doctor" or "need" is ignored) appears in the specialty's name or everyday words, the doctor's name (only when
 * shown), the hospital's name, or a language. Empty text, or only filler, matches all.
 */
export function matchesSpecialistQuery(specialist: Pick<PublicSpecialist, 'specialty' | 'name' | 'hospitalName' | 'languages'>, query: string, specialtyLabels: readonly string[] = []): boolean {
  const words = meaningfulWords(query);
  if (words.length === 0) return true;
  const keywords = SPECIALTY_KEYWORDS[specialist.specialty as (typeof SPECIALTIES)[number]] ?? [specialist.specialty];
  const haystack = norm([specialist.specialty, ...keywords, ...specialtyLabels, specialist.name ?? '', specialist.hospitalName.en, specialist.hospitalName.th, ...specialist.languages].join(' | '));
  return words.some((word) => wordMatches(word, haystack));
}
