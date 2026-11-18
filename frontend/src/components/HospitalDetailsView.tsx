/**
 * Hospital details a person opens from a Find care result to decide where to go, built to scan in a
 * glance: two status tiles (beds, emergency department), care chips showing what this hospital can do for each
 * category, with the person's own category active and the others stepped back, only the equipment that category needs, specialties on
 * duty as pills, one action to the matching specialists, and one line on wait and freshness. Symbols as well
 * as colour, so it reads without colour too. Free beds as the exact count and equipment as working or down
 * (AGENTS.md rule 6); never staff names. Without a `need` (a doctor's view) every category and item shows.
 * Requirements: 5.2, 5.3, 8.1
 */
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { equipmentForCase } from '@medora/shared/logic/equipment';
import type { HospitalDetails } from '@medora/shared/logic/hospitalDetails';
import { NEED_KEYS } from '@medora/shared/logic/publicDirectory';
import { specialtyForNeed } from '@medora/shared/logic/specialists';
import type { NeedKey } from '@medora/shared/logic/types';
import { agoText } from '../i18n/ago';
import { bedsText } from '../i18n/beds';
import type { StringKey } from '../i18n/t';
import { useT } from '../state/AppProvider';
import { Button } from '../ui/Button';
import { fonts, fontSizes, radii, spacing, useTheme } from '../ui/theme';

const STALE_MIN = 30;
type Level = 'good' | 'some' | 'none';

const SYMBOL: Record<Level, string> = { good: '✓', some: '!', none: '✕' };
const careLevel = (label: string): Level => (label === 'available' ? 'good' : label === 'limited' ? 'some' : 'none');
const bedLevel = (beds: HospitalDetails['beds']): Level => (beds === 'available' ? 'good' : beds === 'limited' ? 'some' : 'none');

export function HospitalDetailsView({ details, nowMs, need, showBooking = true }: { details: HospitalDetails; nowMs: number; need?: NeedKey; showBooking?: boolean }): React.JSX.Element {
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
  // With the person's category known, only its equipment matters; a doctor comparing hospitals sees everything.
  const equipment = need ? equipmentForCase(details.equipment, need) : details.equipment;
  const wanted = need ? specialtyForNeed(need) : undefined;

  return (
    <View style={[styles.box, { borderColor: theme.border, backgroundColor: theme.background }]}>
      <View style={styles.tiles}>
        <Tile title={t('details.bedsTitle')} value={bedsText(t, details.freeBeds)} symbol={SYMBOL[beds]} color={color[beds]} tint={tint(beds)} />
        <Tile title={t('details.edTitle')} value={t(details.edOpen ? 'details.edOpen' : 'details.edClosed')} symbol={SYMBOL[ed]} color={color[ed]} tint={tint(ed)} />
      </View>

      <Text style={[styles.heading, { color: theme.textMuted }]}>{t('details.careTitle')}</Text>
      <View style={styles.chips}>
        {NEED_KEYS.map((key) => {
          const level = careLevel(details.care[key]);
          const name = t(`details.needShort.${key}` as StringKey);
          const mine = key === need;
          // Every category shows what this hospital can do for it, so hospitals differ at a glance; only the person's own
          // category is active (border, full colour, "your need"), the others step back but keep their symbol.
          const other = Boolean(need) && !mine;
          return (
            <View
              key={key}
              accessible
              accessibilityLabel={`${name}: ${t(`label.${details.care[key]}` as StringKey)}${mine ? `, ${t('details.yourNeed')}` : ''}`}
              style={[styles.chip, other && styles.chipOff, { backgroundColor: tint(level), borderColor: mine ? color[level] : 'transparent' }]}
            >
              <Text style={[styles.chipText, { color: color[level] }]}>
                {SYMBOL[level]} {name}
              </Text>
              {mine ? <Text style={[styles.mine, { color: color[level] }]}>{t('details.yourNeed')}</Text> : null}
            </View>
          );
        })}
      </View>

      {equipment.length > 0 ? (
        <>
          <Text style={[styles.heading, { color: theme.textMuted }]}>{t('details.equipmentTitle')}</Text>
          <View style={styles.chips}>
            {equipment.map((e) => {
              const level: Level = e.working ? 'good' : 'none';
              return (
                <View
                  key={e.key}
                  accessible
                  accessibilityLabel={`${t(`equip.${e.key}` as StringKey)}: ${t(e.working ? 'details.working' : 'details.down')}`}
                  style={[styles.chip, { backgroundColor: tint(level), borderColor: 'transparent' }]}
                >
                  <Text style={[styles.chipText, { color: color[level] }]}>
                    {SYMBOL[level]} {t(`equip.${e.key}` as StringKey)}
                  </Text>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

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

      {/* One way to the specialists that fit the category, pre-filtered; the booking itself happens there. */}
      {showBooking && wanted ? (
        <Button
          variant="secondary"
          size="sm"
          icon="people-outline"
          iconRight="chevron-forward"
          label={wanted === 'general' ? t('details.seeGeneralDoctors') : t('details.seeSpecialists', { specialty: t(`specialty.${wanted}` as StringKey) })}
          onPress={() => router.push({ pathname: '/(patient)/specialists', params: { specialty: wanted } } as unknown as Href)}
        />
      ) : null}

      <Text style={[styles.footer, { color: stale ? theme.warning : theme.textMuted }]}>
        {t('details.waitShort', { min: details.typicalWaitMin })} · {stale ? t('fresh.outdated') : t('fresh.updatedAgo', { ago: agoText(t, Date.parse(details.updatedAt), nowMs) })}
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
  chipOff: { opacity: 0.6 },
  chipText: { fontSize: fontSizes.md, fontFamily: fonts.semibold },
  mine: { fontSize: fontSizes.xs, fontFamily: fonts.medium },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2, fontSize: fontSizes.sm, fontFamily: fonts.medium, overflow: 'hidden' },
  footer: { fontSize: fontSizes.sm, fontFamily: fonts.medium, marginTop: spacing.xs },
});
