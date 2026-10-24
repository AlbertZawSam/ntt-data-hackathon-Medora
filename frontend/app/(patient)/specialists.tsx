/**
 * Find a specialist: filter by specialty and language, nearest hospital first then soonest slot, and
 * book a slot instantly. The doctor's name shows only if they chose to share it, or after booking.
 * Requirements: 8.1 to 8.6
 */
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LANGUAGES, SPECIALTIES, matchesSpecialistQuery, specialtyForNeed, type PublicSpecialist } from '@medora/shared/logic/specialists';
import { pick, type StringKey } from '../../src/i18n/t';
import { LocationChip } from '../../src/components/LocationChip';
import { MapView } from '../../src/components/MapView';
import { bookSpecialist, findSpecialists } from '../../src/services/data';
import { getLastNeed } from '../../src/services/lastNeed';
import { useChosenLocation } from '../../src/services/location';
import { useApp, useT } from '../../src/state/AppProvider';
import { Badge, Chip } from '../../src/ui/Badge';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { EmptyState } from '../../src/ui/EmptyState';
import { Field } from '../../src/ui/Field';
import { Icon, type IconName } from '../../src/ui/Icon';
import { Notice } from '../../src/ui/Notice';
import { Page } from '../../src/ui/Page';
import { Reveal } from '../../src/ui/Reveal';
import { SectionHeader } from '../../src/ui/SectionHeader';
import { SkeletonCard } from '../../src/ui/Skeleton';
import { fonts, fontSizes, radii, spacing, useBreakpoint, useTheme } from '../../src/ui/theme';

const SPECIALTY_ICON: Record<string, IconName> = {
  cardiology: 'heart',
  neurology: 'pulse',
  obstetrics: 'woman',
  pediatrics: 'happy',
  orthopedics: 'body',
  general: 'medkit',
};

