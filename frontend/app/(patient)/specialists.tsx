/**
 * Find a specialist: filter by specialty and language, nearest hospital first then soonest slot, and
 * book a slot instantly. The doctor's name shows only if they chose to share it, or after booking.
 * Requirements: 8.1 to 8.6
 */
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LANGUAGES, SPECIALTIES, specialtyForNeed, type PublicSpecialist } from '@medora/shared/logic/specialists';
import { pick, type StringKey } from '../../src/i18n/t';
import { MapView } from '../../src/components/MapView';
import { bookSpecialist, findSpecialists } from '../../src/services/data';
import { getLastNeed } from '../../src/services/lastNeed';
import { useChosenLocation } from '../../src/services/location';
import { useApp, useT } from '../../src/state/AppProvider';
import { Button } from '../../src/ui/Button';
import { Screen } from '../../src/ui/Screen';
import { fonts, fontSizes, radii, spacing, useTheme } from '../../src/ui/theme';

export default function PatientSpecialistsScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const { lang } = useApp();
  const location = useChosenLocation();
  const [specialty, setSpecialty] = React.useState<string>(specialtyForNeed(getLastNeed()));
  const [language, setLanguage] = React.useState<string | undefined>(lang);
  const [list, setList] = React.useState<PublicSpecialist[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<StringKey | null>(null);
  const [booked, setBooked] = React.useState<string | null>(null);

  const search = React.useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      setList(await findSpecialists({ lat: location.lat, lng: location.lng, specialty, ...(language ? { language } : {}) }));
    } catch {
      setError('patient.specialists.searchError');
    } finally {
      setBusy(false);
    }
  }, [location.lat, location.lng, specialty, language]);

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

  return (
    <Screen title={t('patient.specialists.title')}>
      <Text style={[styles.note, { color: theme.textMuted }]}>{t('patient.specialists.suggested')}</Text>
      <Text style={[styles.label, { color: theme.text }]}>{t('patient.specialists.specialtyLabel')}</Text>
      <View style={styles.chips}>
        {SPECIALTIES.map((s) => (
          <Button key={s} label={t(`specialty.${s}` as StringKey)} variant={specialty === s ? 'primary' : 'secondary'} onPress={() => setSpecialty(s)} />
        ))}
      </View>
      <Text style={[styles.label, { color: theme.text }]}>{t('patient.specialists.languageLabel')}</Text>
      <View style={styles.chips}>
        <Button label={t('patient.specialists.anyLanguage')} variant={language === undefined ? 'primary' : 'secondary'} onPress={() => setLanguage(undefined)} />
        {LANGUAGES.map((l) => (
          <Button key={l} label={t(`lang.${l}` as StringKey)} variant={language === l ? 'primary' : 'secondary'} onPress={() => setLanguage(l)} />
        ))}
      </View>
      <Button label={t('patient.specialists.search')} busy={busy} onPress={() => void search()} />
      {error ? <Text style={[styles.note, { color: theme.emergency }]}>{t(error)}</Text> : null}
      {booked ? <Text accessibilityLiveRegion="polite" style={[styles.note, { color: theme.success }]}>{t('patient.specialists.booked', { doctor: booked })}</Text> : null}
      {list?.length === 0 ? <Text style={[styles.note, { color: theme.textMuted }]}>{t('patient.specialists.noResults')}</Text> : null}
      {list && list.length > 0 ? (
        <MapView
          accessibilityLabel={t('map.alt.specialists')}
          markers={[
            { id: 'me', point: location, kind: 'me', label: t('map.you') },
            ...list.map((s) => ({ id: s.id, point: s, kind: 'ok' as const, label: pick(s.hospitalName, lang) })),
          ]}
          route={[location, list[0]]}
        />
      ) : null}
      {list?.map((s) => (
        <View key={s.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.name, { color: theme.text }]}>{s.name ?? t('patient.specialists.nameHidden')}</Text>
          <Text style={[styles.note, { color: theme.textMuted }]}>{`${t(`specialty.${s.specialty}` as StringKey)} · ${pick(s.hospitalName, lang)}`}</Text>
          <Text style={[styles.note, { color: theme.textMuted }]}>{t('patient.specialists.kmAway', { km: s.distanceKm })}</Text>
          <Text style={[styles.label, { color: theme.text }]}>{t('patient.specialists.nextSlots')}</Text>
          {s.slots.slice(0, 4).map((slot) => (
            <Button key={slot.id} variant="secondary" label={`${slot.day} ${slot.time} · ${t('patient.specialists.bookButton')}`} onPress={() => void book(s, slot.id)} />
          ))}
        </View>
      ))}
      <Button variant="secondary" label={t('patient.requests.title')} onPress={() => router.push('/(patient)/requests' as Href)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  name: { fontSize: fontSizes.lg, fontFamily: fonts.semibold },
  label: { fontSize: fontSizes.md, fontFamily: fonts.semibold },
  note: { fontSize: fontSizes.sm, fontFamily: fonts.regular },
  chips: { gap: spacing.xs },
});
