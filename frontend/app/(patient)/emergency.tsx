/**
 * Emergency screen: shown when a red flag matches. It never calls a model; it tells the patient
 * to call 1669 now and names the nearest hospital whose emergency department is open, from the live
 * public directory (when the phone is offline, only the 1669 button shows). Requirements: 4.2, 4.3
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { nearestOpenEd } from '@medora/shared/logic/publicDirectory';
import { RED_FLAGS } from '@medora/shared/logic/redFlags';
import { pick } from '../../src/i18n/t';
import { call1669 } from '../../src/services/emergency';
<<<<<<< HEAD
import { nearestOpen } from '../../src/services/lastResults';
=======
import { useChosenLocation } from '../../src/services/location';
>>>>>>> 8a5d4019346fa10d073fc981a5c9dacec47b8a63
import { useApp, useT } from '../../src/state/AppProvider';
import { Button } from '../../src/ui/Button';
import { fonts, fontSizes, radii, spacing, useTheme } from '../../src/ui/theme';

export default function EmergencyScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const { lang, data } = useApp();
  const location = useChosenLocation();
  const { flag } = useLocalSearchParams<{ flag?: string }>();
  const rule = RED_FLAGS.find((r) => r.key === flag);
<<<<<<< HEAD
  // From the last search, kept in memory: works offline and never calls a model.
  const nearest = nearestOpen();
=======
  const nearest = React.useMemo(() => nearestOpenEd(data.publicDirectory, location, Date.now()), [data.publicDirectory, location]);
>>>>>>> 8a5d4019346fa10d073fc981a5c9dacec47b8a63

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <View style={[styles.banner, { backgroundColor: theme.emergency }]}>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.onEmergency }]}>
            {t('emergency.title')}
          </Text>
          {rule ? <Text style={[styles.flag, { color: theme.onEmergency }]}>{pick(rule.label, lang)}</Text> : null}
        </View>
        <Text style={[styles.instructions, { color: theme.text }]}>{t('emergency.instructions')}</Text>
        <Button label={t('emergency.call1669')} onPress={() => void call1669()} />
<<<<<<< HEAD
        <Text style={[styles.note, { color: theme.text }]}>
          {nearest ? t('emergency.nearestOpen', { name: pick(nearest.name, lang), min: nearest.driveMin }) : t('emergency.noCached')}
        </Text>
=======
        <View style={[styles.nearest, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Text style={[styles.nearestLabel, { color: theme.textMuted }]}>{t('emergency.nearestHospital')}</Text>
          <Text style={[styles.nearestName, { color: theme.text }]}>
            {nearest
              ? t('emergency.nearestDrive', { name: pick(nearest.entry.name, lang), min: Math.round(nearest.driveMin) })
              : t('emergency.noNearest')}
          </Text>
        </View>
>>>>>>> 8a5d4019346fa10d073fc981a5c9dacec47b8a63
        <Text style={[styles.note, { color: theme.textMuted }]}>{t('emergency.noAi')}</Text>
        <Button variant="link" label={t('emergency.back')} onPress={() => router.replace('/(patient)/home' as Href)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  column: { width: '100%', maxWidth: 480, gap: spacing.md },
  banner: { borderRadius: radii.lg, padding: spacing.lg, gap: spacing.xs },
  title: { fontSize: fontSizes.xxl, fontFamily: fonts.bold },
  flag: { fontSize: fontSizes.lg, fontFamily: fonts.medium },
  instructions: { fontSize: fontSizes.lg, fontFamily: fonts.semibold },
  note: { fontSize: fontSizes.sm, fontFamily: fonts.regular },
  nearest: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, gap: spacing.xs },
  nearestLabel: { fontSize: fontSizes.sm, fontFamily: fonts.medium },
  nearestName: { fontSize: fontSizes.md, fontFamily: fonts.semibold },
});
