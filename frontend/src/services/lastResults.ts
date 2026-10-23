/**
 * The hospitals from the last Find care search, kept in memory only, so the emergency screen can name the
 * nearest one that could help without any network call. Nothing here is stored on the device.
 */
import type { PublicHospital } from '@medora/shared/logic/care';

let last: PublicHospital[] = [];

export function setLastResults(hospitals: PublicHospital[]): void {
  last = hospitals;
}

/** The closest hospital from the last search that wasn't marked as unable to help, or null. */
export function nearestOpen(): PublicHospital | null {
  return last.filter((h) => h.label !== 'notAvailable').sort((a, b) => a.driveMin - b.driveMin)[0] ?? null;
}
