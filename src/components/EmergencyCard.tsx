import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { hospitals as seededHospitals } from '@/logic/data';
import { nearestOpenEmergency } from '@/logic/emergency';
import type { RedFlagMatch } from '@/logic/redFlags';
import type { Hospital, LatLng } from '@/logic/types';
import { useT } from '@/state/language';
import { fonts, minTouch, radius, spacing, useTheme } from '@/ui/theme';

type Props = {
  match: RedFlagMatch;
  from: LatLng;
  // Live status when available; the seeded list keeps the card working offline.
  hospitals?: Hospital[];
};

// Shown instead of any AI result when a red flag matches (requirement 4.2).
// Everything here is local, so it works with no network (requirement 4.3).
export function EmergencyCard({ match, from, hospitals = seededHospitals }: Props) {
  const { colors } = useTheme();
  const { t, tr } = useT();
  const [callFailed, setCallFailed] = useState(false);
  const nearest = nearestOpenEmergency(from, hospitals, new Date());

  const call = () => {
    setCallFailed(false);
    Linking.openURL('tel:1669').catch(() => setCallFailed(true));
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.danger }]}>
      <View accessibilityRole="alert">
        <Text style={[styles.title, { color: colors.onDanger }]}>{t('emergency.title')}</Text>
        <Text style={[styles.body, { color: colors.onDanger }]}>{t('emergency.reason', { flag: tr(match.label) })}</Text>
      </View>

      <Pressable
        onPress={call}
        accessibilityRole="button"
        accessibilityHint={t('emergency.callHint')}
        style={({ pressed }) => [styles.call, { backgroundColor: colors.onDanger, opacity: pressed ? 0.85 : 1 }]}>
        <Text style={[styles.callText, { color: colors.danger }]}>{t('emergency.call')}</Text>
      </Pressable>
      {callFailed && <Text style={[styles.body, { color: colors.onDanger }]}>{t('emergency.callFailed')}</Text>}

      <View style={[styles.nearest, { borderTopColor: colors.onDanger }]}>
        {nearest ? (
          <>
            <Text style={[styles.label, { color: colors.onDanger }]}>{t('emergency.nearest')}</Text>
            <Text style={[styles.hospital, { color: colors.onDanger }]}>{tr(nearest.hospital.name)}</Text>
            <Text style={[styles.body, { color: colors.onDanger }]}>
              {t('emergency.trip', { km: nearest.drive.km.toFixed(1), min: nearest.drive.min })}
            </Text>
          </>
        ) : (
          <Text style={[styles.body, { color: colors.onDanger }]}>{t('emergency.noneOpen')}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch', borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 32 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 26, marginTop: spacing.xs },
  call: {
    minHeight: minTouch + 12,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  callText: { fontFamily: fonts.bold, fontSize: 20 },
  nearest: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md },
  label: { fontFamily: fonts.medium, fontSize: 14 },
  hospital: { fontFamily: fonts.semiBold, fontSize: 18, marginTop: spacing.xs },
});
