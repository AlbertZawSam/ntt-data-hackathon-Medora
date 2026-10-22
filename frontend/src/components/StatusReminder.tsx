/**
 * Banner for stale hospital status: unit owners are reminded after 30 minutes (30 seconds in the demo
 * stage); everyone at the hospital, admins included, sees the alert after two hours. In-app only; a
 * scheduled push comes with the push notifications task. Requirements: 19.5, 19.9
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { reminderState } from '@medora/shared/logic/reminders';
import type { HospitalStatus } from '@medora/shared/logic/types';
import { useApp, useT } from '../state/AppProvider';
import { fonts, fontSizes, radii, spacing, useTheme } from '../ui/theme';

const DEMO = process.env.EXPO_PUBLIC_STAGE === 'demo';

export function StatusReminder({ audience }: { audience: 'unit' | 'admin' }): React.JSX.Element | null {
  const t = useT();
  const theme = useTheme();
  const { data, session } = useApp();
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), DEMO ? 5_000 : 60_000);
    return () => clearInterval(timer);
  }, []);
  const status = data.hospitalStatuses.find((s) => s.hospitalId === session?.hospitalId)?.status as HospitalStatus | undefined;
  if (!status) return null;
  const state = reminderState(status, now, { demo: DEMO });
  // Admins don't update live status, so they only see the two-hour alert.
  if (state === 'fresh' || (audience === 'admin' && state !== 'adminAlert')) return null;
  const alert = state === 'adminAlert';
  return (
    <View accessibilityLiveRegion="polite" style={[styles.box, { backgroundColor: theme.surface, borderColor: alert ? theme.emergency : theme.warning }]}>
      <Text style={[styles.text, { color: alert ? theme.emergency : theme.warning }]}>{t(alert ? 'reminder.adminAlert' : 'reminder.remind')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 2, borderRadius: radii.md, padding: spacing.md },
  text: { fontFamily: fonts.semibold, fontSize: fontSizes.md },
});
