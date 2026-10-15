import { driveEstimate, type Drive } from './ranking';
import type { Hospital, LatLng } from './types';

// The hospital shown on the emergency screen (requirement 4.2). Pure and local so it
// works offline. A diverting emergency department doesn't count as open.

export type NearestEmergency = { hospital: Hospital; drive: Drive };

export function nearestOpenEmergency(from: LatLng, list: Hospital[], at: Date): NearestEmergency | null {
  let best: NearestEmergency | null = null;
  for (const hospital of list) {
    if (hospital.status.depts.ed !== 'open') continue;
    const drive = driveEstimate(from, hospital, { at });
    if (!best || drive.km < best.drive.km) best = { hospital, drive };
  }
  return best;
}
