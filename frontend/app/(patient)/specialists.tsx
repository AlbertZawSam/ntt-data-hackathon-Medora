/**
 * Find a specialist: a search box, specialty chips, then results nearest first. Before the person searches or
 * picks a specialty a small sample shows (the nearest of each specialty); from Find care the matching specialty
 * arrives as a route parameter and is already picked. Each specialist shows weekly clinic hours instead of
 * dates, and tapping a weekday books the next open time on that day. The doctor's name shows only if they
 * chose to share it, or after booking. Requirements: 8.1 to 8.6
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  LANGUAGES,
  SPECIALTIES,
  isSpecialty,
  matchesSpecialistQuery,
  nextSlotOnWeekday,
  sampleSpecialists,
  weeklySchedule,
  type PublicSpecialist,
} from '@medora/shared/logic/specialists';
import { looksLikeInjection, looksLikeNonsense } from '@medora/shared/logic/understand';
import { hoursText, weekdayText, whenText } from '../../src/i18n/hours';
import { pick, type StringKey } from '../../src/i18n/t';
import { LocationChip } from '../../src/components/LocationChip';
import { MapView } from '../../src/components/MapView';
import { bookSpecialist, findSpecialists } from '../../src/services/data';
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
import { focusRing, pointer, webTransition } from '../../src/ui/web';

const SPECIALTY_ICON: Record<string, IconName> = {
  cardiology: 'heart',
  neurology: 'pulse',
  obstetrics: 'woman',
  pediatrics: 'happy',
  orthopedics: 'body',
  general: 'medkit',
};
const SAMPLE_SIZE = 3;

export default function PatientSpecialistsScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const wide = useBreakpoint() === 'expanded';
  const { lang } = useApp();
  const location = useChosenLocation();
  // From Find care: the specialty that fits the category found there (injury → orthopedics). Unknown values are ignored.
  const params = useLocalSearchParams<{ specialty?: string }>();
  const fromCare = isSpecialty(params.specialty) ? params.specialty : undefined;
  // A chosen specialty chip, or none: a typed search or "All" looks across every specialty.
  const [specialty, setSpecialty] = React.useState<string | undefined>(fromCare);
  const [typed, setTyped] = React.useState('');
  // The search text last sent; typing alone changes nothing until the person submits.
  const [query, setQuery] = React.useState('');
  const [language, setLanguage] = React.useState<string | undefined>(lang);
  const [list, setList] = React.useState<PublicSpecialist[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<StringKey | null>(null);
  const [booked, setBooked] = React.useState<{ doctor: string; when: string } | null>(null);
  // What the typed words told us: nonsense or an instruction ("unclear"), or real words with no exact match.
  const [hint, setHint] = React.useState<'unclear' | 'noMatch' | null>(null);

  // Coming back from Find care with another category picks that specialty again.
  React.useEffect(() => {
    if (!fromCare) return;
    setSpecialty(fromCare);
    setTyped('');
    setQuery('');
  }, [fromCare]);

  const search = React.useCallback(async (): Promise<void> => {
    setError(null);
    if (query && (looksLikeNonsense(query) || looksLikeInjection(query))) {
      setHint('unclear');
      setList([]);
      return;
    }
    setBusy(true);
    try {
      const found = await findSpecialists({ lat: location.lat, lng: location.lng, ...(specialty ? { specialty } : {}), ...(language ? { language } : {}) });
      // The typed words are matched here against specialty (and its everyday words, in English and Thai), the doctor's
      // name when shown, the hospital and the language.
      const matched = found.filter((item) => matchesSpecialistQuery(item, query, [t(`specialty.${item.specialty}` as StringKey)]));
      // Real words that match no specialty: show everyone nearby rather than an empty page, and say so.
      const noMatch = query.length > 0 && matched.length === 0 && found.length > 0;
      setHint(noMatch ? 'noMatch' : null);
      setList(noMatch ? found : matched);
    } catch {
      setError('patient.specialists.searchError');
    } finally {
      setBusy(false);
    }
  }, [location.lat, location.lng, specialty, language, query, t]);

  // Results follow the filters at once: on load, and whenever a chip or the submitted text changes.
  React.useEffect(() => {
    void search();
  }, [search]);

  const submit = (): void => {
    const text = typed.trim();
    if (text) setSpecialty(undefined);
    setQuery(text);
  };

  const book = async (s: PublicSpecialist, weekday: number): Promise<void> => {
    setError(null);
    const slot = nextSlotOnWeekday(s.slots, weekday, Date.now());
    if (!slot) {
      setError('patient.specialists.dayFull');
      await search();
      return;
    }
    try {
      await bookSpecialist({ specialistId: s.id, slotId: slot.id });
      setBooked({ doctor: (lang === 'th' && s.nameTh) || s.name || t(`specialty.${s.specialty}` as StringKey), when: whenText(t, lang, slot) });
      await search();
    } catch {
      setError('patient.specialists.bookError'); // includes a slot someone else just took
      await search();
    }
  };

  // Before any search or pick: a taste of who is nearby, not the whole list.
  const browsing = !specialty && !query;
  const shown = list ? (browsing ? sampleSpecialists(list, SAMPLE_SIZE) : list) : null;
  const nowMs = Date.now();

  const map =
    shown && shown.length > 0 ? (
      <MapView
        accessibilityLabel={t('map.alt.specialists')}
        height={wide ? 460 : 240}
        markers={[
          { id: 'me', point: location, kind: 'me', label: t('map.you') },
          ...shown.map((s) => ({ id: s.id, point: s, kind: 'ok' as const, label: pick(s.hospitalName, lang) })),
        ]}
        route={[location, shown[0]]}
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
      {hint === 'unclear' ? (
        <Notice tone="warning" title={t('patient.specialists.unclearTitle')}>
          {t('patient.specialists.unclearBody')}
        </Notice>
      ) : null}
      {hint === 'noMatch' ? <Notice tone="info">{t('patient.specialists.noMatch')}</Notice> : null}
      {shown?.length === 0 && hint !== 'unclear' ? (
        <Card padding="lg">
          <EmptyState icon="search-outline" title={t('patient.specialists.noResults')} />
        </Card>
      ) : null}
      {shown?.map((s, index) => (
        <Reveal key={s.id} index={index}>
          <Card padding="lg">
            <View style={styles.doctorHead}>
              <View style={[styles.avatar, { backgroundColor: theme.primarySoft }]}>
                <Icon name={SPECIALTY_ICON[s.specialty] ?? 'medkit'} size={26} color={theme.primary} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.name, { color: theme.text }]}>{(lang === 'th' && s.nameTh) || s.name || t('patient.specialists.nameHidden')}</Text>
                <Text style={[styles.meta, { color: theme.textMuted }]}>{pick(s.hospitalName, lang)}</Text>
              </View>
            </View>
            <View style={styles.row}>
              <Badge tone="primary" label={t(`specialty.${s.specialty}` as StringKey)} />
              <Badge tone="info" icon="navigate" label={t('patient.specialists.kmAway', { km: s.distanceKm })} />
            </View>
            <Text style={[styles.label, { color: theme.text }]}>{t('patient.specialists.hoursTitle')}</Text>
            {/* Weekly hours like a clinic sign; a tap books the next open time on that weekday. */}
            <View style={styles.hours}>
              {weeklySchedule(s.slots, nowMs).map((range) => {
                const day = weekdayText(t, range.weekday);
                const hours = hoursText(t, lang, range);
                return (
                  <Pressable
                    key={`${range.weekday}-${range.start}`}
                    accessibilityRole="button"
                    accessibilityLabel={t('patient.specialists.weekdayRow', { day, hours })}
                    accessibilityHint={t('patient.specialists.bookOnDay')}
                    onPress={() => void book(s, range.weekday)}
                    style={(state) => [
                      styles.hoursRow,
                      { borderColor: theme.border, backgroundColor: (state as { hovered?: boolean }).hovered ? theme.primarySoft : theme.surface, opacity: state.pressed ? 0.8 : 1 },
                      pointer,
                      webTransition(),
                      focusRing(theme.primary, (state as { focused?: boolean }).focused === true),
                    ]}
                  >
                    <Text style={[styles.hoursDay, { color: theme.text }]}>{day}</Text>
                    <Text style={[styles.hoursTime, { color: theme.textMuted }]}>{hours}</Text>
                    <Icon name="chevron-forward" size={18} color={theme.primary} />
                  </Pressable>
                );
              })}
            </View>
          </Card>
        </Reveal>
      ))}
    </View>
  );

  return (
    <Page title={t('patient.specialists.title')} subtitle={t('patient.specialists.subtitle')}>
      <Card padding="lg">
        <LocationChip />
        <Field
          label={t('patient.specialists.queryLabel')}
          hint={t('patient.specialists.queryHint')}
          icon="search"
          value={typed}
          onChangeText={setTyped}
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={submit}
        />
        <Button size="sm" variant="secondary" fullWidth={false} icon="search" label={t('patient.specialists.search')} busy={busy} onPress={submit} />
        <View style={styles.row}>
          <Chip label={t('patient.specialists.anySpecialty')} icon="apps-outline" selected={specialty === undefined} onPress={() => setSpecialty(undefined)} />
          {SPECIALTIES.map((s) => (
            <Chip key={s} label={t(`specialty.${s}` as StringKey)} icon={SPECIALTY_ICON[s] ?? 'medkit'} selected={specialty === s} onPress={() => setSpecialty(s)} />
          ))}
        </View>
        {/* The language filter, kept to one short row. */}
        <View style={styles.row}>
          <Text style={[styles.meta, { color: theme.textMuted }]}>{t('patient.specialists.languageLabel')}</Text>
          <Chip label={t('patient.specialists.anyLanguage')} icon="globe-outline" selected={language === undefined} onPress={() => setLanguage(undefined)} />
          {LANGUAGES.map((l) => (
            <Chip key={l} label={t(`lang.${l}` as StringKey)} icon="language" selected={language === l} onPress={() => setLanguage(l)} />
          ))}
        </View>
      </Card>
      {error ? <Notice tone="danger">{t(error)}</Notice> : null}
      {booked ? (
        <Notice tone="success" actionLabel={t('patient.requests.title')} onAction={() => router.push('/(patient)/requests' as Href)}>
          {t('patient.specialists.bookedWhen', booked)}
        </Notice>
      ) : null}
      {shown && shown.length > 0 ? (
        browsing ? (
          <SectionHeader title={t('patient.specialists.sampleTitle')} subtitle={t('patient.specialists.sampleHint')} />
        ) : (
          <SectionHeader title={t('patient.specialists.resultsTitle')} subtitle={t('patient.specialists.found', { n: shown.length })} />
        )
      ) : null}
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
  hours: { gap: spacing.xs },
  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md, minHeight: 44 },
  hoursDay: { fontSize: fontSizes.md, fontFamily: fonts.semibold, minWidth: 96 },
  hoursTime: { flex: 1, fontSize: fontSizes.md, fontFamily: fonts.regular },
});
