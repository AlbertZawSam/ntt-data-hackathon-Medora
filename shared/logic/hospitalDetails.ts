/**
 * Hospital details a person seeking care can open before choosing where to go: free beds as a label and the
 * exact count, whether the emergency department is open, which kinds of care it can take now, which
 * specialties have a doctor on duty, and the clinic specialists they can book. Free beds are shown as the
 * exact count and each piece of equipment as working or not (team decision, 25 Oct 2026, AGENTS.md rule 6);
 * never staff names or rosters. Pure TypeScript.
 * Requirements: 5.2, 5.3, 8.1
 */
import { openDepartments, type Department } from './departments';
import { equipmentList, type EquipmentKey } from './equipment';
import { NEED_KEYS, publicEntry, type PublicLabel, type PublicProfile } from './publicDirectory';
import { freeBeds } from './ranking';
import { openSlots, type SpecialistRecord, type Specialty } from './specialists';
import type { HospitalStatus, NeedKey } from './types';

export type BedLabel = 'available' | 'limited' | 'full';

/**
 * Free beds as a range, never the exact number (AGENTS.md rule 6): realistic enough to choose between
 * hospitals, without publishing a count people race for. Held beds count as taken.
 */
export type BedRange = 'none' | '1-2' | '3-5' | '6-10' | '10+';

export function bedRange(status: HospitalStatus): BedRange {
  const free = freeBeds(status);
  return free <= 0 ? 'none' : free <= 2 ? '1-2' : free <= 5 ? '3-5' : free <= 10 ? '6-10' : '10+';
}

export interface HospitalDetails {
  beds: BedLabel;
  /** Free beds as a range (see BedRange). */
  bedsFree: BedRange;
  /** Free beds now: ready beds minus those held for patients who have asked or been accepted. */
  freeBeds: number;
  /** The hospital's equipment, each working or down. */
  equipment: Array<{ key: EquipmentKey; working: boolean }>;
  edOpen: boolean;
  /** Each kind of care, as the same label Find care uses. */
  care: Record<NeedKey, PublicLabel>;
  /** Specialties with a doctor on duty now and their department open: the specialty, never a name. */
  onDuty: Specialty[];
  /** Clinic specialists with an open slot; the name only when the doctor chose to show it. */
  clinic: Array<{ specialty: string; name: string | null }>;
  /** Departments taking requests now; a request to one goes to that department's staff. */
  departments: Department[];
  typicalWaitMin: number;
  /** When staff last confirmed the status (ISO). */
  updatedAt: string;
}

/** Who is on call, the department that has to be open, and the specialty shown to the public. */
const ON_DUTY: ReadonlyArray<{ role: string; dept: string; specialty: Specialty }> = [
  { role: 'er', dept: 'ed', specialty: 'general' },
  { role: 'cardiologist', dept: 'cardio', specialty: 'cardiology' },
  { role: 'neurologist', dept: 'neuro', specialty: 'neurology' },
  { role: 'obstetrician', dept: 'obstetrics', specialty: 'obstetrics' },
  { role: 'pediatrician', dept: 'pediatrics', specialty: 'pediatrics' },
  { role: 'orthopedist', dept: 'ortho', specialty: 'orthopedics' },
];

/** Beds as a label: three or more free is available, one or two limited, none full (held beds count as taken). */
export function bedLabel(status: HospitalStatus): BedLabel {
  const free = freeBeds(status);
  return free <= 0 ? 'full' : free <= 2 ? 'limited' : 'available';
}

export function hospitalDetails(
  profile: PublicProfile,
  status: HospitalStatus,
  specialists: readonly SpecialistRecord[],
  nowMs: number,
): HospitalDetails {
  const entry = publicEntry(profile, status);
  const care = Object.fromEntries(NEED_KEYS.map((need) => [need, entry.needs[need].label])) as Record<NeedKey, PublicLabel>;
  const onDuty = ON_DUTY.filter((d) => status.oncall[d.role] === true && status.depts[d.dept] === 'open').map((d) => d.specialty);
  const clinic = specialists
    .filter((s) => s.hospitalId === profile.hospitalId && openSlots(s.slots, nowMs).length > 0)
    .map((s) => ({ specialty: s.specialty, name: s.namePublic ? s.name : null }));
  return {
    beds: bedLabel(status),
    bedsFree: bedRange(status),
    freeBeds: freeBeds(status),
    equipment: equipmentList(status.equip),
    edOpen: entry.edOpen,
    care,
    onDuty,
    clinic,
    departments: openDepartments(status),
    typicalWaitMin: profile.typicalWaitMin,
    updatedAt: status.updatedAt,
  };
}
