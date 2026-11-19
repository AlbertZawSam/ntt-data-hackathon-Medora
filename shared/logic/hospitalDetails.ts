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

export interface HospitalDetails {
  beds: BedLabel;
  /** Free beds now (AGENTS.md rule 6: the exact number): ready beds minus those held for patients who have asked or been accepted. */
  freeBeds: number;
  /** The hospital's equipment, each working or down. */
  equipment: Array<{ key: EquipmentKey; working: boolean }>;
  edOpen: boolean;
  /** Each kind of care, as the same label Find care uses. */
  care: Record<NeedKey, PublicLabel>;
  /**
   * The hospital's departments for patients: the tracked ones (emergency, neurology, cardiology, obstetrics,
   * paediatrics, orthopaedics) open or diverting now, then the others it registered (internal medicine, surgery,
   * eye, ENT…), which aren't tracked live and show as open. Department keys only, never staff or counts.
   */
  departmentsNow: Array<{ key: string; open: boolean }>;
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

/** Tracked departments first, in the order patients read them; their state is live. */
const TRACKED = ['ed', 'cardio', 'neuro', 'obstetrics', 'pediatrics', 'ortho'];

function departmentsNow(status: HospitalStatus, registered: readonly string[] = []): Array<{ key: string; open: boolean }> {
  const tracked = TRACKED.filter((key) => key in status.depts).map((key) => ({ key, open: status.depts[key] === 'open' }));
  const others = registered.filter((key) => !TRACKED.includes(key) && /^[a-z]{2,20}$/.test(key)).map((key) => ({ key, open: true }));
  return [...tracked, ...others];
}

/** The department that matches what the patient needs, so the screen can light it up. */
export function departmentForNeed(need: NeedKey, keys: readonly string[]): string {
  if (need === 'maternity') return 'obstetrics';
  if (need === 'child') return 'pediatrics';
  if (need === 'injury') return keys.includes('ortho') ? 'ortho' : 'ed';
  return keys.includes('internal') ? 'internal' : 'ed';
}

export function hospitalDetails(
  profile: PublicProfile & { departments?: readonly string[] | null },
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
    freeBeds: freeBeds(status),
    equipment: equipmentList(status.equip),
    edOpen: entry.edOpen,
    care,
    departmentsNow: departmentsNow(status, profile.departments ?? []),
    onDuty,
    clinic,
    departments: openDepartments(status),
    typicalWaitMin: profile.typicalWaitMin,
    updatedAt: status.updatedAt,
  };
}