export default function PatientSpecialistsScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const wide = useBreakpoint() === 'expanded';
  const { lang } = useApp();
  const location = useChosenLocation();
  // A chosen specialty chip, or none: typing a search or tapping "All" looks across every specialty.
  const [specialty, setSpecialty] = React.useState<string | undefined>(specialtyForNeed(getLastNeed()));
  const [typed, setTyped] = React.useState('');
  const [language, setLanguage] = React.useState<string | undefined>(lang);
  const [list, setList] = React.useState<PublicSpecialist[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<StringKey | null>(null);
  const [booked, setBooked] = React.useState<string | null>(null);

  const search = React.useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const found = await findSpecialists({ lat: location.lat, lng: location.lng, ...(specialty ? { specialty } : {}), ...(language ? { language } : {}) });
      // The typed words are matched here against specialty (and its everyday words, in English and Thai), the doctor's
      // name when shown, the hospital and the language.
      setList(found.filter((item) => matchesSpecialistQuery(item, typed, [t(`specialty.${item.specialty}` as StringKey)])));
    } catch {
      setError('patient.specialists.searchError');
    } finally {
      setBusy(false);
    }
  }, [location.lat, location.lng, specialty, language, typed, t]);

  const book = async (s: PublicSpecialist, slotId: string): Promise<void> => {
    setError(null);
    try {
      await bookSpecialist({ specialistId: s.id, slotId });
      setBooked(s.name ?? t(`specialty.${s.specialty}` as StringKey));
      await search();
    } catch {
      setError('patient.specialists.bookError'); // includes a slot someone else just took
      await search();
    }
  };

  const map =
    list && list.length > 0 ? (
      <MapView
        accessibilityLabel={t('map.alt.specialists')}
        height={wide ? 460 : 240}
        markers={[
          { id: 'me', point: location, kind: 'me', label: t('map.you') },
          ...list.map((s) => ({ id: s.id, point: s, kind: 'ok' as const, label: pick(s.hospitalName, lang) })),
        ]}
        route={[location, list[0]]}
      />
    ) : null;

  const results = (
    <View style={styles.stack}>
      {busy && !list ? (
        <>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </>
      ) : null}
      {list?.length === 0 ? (
        <Card padding="lg">
          <EmptyState icon="search-outline" title={t('patient.specialists.noResults')} />
        </Card>
      ) : null}
      {list?.map((s, index) => (
        <Reveal key={s.id} index={index}>
          <Card padding="lg">
            <View style={styles.doctorHead}>
              <View style={[styles.avatar, { backgroundColor: theme.primarySoft }]}>
                <Icon name={SPECIALTY_ICON[s.specialty] ?? 'medkit'} size={26} color={theme.primary} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.name, { color: theme.text }]}>{s.name ?? t('patient.specialists.nameHidden')}</Text>
                <Text style={[styles.meta, { color: theme.textMuted }]}>{pick(s.hospitalName, lang)}</Text>
              </View>
            </View>
            <View style={styles.row}>
              <Badge tone="primary" label={t(`specialty.${s.specialty}` as StringKey)} />
              <Badge tone="info" icon="navigate" label={t('patient.specialists.kmAway', { km: s.distanceKm })} />
            </View>
            <Text style={[styles.label, { color: theme.text }]}>{t('patient.specialists.nextSlots')}</Text>
            <View style={styles.row}>
              {s.slots.slice(0, 4).map((slot) => (
                <Button
                  key={slot.id}
                  size="sm"
                  variant="secondary"
                  fullWidth={false}
                  icon="calendar-outline"
                  label={`${slot.day} ${slot.time}`}
                  accessibilityHint={t('patient.specialists.bookButton')}
                  onPress={() => void book(s, slot.id)}
                />
              ))}
            </View>
          </Card>
        </Reveal>
      ))}
    </View>
  );

  return (
    <Page title={t('patient.specialists.title')} subtitle={t('patient.specialists.suggested')}>
      <Card padding="lg">
        <LocationChip />
        <Text accessibilityRole="header" style={[styles.label, { color: theme.text }]}>{t('patient.specialists.specialtyLabel')}</Text>
        <Field
          label={t('patient.specialists.queryLabel')}
          hint={t('patient.specialists.queryHint')}
          icon="search"
          value={typed}
          onChangeText={(text) => {
            setTyped(text);
            if (text.trim()) setSpecialty(undefined);
          }}
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => void search()}
        />
        <View style={styles.row}>
          <Chip label={t('patient.specialists.anySpecialty')} icon="apps-outline" selected={specialty === undefined} onPress={() => setSpecialty(undefined)} />
          {SPECIALTIES.map((s) => (
            <Chip key={s} label={t(`specialty.${s}` as StringKey)} icon={SPECIALTY_ICON[s] ?? 'medkit'} selected={specialty === s} onPress={() => setSpecialty(s)} />
          ))}
        </View>
        <Text accessibilityRole="header" style={[styles.label, { color: theme.text }]}>{t('patient.specialists.languageLabel')}</Text>
        <View style={styles.row}>
          <Chip label={t('patient.specialists.anyLanguage')} icon="globe-outline" selected={language === undefined} onPress={() => setLanguage(undefined)} />
          {LANGUAGES.map((l) => (
            <Chip key={l} label={t(`lang.${l}` as StringKey)} icon="language" selected={language === l} onPress={() => setLanguage(l)} />
          ))}
        </View>
        <Button size="lg" icon="search" label={t('patient.specialists.search')} busy={busy} onPress={() => void search()} />
      </Card>
      {error ? <Notice tone="danger">{t(error)}</Notice> : null}
      {booked ? (
        <Notice tone="success" actionLabel={t('patient.requests.title')} onAction={() => router.push('/(patient)/requests' as Href)}>
          {t('patient.specialists.booked', { doctor: booked })}
        </Notice>
      ) : null}
      {list && list.length > 0 ? <SectionHeader title={t('patient.specialists.title')} /> : null}
      {wide && map ? (
        <View style={styles.columns}>
          <View style={styles.listColumn}>{results}</View>
          <View style={styles.mapColumn}>{map}</View>
        </View>
      ) : (
        <View style={styles.stack}>
          {map}
          {results}
        </View>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stack: { gap: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  columns: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  listColumn: { flex: 1.1 },
  mapColumn: { flex: 1 },
  doctorHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 52, height: 52, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: fontSizes.lg, fontFamily: fonts.bold },
  meta: { fontSize: fontSizes.sm, fontFamily: fonts.regular },
  label: { fontSize: fontSizes.md, fontFamily: fonts.semibold },
});
