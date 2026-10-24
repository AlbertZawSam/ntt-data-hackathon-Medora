/**
 * Hospital details a person opens from a Find care result to decide where to go, built to scan in a
 * glance: two status tiles (beds, emergency department), care chips with the person's own need
 * outlined, specialties on duty as pills, bookable clinic specialists, and one line on wait and
 * freshness. Symbols as well as colour, so it reads without colour too. Labels only, never counts or
 * names on duty (AGENTS.md rule 6). Requirements: 5.2, 5.3, 8.1
 */
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { HospitalDetails } from '@medora/shared/logic/hospitalDetails';
import { NEED_KEYS } from '@medora/shared/logic/publicDirectory';
import type { NeedKey } from '@medora/shared/logic/types';
import type { StringKey } from '../i18n/t';
import { useT } from '../state/AppProvider';
import { fonts, fontSizes, radii, spacing, useTheme } from '../ui/theme';

const STALE_MIN = 30;
type Level = 'good' | 'some' | 'none';

const SYMBOL: Record<Level, string> = { good: '✓', some: '!', none: '✕' };
const careLevel = (label: string): Level => (label === 'available' ? 'good' : label === 'limited' ? 'some' : 'none');
const bedLevel = (beds: HospitalDetails['beds']): Level => (beds === 'available' ? 'good' : beds === 'limited' ? 'some' : 'none');

export function HospitalDetailsView({ details, nowMs, need }: { details: HospitalDetails; nowMs: number; need?: NeedKey }): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const color: Record<Level, string> = { good: theme.success, some: theme.warning, none: theme.emergency };
  // A light tint of the status colour behind tiles and chips (hex colour plus alpha).
  const tint = (level: Level): string => `${color[level]}22`;
  const ageMin = Math.max(0, Math.round((nowMs - Date.parse(details.updatedAt)) / 60_000));
  const stale = !(ageMin <= STALE_MIN);
  const specialty = (key: string): string => (key === 'general' ? t('details.erDoctor') : t(`specialty.${key}` as StringKey));
  const ed: Level = details.edOpen ? 'good' : 'none';
  const beds = bedLevel(details.beds);

  return (
    <View style={[styles.box, { borderColor: theme.border, backgroundColor: theme.background }]}>
      <View style={styles.tiles}>
        <Tile title={t('details.bedsTitle')} value={t(`details.bedsFree.${details.bedsFree}` as StringKey)} symbol={SYMBOL[beds]} color={color[beds]} tint={tint(beds)} />
        <Tile title={t('details.edTitle')} value={t(details.edOpen ? 'details.edOpen' : 'details.edClosed')} symbol={SYMBOL[ed]} color={color[ed]} tint={tint(ed)} />
      </View>

      <Text style={[styles.heading, { color: theme.textMuted }]}>{t('details.careTitle')}</Text>
      <View style={styles.chips}>
        {NEED_KEYS.map((key) => {
          const level = careLevel(details.care[key]);
          const mine = key === need;
          return (
            <View
              key={key}
              accessible
              accessibilityLabel={`${t(`need.${key}` as StringKey)}: ${t(`label.${details.care[key]}` as StringKey)}`}
              style={[styles.chip, { backgroundColor: tint(level), borderColor: mine ? color[level] : 'transparent' }]}
            >
              <Text style={[styles.chipText, { color: color[level] }]}>
                {SYMBOL[level]} {t(`details.needShort.${key}` as StringKey)}
              </Text>
              {mine ? <Text style={[styles.mine, { color: color[level] }]}>{t('details.yourNeed')}</Text> : null}
            </View>
          );
        })}
      </View>

      {details.onDuty.length > 0 ? (
        <>
          <Text style={[styles.heading, { color: theme.textMuted }]}>{t('details.onDutyTitle')}</Text>
          <View style={styles.pills}>
            {details.onDuty.map((s) => (
              <Text key={s} style={[styles.pill, { color: theme.primary, borderColor: theme.primary }]}>
                {specialty(s)}
              </Text>
            ))}
          </View>
        </>
      ) : null}

      {details.clinic.length > 0 ? (
        <>
          <Text style={[styles.heading, { color: theme.textMuted }]}>{t('details.clinicTitle')}</Text>
          {details.clinic.map((c, i) => (
            <View key={`${c.specialty}-${i}`} style={[styles.clinicRow, { borderColor: theme.border }]}>
              <View style={styles.flex}>
                <Text style={[styles.clinicSpecialty, { color: theme.text }]}>{specialty(c.specialty)}</Text>
                <Text style={[styles.small, { color: theme.textMuted }]}>{c.name ?? t('details.namePrivate')}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/(patient)/specialists' as Href)}
                style={({ pressed }) => [styles.book, { backgroundColor: theme.primary, opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={[styles.bookText, { color: theme.onPrimary }]}>{t('details.book')}</Text>
              </Pressable>
            </View>
          ))}
        </>
      ) : null}

      <Text style={[styles.footer, { color: stale ? theme.warning : theme.textMuted }]}>
        {t('details.waitShort', { min: details.typicalWaitMin })} · {stale ? t('fresh.outdated') : t('fresh.updatedAgo', { min: ageMin })}
      </Text>
    </View>
  );
}

function Tile({ title, value, symbol, color, tint }: { title: string; value: string; symbol: string; color: string; tint: string }): React.JSX.Element {
  const theme = useTheme();
  return (
    <View accessible accessibilityLabel={`${title}: ${value}`} style={[styles.tile, { backgroundColor: tint }]}>
      <Text style={[styles.tileTitle, { color: theme.textMuted }]}>{title}</Text>
      <Text style={[styles.tileValue, { color }]}>
        {symbol} {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: { flex: 1, borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, gap: 2 },
  tileTitle: { fontSize: fontSizes.xs, fontFamily: fonts.semibold, letterSpacing: 0.6, textTransform: 'uppercase' },
  tileValue: { fontSize: fontSizes.lg, fontFamily: fonts.bold },
  heading: { fontSize: fontSizes.xs, fontFamily: fonts.semibold, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { flexBasis: '47%', flexGrow: 1, borderWidth: 2, borderRadius: radii.md, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  chipText: { fontSize: fontSizes.md, fontFamily: fonts.semibold },
  mine: { fontSize: fontSizes.xs, fontFamily: fonts.medium },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2, fontSize: fontSizes.sm, fontFamily: fonts.medium, overflow: 'hidden' },
  clinicRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radii.md, padding: spacing.sm },
  flex: { flex: 1 },
  clinicSpecialty: { fontSize: fontSizes.md, fontFamily: fonts.semibold },
  small: { fontSize: fontSizes.sm, fontFamily: fonts.regular },
  book: { borderRadius: radii.md, paddingHorizontal: spacing.md, minHeight: 40, justifyContent: 'center' },
  bookText: { fontSize: fontSizes.sm, fontFamily: fonts.semibold },
  footer: { fontSize: fontSizes.sm, fontFamily: fonts.medium, marginTop: spacing.xs },
});
