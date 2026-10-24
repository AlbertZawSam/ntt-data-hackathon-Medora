/**
 * Hospital departments a person can send a request to, and the staff unit that answers it. A request
 * to Cardiology reaches only the hospital's cardiology staff; a request without a department (general
 * or emergency care) and doctor referrals stay with the emergency and other units. Pure TypeScript.
 * Requirements: 6.1, 6.3
 */
import type { HospitalStatus, NeedKey, PathwayKey } from './types';

export const DEPARTMENTS = ['cardiology', 'surgery', 'obstetrics'] as const;
export type Department = (typeof DEPARTMENTS)[number];

/** The status department behind each: surgery is the orthopedic and injury department. */
export const DEPARTMENT_DEPT: Record<Department, string> = { cardiology: 'cardio', surgery: 'ortho', obstetrics: 'obstetrics' };

export function isDepartment(value: unknown): value is Department {
  return typeof value === 'string' && (DEPARTMENTS as readonly string[]).includes(value);
}

/** The departments taking requests now: the hospital has them and they are open (not diverting). */
export function openDepartments(status: HospitalStatus): Department[] {
  return DEPARTMENTS.filter((d) => status.depts[DEPARTMENT_DEPT[d]] === 'open');
}

/** The department suggested for a type of care: pregnancy to Obstetrics, injuries to Surgery. */
export function suggestedDepartment(need: NeedKey): Department | undefined {
  return need === 'maternity' ? 'obstetrics' : need === 'injury' ? 'surgery' : undefined;
}

/** The department a doctor's referral goes to at the receiving hospital: heart attack to Cardiology, and so on. */
const PATHWAY_DEPARTMENT: Partial<Record<PathwayKey, Department>> = { stemi: 'cardiology', injury: 'surgery', maternity: 'obstetrics', preterm: 'obstetrics' };

/** The department for a referral at a hospital that has it open; otherwise none (the emergency unit takes it). */
export function referralDepartment(pathway: PathwayKey, status: HospitalStatus): Department | undefined {
  const department = PATHWAY_DEPARTMENT[pathway];
  return department && status.depts[DEPARTMENT_DEPT[department]] === 'open' ? department : undefined;
}
