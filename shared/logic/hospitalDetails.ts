/**
 * Hospital details a person seeking care can open before choosing where to go: beds as a label,
 * whether the emergency department is open, which kinds of care it can take now, which specialties
 * have a doctor on duty, and the clinic specialists they can book. Simple labels only, never bed
 * counts, equipment faults or staff names on duty (AGENTS.md rule 6). Pure TypeScript.
 * Requirements: 5.2, 5.3, 8.1
 */
import { NEED_KEYS, publicEntry, type PublicLabel, type PublicProfile } from './publicDirectory';
import { freeBeds } from './ranking';
import { openSlots, type SpecialistRecord, type Specialty } from './specialists';
import type { HospitalStatus, NeedKey } from './types';

export type BedLabel = 'available' | 'limited' | 'full';

export interface HospitalDetails {
  beds: BedLabel;
  edOpen: boolean;
  /** Each kind of care, as the same label Find care uses. */
  care: Record<NeedKey, PublicLabel>;
  /** Specialties with a doctor on duty now and their department open: the specialty, never a name. */
  onDuty: Specialty[];
  /** Clinic specialists with an open slot; the name only when the doctor chose to show it. */
  clinic: Array<{ specialty: string; name: string | null }>;
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
    edOpen: entry.edOpen,
    care,
    onDuty,
    clinic,
    typicalWaitMin: profile.typicalWaitMin,
    updatedAt: status.updatedAt,
  };
}
