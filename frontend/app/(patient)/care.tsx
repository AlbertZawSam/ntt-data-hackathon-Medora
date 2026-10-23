/**
 * Find care: the description is checked against the fixed red-flag rules on the phone first (works
 * offline); then the backend checks again and sorts it into a type of care (Nova Lite, or keyword
 * rules when the model or network is unavailable). Hospitals that can help now are ranked on the
 * phone from the live public directory, with simple labels and the closer hospitals that were
 * skipped and why. Requirements: 4.1 to 4.5, 5.1 to 5.3, 5.5 to 5.7
 */
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { rankPublic, skippedCloser, entryAgeMin, type PublicRanked } from '@medora/shared/logic/publicDirectory';
import { understandByRules, type UnderstandResult } from '@medora/shared/logic/understand';
import type { StringKey } from '../../src/i18n/t';
import { pick } from '../../src/i18n/t';
import { understandNeed } from '../../src/services/data';
import { call1669, checkEmergency, logEmergencyCheck } from '../../src/services/emergency';
import { useChosenLocation } from '../../src/services/location';
import { useApp, useT } from '../../src/state/AppProvider';
import { Button } from '../../src/ui/Button';
import { Field } from '../../src/ui/Field';
import { FormScreen } from '../../src/ui/FormScreen';
import { fonts, fontSizes, radii, spacing, useTheme } from '../../src/ui/theme';

type Found = Extract<UnderstandResult, { emergency: false }>;

