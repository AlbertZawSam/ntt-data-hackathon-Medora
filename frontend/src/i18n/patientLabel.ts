import type { StringKey } from './t';

/** A short, stable code for a request, so patients without a name can still be told apart ("#A3F2"). */
export function caseCode(id: string): string {
  return id.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase();
}

/** The patient's name when they gave one, otherwise "Patient #A3F2". */
export function patientLabel(t: (key: StringKey, vars?: Record<string, string | number>) => string, name: string | undefined | null, id: string): string {
  return name?.trim() ? `${name.trim()} · #${caseCode(id)}` : t('patient.label.coded', { code: caseCode(id) });
}
