import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MapView, type MapPin } from '@/components/MapView';
import type { StringKey } from '@/i18n/t';
import { hospitals } from '@/logic/data';
import {
  findSpecialists,
  LANGUAGES,
  SPECIALTIES,
  suggestSpecialty,
  type Slot,
  type Specialty,
  type SpokenLanguage,
} from '@/logic/specialists';
import { useT } from '@/state/language';
import { useLocateMe, useLocationLabel, usePatientLocation } from '@/state/patientLocation';
import { fonts, minTouch, radius, spacing, useTheme } from '@/ui/theme';

// Find a specialist (task 13, requirement 8). Booking a slot (13.3) needs the backend.

const DAY_KEYS = new Set(['today', 'tomorrow', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

export default function SpecialistsScreen() {
  const { colors } = useTheme();
  const { t, tr, lang } = useT();
  const { location, lastNeed } = usePatientLocation();
  const locationLabel = useLocationLabel();
  const { locate, locating, notice } = useLocateMe();
  const suggested = suggestSpecialty(lastNeed);
  const [picked, setPicked] = useState<Specialty | null>(null);
  // Starts in the app's language; null means any language.
  const [language, setLanguage] = useState<SpokenLanguage | null>(lang === 'th' ? 'Thai' : 'English');

  const specialty = picked ?? suggested;
  const now = new Date();
  const rows = specialty ? findSpecialists(hospitals, { specialty, language }, location.point, now) : [];
  const nearestId = rows[0]?.hospital.id;

  const pins: MapPin[] = [...new Map(rows.map((r) => [r.hospital.id, r.hospital])).values()].map((h) => ({
    id: h.id,
    point: h,
    label: tr(h.name),
    tone: h.id === nearestId ? 'primary' : 'muted',
    selected: h.id === nearestId,
  }));
  const nearest = rows[0]?.hospital;

  const slotLabel = (slot: Slot) =>
    t('specialists.slot', {
      day: DAY_KEYS.has(slot.day) ? t(`day.${slot.day}` as StringKey) : slot.day,
      time: slot.time,
    });

  const chip = (label: string, selected: boolean, onPress: () => void, badge?: string) => (
    <Pressable
      key={label}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: colors.primary, backgroundColor: selected ? colors.primary : 'transparent', opacity: pressed ? 0.7 : 1 },
      ]}>
      <Text style={[styles.chipText, { color: selected ? colors.onPrimary : colors.primary }]}>{label}</Text>
      {badge && <Text style={[styles.chipBadge, { color: selected ? colors.onPrimary : colors.textMuted }]}>{badge}</Text>}
    </Pressable>
  );

  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }];

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <View style={[card, styles.locationRow]}>
        <Text style={[styles.body, styles.flex, { color: colors.text }]} numberOfLines={2}>
          {t('specialists.near', { place: locationLabel })}
        </Text>
        <Pressable
          onPress={locate}
          disabled={locating}
          accessibilityRole="button"
          style={({ pressed }) => [styles.small, { borderColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}>
          {locating ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={[styles.smallText, { color: colors.primary }]}>{t('home.useMyLocation')}</Text>
          )}
        </Pressable>
      </View>
      {notice && (
        <View style={styles.notice}>
          <Text style={[styles.body, { color: colors.text }]}>{t(notice.key)}</Text>
          {notice.settings && (
            <Pressable onPress={() => Linking.openSettings()} accessibilityRole="button" hitSlop={8}>
              <Text style={[styles.link, { color: colors.primary }]}>{t('home.openSettings')}</Text>
            </Pressable>
          )}
        </View>
      )}

      <Text style={[styles.label, { color: colors.textMuted }]}>{t('specialists.specialty')}</Text>
      <View style={styles.chips}>
        {SPECIALTIES.map((s) =>
          chip(t(`spec.${s}`), s === specialty, () => setPicked(s), s === suggested ? t('specialists.suggested') : undefined),
        )}
      </View>

      <Text style={[styles.label, { color: colors.textMuted }]}>{t('specialists.language')}</Text>
      <View style={styles.chips}>
        {chip(t('language.any'), language === null, () => setLanguage(null))}
        {LANGUAGES.map((l) => chip(t(`language.${l}`), language === l, () => setLanguage(l)))}
      </View>

      {!specialty ? (
        <Text style={[styles.body, { color: colors.textMuted }]}>{t('specialists.choose')}</Text>
      ) : rows.length === 0 ? (
        <Text style={[styles.body, { color: colors.textMuted }]}>{t('specialists.none', { specialty: t(`spec.${specialty}`) })}</Text>
      ) : (
        <>
          <MapView
            height={240}
            user={location.point}
            pins={pins}
            routes={nearest ? [{ id: nearest.id, from: location.point, to: nearest, tone: 'primary' }] : []}
          />
          {rows.map((row, i) => (
            <View
              key={`${row.hospital.id}-${i}`}
              style={[card, row.hospital.id === nearestId && { borderColor: colors.primary, borderWidth: 2 }]}>
              {row.hospital.id === nearestId && i === 0 && (
                <Text style={[styles.badge, { color: colors.primary }]}>{t('specialists.nearest')}</Text>
              )}
              <Text style={[styles.name, { color: colors.text }]}>
                {row.specialist.namePublic && row.specialist.name ? row.specialist.name : t('specialists.nameHidden')}
              </Text>
              <Text style={[styles.body, { color: colors.text }]}>
                {t(`spec.${row.specialist.specialty as Specialty}`)} · {tr(row.hospital.name)}
              </Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                {t('care.trip', { km: row.km.toFixed(1), min: row.driveMin })}
              </Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                {t('specialists.speaks', {
                  languages: row.specialist.languages
                    .map((l) => ((LANGUAGES as readonly string[]).includes(l) ? t(`language.${l as SpokenLanguage}`) : l))
                    .join(', '),
                })}
              </Text>
              {row.slots.length === 0 ? (
                <Text style={[styles.meta, { color: colors.textMuted }]}>{t('specialists.noSlots')}</Text>
              ) : (
                <View style={styles.slots}>
                  {row.slots.map((slot) => (
                    <View key={`${slot.day}-${slot.time}`} style={[styles.slot, { borderColor: colors.border, backgroundColor: colors.background }]}>
                      <Text style={[styles.slotText, { color: colors.text }]}>{slotLabel(slot)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md },
  flex: { flex: 1 },
  card: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, gap: 2 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  notice: { gap: spacing.xs },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  link: { fontFamily: fonts.semiBold, fontSize: 15, lineHeight: 22 },
  small: {
    minHeight: minTouch,
    minWidth: minTouch,
    borderWidth: 1.5,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallText: { fontFamily: fonts.semiBold, fontSize: 14 },
  label: { fontFamily: fonts.medium, fontSize: 13, marginBottom: -spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    minHeight: minTouch,
  },
  chipText: { fontFamily: fonts.medium, fontSize: 14 },
  chipBadge: { fontFamily: fonts.regular, fontSize: 11 },
  badge: { fontFamily: fonts.bold, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  name: { fontFamily: fonts.semiBold, fontSize: 17, lineHeight: 24 },
  meta: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  slot: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  slotText: { fontFamily: fonts.medium, fontSize: 13 },
});
