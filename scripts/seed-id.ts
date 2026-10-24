import { createHash } from 'node:crypto';

/** Same format as ids made by register-hospital (H- and 16 hex digits), so the other scripts accept them. */
export function seedHospitalId(key: string): string {
  return `H-${createHash('sha256').update(`medora-demo:${key}`).digest('hex').slice(0, 16)}`;
}

/** A stable id per demo specialist, so re-seeding replaces them (and resets their slots) instead of adding copies. */
export function seedSpecialistId(hospitalKey: string, name: string): string {
  return `S-${createHash('sha256').update(`medora-demo:${hospitalKey}:${name}`).digest('hex').slice(0, 16)}`;
}
