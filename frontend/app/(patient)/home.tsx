/**
 * Medora home: where you are, a way to find care, and Call 1669 always one tap away.
 * Requirements: 3.1 to 3.6
 */
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { searchPlaces } from '@medora/shared/logic/places';
import { LanguageToggle } from '../../src/components/LanguageToggle';
import { call1669 } from '../../src/services/emergency';
import { choosePlace, locateMe, useChosenLocation, type GpsOutcome } from '../../src/services/location';
import { pick } from '../../src/i18n/t';
import { useApp, useT } from '../../src/state/AppProvider';
import { Button } from '../../src/ui/Button';
import { Field } from '../../src/ui/Field';
import { fonts, fontSizes, radii, spacing, useTheme } from '../../src/ui/theme';

export default function PatientHomeScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const { lang, signOut } = useApp();
  const location = useChosenLocation();
  const [query, setQuery] = React.useState('');
  const [locating, setLocating] = React.useState(false);
  const [notice, setNotice] = React.useState<GpsOutcome | null>(null);
  const matches = React.useMemo(() => searchPlaces(query), [query]);

  const onUseMyLocation = async (): Promise<void> => {
    setLocating(true);
    setNotice(await locateMe());
    setLocating(false);
    setQuery('');
  };

  const noticeText =
    notice === 'outsideBangkok'
      ? t('patient.home.outsideBangkok')
      : notice === 'denied' || notice === 'unavailable'
        ? t('patient.home.locationUnavailable')
        : null;

  const where =
    location.source === 'gps'
      ? t('patient.home.locationGps')
      : t('patient.home.locationPlace', { place: location.place ? pick(location.place.name, lang) : '' });

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.column}>
        <View style={styles.header}>
          <Text style={[styles.brand, { color: theme.primary }]}>{t('patient.home.title')}</Text>
          <LanguageToggle />
        </View>

        <Pressable
          onPress={() => void call1669()}
          accessibilityRole="button"
          accessibilityLabel={t('patient.home.call1669')}
          style={[styles.emergency, { backgroundColor: theme.emergency }]}
        >
          <Text style={[styles.emergencyText, { color: theme.onEmergency }]}>{t('patient.home.call1669')}</Text>
          <Text style={[styles.emergencyHint, { color: theme.onEmergency }]}>{t('patient.home.emergencyHint')}</Text>
        </Pressable>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{t('patient.home.whereTitle')}</Text>
          <Text accessibilityLiveRegion="polite" style={[styles.where, { color: theme.textMuted }]}>
            {where}
          </Text>
          <Button label={t('patient.home.useMyLocation')} variant="secondary" busy={locating} onPress={() => void onUseMyLocation()} />
          {noticeText ? (
            <Text accessibilityLiveRegion="polite" style={[styles.notice, { color: theme.warning }]}>
              {noticeText}
            </Text>
          ) : null}
          <Field
            label={t('patient.home.searchLabel')}
            value={query}
            onChangeText={setQuery}
            hint={t('patient.home.searchPlaceholder')}
            autoCorrect={false}
            returnKeyType="search"
          />
          {matches.map((place) => (
            <Pressable
              key={place.key}
              accessibilityRole="button"
              onPress={() => {
                choosePlace(place);
                setNotice(null);
                setQuery('');
              }}
              style={[styles.result, { borderColor: theme.border }]}
            >
              <Text style={[styles.resultText, { color: theme.text }]}>{pick(place.name, lang)}</Text>
            </Pressable>
          ))}
          {query.trim() && matches.length === 0 ? (
            <Text style={[styles.notice, { color: theme.textMuted }]}>{t('patient.home.noPlaces')}</Text>
          ) : null}
        </View>

        <Button label={t('patient.home.findCare')} onPress={() => router.push('/(patient)/care' as Href)} />
        <Button label={t('patient.home.findSpecialist')} variant="secondary" onPress={() => router.push('/(patient)/specialists' as Href)} />
        <Button label={t('patient.home.myRequests')} variant="secondary" onPress={() => router.push('/(patient)/requests' as Href)} />

        <Text style={[styles.disclaimer, { color: theme.textMuted }]}>{t('patient.care.disclaimer')}</Text>
        <Button variant="link" label={t('common.signOut')} onPress={() => void signOut()} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, alignItems: 'center', padding: spacing.lg, paddingTop: spacing.xl * 1.5 },
  column: { width: '100%', maxWidth: 480, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontSize: fontSizes.xxl, fontFamily: fonts.bold },
  emergency: { minHeight: 72, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center', padding: spacing.md },
  emergencyText: { fontSize: fontSizes.xl, fontFamily: fonts.bold },
  emergencyHint: { fontSize: fontSizes.sm, fontFamily: fonts.regular },
  card: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  cardTitle: { fontSize: fontSizes.lg, fontFamily: fonts.semibold },
  where: { fontSize: fontSizes.sm, fontFamily: fonts.regular },
  notice: { fontSize: fontSizes.sm, fontFamily: fonts.medium },
  result: { minHeight: 44, borderBottomWidth: 1, justifyContent: 'center' },
  resultText: { fontSize: fontSizes.md, fontFamily: fonts.regular },
  disclaimer: { fontSize: fontSizes.xs, fontFamily: fonts.regular, textAlign: 'center' },
});
