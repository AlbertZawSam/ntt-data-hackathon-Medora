/**
 * Layer 1 of the emergency check: fixed red-flag rules on the phone, before anything is sent.
 * Works offline and never involves a model. The activity log records only which rule matched,
 * never what the patient wrote. Requirements: 4.1 to 4.4
 */
import { Linking } from 'react-native';
import { redFlag, type RedFlagMatch } from '@medora/shared/logic/redFlags';
import type { Session } from '@medora/shared/logic/session';
import { writeActivity } from './data';

export const EMERGENCY_NUMBER = '1669';

export function checkEmergency(text: string): RedFlagMatch | null {
  return redFlag(text);
}

/** Logs the check result. Failing to log (offline, no backend) must never block the emergency screen. */
export async function logEmergencyCheck(session: Session | null, match: RedFlagMatch | null): Promise<void> {
  if (!session) return;
  const label = match ? `Emergency check: red flag "${match.key}"` : 'Emergency check: no red flag';
  const labelTh = match ? `ตรวจฉุกเฉิน: พบสัญญาณอันตราย "${match.key}"` : 'ตรวจฉุกเฉิน: ไม่พบสัญญาณอันตราย';
  try {
    await writeActivity({
      ownerId: session.userId,
      actor: { en: 'Patient', th: 'ผู้ป่วย' },
      text: { en: label, th: labelTh },
    });
  } catch {
    // Offline or not connected: the on-device check has already done its job.
  }
}

export function call1669(): Promise<void> {
  return Linking.openURL(`tel:${EMERGENCY_NUMBER}`).catch(() => undefined);
}