export default function PatientCareScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const { session, lang, data } = useApp();
  const location = useChosenLocation();
  const [text, setText] = React.useState('');
  const [checking, setChecking] = React.useState(false);
  const [found, setFound] = React.useState<Found | null>(null);
  const [now, setNow] = React.useState(Date.now());

  // Freshness labels and "may be outdated" move on while the screen is open.
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const toEmergency = (flag: string): void => {
    setFound(null);
    router.push({ pathname: '/(patient)/emergency', params: { flag } } as unknown as Href);
  };

  const onSubmit = async (): Promise<void> => {
    const description = text.trim();
    if (!description || checking) return;
    // Layer 1: fixed rules on the phone, before anything is sent.
    const match = checkEmergency(description);
    void logEmergencyCheck(session, match);
    if (match) {
      toEmergency(match.key);
      return;
    }
    setChecking(true);
    // Layer 2 and the type of care on the backend; keyword rules on the phone if it can't be reached.
    const result = (await understandNeed(description, lang)) ?? understandByRules(description);
    setChecking(false);
    if (result.emergency) {
      toEmergency(result.flag);
      return;
    }
    setNow(Date.now());
    setFound(result);
  };

  const ranked = React.useMemo(
    () => (found ? rankPublic(data.publicDirectory, found.need, location, now) : []),
    [found, data.publicDirectory, location, now],
  );
  const canHelp = ranked.filter((r) => r.eligible);
  const skipped = skippedCloser(ranked);

  return (
    <FormScreen title={t('patient.care.title')}>
      <Field
        label={t('patient.care.descriptionLabel')}
        value={text}
        onChangeText={(value) => {
          setText(value);
          setFound(null);
        }}
        hint={t('patient.care.descriptionPlaceholder')}
        multiline
        numberOfLines={5}
        maxLength={1000}
        textAlignVertical="top"
        inputStyle={styles.multiline}
      />
      <Button
        label={checking ? t('patient.care.checking') : t('patient.care.submitButton')}
        busy={checking}
        disabled={!text.trim()}
        onPress={() => void onSubmit()}
      />

      {found ? (
        <View style={styles.results} accessibilityLiveRegion="polite">
          <Text style={[styles.need, { color: theme.text }]}>{t('patient.care.lookingFor', { need: t(`need.${found.need}` as StringKey) })}</Text>
          {found.summary ? <Text style={[styles.small, { color: theme.textMuted }]}>{t('patient.care.youSaid', { summary: pick(found.summary, lang) })}</Text> : null}
          <Text style={[styles.small, { color: theme.textMuted }]}>{found.source === 'ai' ? t('patient.care.byAi') : t('patient.care.aiUnavailable')}</Text>
          <Text style={[styles.small, { color: theme.textMuted }]}>{t('patient.care.noRedFlag')}</Text>

          {!data.isSynced && data.publicDirectory.length === 0 ? (
            <Text style={[styles.small, { color: theme.textMuted }]}>{t('patient.care.loading')}</Text>
          ) : canHelp.length === 0 ? (
            <View style={[styles.card, { borderColor: theme.emergency, backgroundColor: theme.surface }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>{t('patient.care.noHospitals')}</Text>
              <Button label={t('emergency.call1669')} onPress={() => void call1669()} />
            </View>
          ) : (
            <>
              <Text style={[styles.section, { color: theme.text }]}>{t('patient.care.canHelp')}</Text>
              {canHelp.map((r, i) => (
                <HospitalCard key={r.entry.hospitalId} ranked={r} best={i === 0} now={now} />
              ))}
            </>
          )}

          {skipped.length > 0 ? (
            <>
              <Text style={[styles.section, { color: theme.text }]}>{t('patient.care.skippedTitle')}</Text>
              {skipped.map((r) => (
                <View key={r.entry.hospitalId} style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                  <Text style={[styles.cardTitle, styles.struck, { color: theme.textMuted }]}>{pick(r.entry.name, lang)}</Text>
                  <Text style={[styles.small, { color: theme.textMuted }]}>{t('patient.care.drive', { min: Math.round(r.driveMin), km: r.distanceKm.toFixed(1) })}</Text>
                  <Text style={[styles.small, { color: theme.warning }]}>
                    {t('patient.care.skippedBecause', { reason: t(`skip.${r.need.reason ?? 'notNow'}` as StringKey) })}
                  </Text>
                </View>
              ))}
            </>
          ) : null}

          <Button variant="secondary" label={t('patient.care.newSearch')} onPress={() => { setFound(null); setText(''); }} />
        </View>
      ) : null}

      <Text style={[styles.disclaimer, { color: theme.textMuted }]}>{t('patient.care.disclaimer')}</Text>
      <Button variant="link" label={t('common.back')} onPress={() => router.replace('/(patient)/home' as Href)} />
    </FormScreen>
  );
}

function HospitalCard({ ranked, best, now }: { ranked: PublicRanked; best: boolean; now: number }): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const { lang } = useApp();
  const { entry, need } = ranked;
  const age = entryAgeMin(entry, now);
  const fresh = !Number.isFinite(age) ? t('fresh.never') : ranked.stale ? t('fresh.outdated') : t('fresh.updatedAgo', { min: Math.floor(age) });
  const labelColor = need.label === 'available' ? theme.success : theme.warning;
  return (
    <View style={[styles.card, { borderColor: best ? theme.primary : theme.border, backgroundColor: theme.surface }]}>
      {best ? <Text style={[styles.badge, { color: theme.primary }]}>{t('patient.care.bestMatch')}</Text> : null}
      <Text style={[styles.cardTitle, { color: theme.text }]}>{pick(entry.name, lang)}</Text>
      <View style={styles.row}>
        <Text style={[styles.label, { color: labelColor, borderColor: labelColor }]}>{t(`label.${need.label}` as StringKey)}</Text>
        <Text style={[styles.small, { color: ranked.stale ? theme.warning : theme.textMuted }]}>{fresh}</Text>
      </View>
      <Text style={[styles.small, { color: theme.textMuted }]}>{t('patient.care.drive', { min: Math.round(ranked.driveMin), km: ranked.distanceKm.toFixed(1) })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  multiline: { minHeight: 120, paddingTop: 12 },
  results: { gap: spacing.sm },
  need: { fontSize: fontSizes.lg, fontFamily: fonts.semibold },
  section: { fontSize: fontSizes.md, fontFamily: fonts.semibold, marginTop: spacing.sm },
  small: { fontSize: fontSizes.sm, fontFamily: fonts.regular },
  card: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, gap: spacing.xs },
  cardTitle: { fontSize: fontSizes.md, fontFamily: fonts.semibold },
  struck: { textDecorationLine: 'line-through' },
  badge: { fontSize: fontSizes.xs, fontFamily: fonts.bold, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  label: { fontSize: fontSizes.xs, fontFamily: fonts.semibold, borderWidth: 1, borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  disclaimer: { fontSize: fontSizes.xs, fontFamily: fonts.regular, textAlign: 'center' },
});
