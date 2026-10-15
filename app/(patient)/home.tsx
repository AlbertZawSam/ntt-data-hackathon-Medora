import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Call1669Button } from '@/components/Call1669Button';
import { MapView } from '@/components/MapView';
import { hospitals } from '@/logic/data';
import type { Place } from '@/logic/types';
import { searchLocation } from '@/services/location';
import { useT } from '@/state/language';
import { useLocateMe, useLocationLabel, usePatientLocation } from '@/state/patientLocation';
import { fonts, minTouch, radius, spacing, useTheme } from '@/ui/theme';

// Patient home (task 8.3): set a location by GPS, search or the map; call 1669; start Find care
// or Find a specialist. Hospital pins carry names only: no status on this screen (safety rule 6).

const SEARCH_DELAY_MS = 300;

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, tr, lang } = useT();
  const { location, setLocation } = usePatientLocation();
  const { locate, locating, notice, setNotice } = useLocateMe();
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);

  // Search as the patient types, after a short pause; a newer query cancels an older one.
  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    let current = true;
    const id = setTimeout(() => {
      searchLocation(query, lang, location.point).then((found) => current && setResults(found));
    }, SEARCH_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(id);
    };
  }, [query, lang, location.point]);

  const locateMe = () => {
    setPicking(false);
    locate();
  };

  const choosePlace = (place: Place) => {
    setLocation({ point: place, source: 'search', place });
    setQuery('');
    setResults(null);
    setNotice(null);
  };

  const sourceText = useLocationLabel();

  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }];

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <Call1669Button label="home.call1669" />

      <View style={card}>
        <Text style={[styles.cardTitle, { color: colors.textMuted }]}>{t('home.locationTitle')}</Text>
        <Text style={[styles.place, { color: colors.text }]}>{sourceText}</Text>
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

        <View style={styles.row}>
          <Pressable
            onPress={locateMe}
            disabled={locating}
            accessibilityRole="button"
            style={({ pressed }) => [styles.secondary, { borderColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}>
            {locating ? <ActivityIndicator color={colors.primary} /> : null}
            <Text style={[styles.secondaryText, { color: colors.primary }]}>
              {t(locating ? 'home.locating' : 'home.useMyLocation')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setPicking((p) => !p)}
            accessibilityRole="button"
            accessibilityState={{ selected: picking }}
            style={({ pressed }) => [
              styles.secondary,
              { borderColor: colors.primary, backgroundColor: picking ? colors.primary : 'transparent', opacity: pressed ? 0.7 : 1 },
            ]}>
            <Text style={[styles.secondaryText, { color: picking ? colors.onPrimary : colors.primary }]}>
              {t(picking ? 'home.cancelPick' : 'home.pickOnMap')}
            </Text>
          </Pressable>
        </View>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('home.searchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={t('home.searchPlaceholder')}
          returnKeyType="search"
          autoCorrect={false}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
        />
        {results && (
          <View style={[styles.results, { borderColor: colors.border }]}>
            {results.length === 0 ? (
              <Text style={[styles.body, styles.resultRow, { color: colors.textMuted }]}>{t('home.noResults')}</Text>
            ) : (
              results.map((place) => (
                <Pressable
                  key={place.id}
                  onPress={() => choosePlace(place)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.resultRow, { opacity: pressed ? 0.6 : 1, borderBottomColor: colors.border }]}>
                  <Text style={[styles.body, { color: colors.text }]}>{tr(place.name)}</Text>
                </Pressable>
              ))
            )}
          </View>
        )}
      </View>

      <MapView
        height={300}
        user={location.point}
        pickMode={picking}
        onPick={(point) => {
          setLocation({ point, source: 'pick' });
          setPicking(false);
          setNotice(null);
        }}
        pins={hospitals.map((h) => ({ id: h.id, point: h, label: tr(h.name), tone: 'muted' }))}
      />

      <Pressable
        onPress={() => router.push('/care')}
        accessibilityRole="button"
        accessibilityHint={t('home.findCareHint')}
        style={({ pressed }) => [styles.action, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}>
        <Text style={[styles.actionTitle, { color: colors.onPrimary }]}>{t('home.findCare')}</Text>
        <Text style={[styles.actionHint, { color: colors.onPrimary }]}>{t('home.findCareHint')}</Text>
      </Pressable>
      <Pressable
        onPress={() => router.push('/specialists')}
        accessibilityRole="button"
        accessibilityHint={t('home.findSpecialistHint')}
        style={({ pressed }) => [styles.action, { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 }]}>
        <Text style={[styles.actionTitle, { color: colors.onAccent }]}>{t('home.findSpecialist')}</Text>
        <Text style={[styles.actionHint, { color: colors.onAccent }]}>{t('home.findSpecialistHint')}</Text>
      </Pressable>

      <Text style={[styles.disclaimer, { color: colors.textMuted }]}>{t('common.disclaimer')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md },
  card: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  cardTitle: { fontFamily: fonts.medium, fontSize: 13 },
  place: { fontFamily: fonts.semiBold, fontSize: 18, lineHeight: 26 },
  notice: { gap: spacing.xs },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  link: { fontFamily: fonts.semiBold, fontSize: 15, lineHeight: 22 },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  secondary: {
    flexGrow: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: minTouch,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  secondaryText: { fontFamily: fonts.semiBold, fontSize: 15 },
  input: {
    minHeight: minTouch,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.regular,
    fontSize: 16,
  },
  results: { borderWidth: 1, borderRadius: radius.sm, overflow: 'hidden' },
  resultRow: {
    minHeight: minTouch,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  action: { borderRadius: radius.md, padding: spacing.md, minHeight: minTouch + 20, justifyContent: 'center' },
  actionTitle: { fontFamily: fonts.bold, fontSize: 18 },
  actionHint: { fontFamily: fonts.regular, fontSize: 14, marginTop: 2 },
  disclaimer: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, textAlign: 'center' },
});
