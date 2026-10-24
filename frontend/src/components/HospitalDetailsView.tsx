/**
 * Hospital details a person opens from a Find care result to decide where to go: beds as a label,
 * the emergency department, the kinds of care it takes now, specialties on duty and clinic
 * specialists to book. Labels only, never counts or names on duty (AGENTS.md rule 6).
 * Requirements: 5.2, 5.3, 8.1
 */
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { HospitalDetails } from '@medora/shared/logic/hospitalDetails';
import { NEED_KEYS } from '@medora/shared/logic/publicDirectory';
import type { StringKey } from '../i18n/t';
import { useT } from '../state/AppProvider';
import { Button } from '../ui/Button';
import { fonts, fontSizes, radii, spacing, useTheme } from '../ui/theme';

const STALE_MIN = 30;

export function HospitalDetailsView({ details, nowMs }: { details: HospitalDetails; nowMs: number }): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const tone = (label: string): string => (label === 'available' ? theme.success : label === 'limited' ? theme.warning : theme.emergency);
  const ageMin = Math.max(0, Math.round((nowMs - Date.parse(details.updatedAt)) / 60_000));
  const specialty = (key: string): string => (key === 'general' ? t('details.erDoctor') : t(`specialty.${key}` as StringKey));

  return (
    <View style={[styles.box, { borderColor: theme.border, backgroundColor: theme.background }]}>
      <Text style={[styles.strong, { color: tone(details.beds) }]}>{t(`details.beds.${details.beds}` as StringKey)}</Text>
      <Text style={[styles.strong, { color: details.edOpen ? theme.success : theme.emergency }]}>
        {t(details.edOpen ? 'details.ed.open' : 'details.ed.closed')}
      </Text>

      <Text style={[styles.heading, { color: theme.text }]}>{t('details.care')}</Text>
      {NEED_KEYS.map((need) => (
        <View key={need} style={styles.row}>
          <Text style={[styles.body, { color: theme.text }]}>{t(`need.${need}` as StringKey)}</Text>
          <Text style={[styles.body, { color: tone(details.care[need]) }]}>{t(`label.${details.care[need]}` as StringKey)}</Text>
        </View>
      ))}

      <Text style={[styles.heading, { color: theme.text }]}>{t('details.onDuty')}</Text>
      <Text style={[styles.body, { color: details.onDuty.length ? theme.text : theme.textMuted }]}>
        {details.onDuty.length ? details.onDuty.map(specialty).join(' · ') : t('details.none')}
      </Text>

      <Text style={[styles.heading, { color: theme.text }]}>{t('details.clinic')}</Text>
      {details.clinic.length === 0 ? <Text style={[styles.body, { color: theme.textMuted }]}>{t('details.none')}</Text> : null}
      {details.clinic.map((c, i) => (
        <Text key={`${c.specialty}-${i}`} style={[styles.body, { color: theme.text }]}>
          {specialty(c.specialty)} · {c.name ?? t('details.namePrivate')}
        </Text>
      ))}
      {details.clinic.length > 0 ? (
        <Button variant="link" label={t('details.book')} onPress={() => router.push('/(patient)/specialists' as Href)} />
      ) : null}

      <Text style={[styles.note, { color: theme.textMuted }]}>
        {t('details.wait', { min: details.typicalWaitMin })} · {ageMin > STALE_MIN ? t('fresh.outdated') : t('fresh.updatedAgo', { min: ageMin })}
      </Text>
      <Text style={[styles.note, { color: theme.textMuted }]}>{t('details.labelsNote')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: radii.md, padding: spacing.md, gap: spacing.xs },
  strong: { fontSize: fontSizes.md, fontFamily: fonts.semibold },
  heading: { fontSize: fontSizes.sm, fontFamily: fonts.semibold, marginTop: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  body: { fontSize: fontSizes.sm, fontFamily: fonts.regular },
  note: { fontSize: fontSizes.xs, fontFamily: fonts.regular, marginTop: spacing.xs },
});
