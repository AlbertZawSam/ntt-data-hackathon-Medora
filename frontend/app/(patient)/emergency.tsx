/**
 * Emergency screen: shown when a red flag matches. It never calls a model; it tells the patient
 * to call 1669 now. Requirements: 4.2, 4.3
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { RED_FLAGS } from '@medora/shared/logic/redFlags';
import { pick } from '../../src/i18n/t';
import { call1669 } from '../../src/services/emergency';
import { useApp, useT } from '../../src/state/AppProvider';
import { Button } from '../../src/ui/Button';
import { fonts, fontSizes, radii, spacing, useTheme } from '../../src/ui/theme';

export default function EmergencyScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const { lang } = useApp();
  const { flag } = useLocalSearchParams<{ flag?: string }>();
  const rule = RED_FLAGS.find((r) => r.key === flag);

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
});
