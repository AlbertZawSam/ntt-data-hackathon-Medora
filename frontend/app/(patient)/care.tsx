/**
 * Find care. Layer 1 of the emergency check runs here on the phone, before anything is sent; the
 * server runs layer 2, then the intake agent and the ranking engine, and returns hospitals as simple
 * labels only (never counts or equipment). Requirements: 4.1 to 4.4, 5.1 to 5.7, 6.1, 6.2
 */
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ARRIVAL_MODES, type ArrivalMode, type PublicHospital } from '@medora/shared/logic/care';
import type { NeedKey } from '@medora/shared/logic/types';
import { pick, type StringKey } from '../../src/i18n/t';
import { findCare, submitRequest } from '../../src/services/data';
import { checkEmergency, logEmergencyCheck } from '../../src/services/emergency';
import { useChosenLocation } from '../../src/services/location';
import { useApp, useT } from '../../src/state/AppProvider';
import { Button } from '../../src/ui/Button';
import { Field } from '../../src/ui/Field';
import { Screen } from '../../src/ui/Screen';
import { fonts, fontSizes, radii, spacing, useTheme } from '../../src/ui/theme';

type Phase = 'describe' | 'searching' | 'results';

const LABEL_KEY: Record<PublicHospital['label'], StringKey> = {
  available: 'availability.available',
  limited: 'availability.limited',
  notAvailable: 'availability.notAvailable',
  outdated: 'availability.outdated',
};

export default function PatientCareScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const { session, lang } = useApp();
  const location = useChosenLocation();
  const [text, setText] = React.useState('');
  const [phase, setPhase] = React.useState<Phase>('describe');
  const [error, setError] = React.useState<StringKey | null>(null);
  const [need, setNeed] = React.useState<NeedKey>('general');
  const [aiUsed, setAiUsed] = React.useState(true);
  const [hospitals, setHospitals] = React.useState<PublicHospital[]>([]);
  const [selected, setSelected] = React.useState<PublicHospital | null>(null);
  const [mode, setMode] = React.useState<ArrivalMode>('car');
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const emergency = (key: string): void => router.push({ pathname: '/(patient)/emergency', params: { flag: key } } as unknown as Href);

  const search = async (): Promise<void> => {
    if (!text.trim()) return;
    setError(null);
    const match = checkEmergency(text); // layer 1: on the phone, offline, before anything is sent
    void logEmergencyCheck(session, match);
    if (match) return emergency(match.key);
    setPhase('searching');
    try {
      const result = await findCare({ description: text.trim(), lat: location.lat, lng: location.lng });
      if ('emergency' in result) return emergency(result.emergency.key); // layer 2
      setNeed(result.need);
      setAiUsed(result.aiUsed);
      setHospitals(result.hospitals);
      setPhase('results');
    } catch {
      setError('patient.care.findError');
      setPhase('describe');
    }
  };

  const send = async (hospital: PublicHospital): Promise<void> => {
    setSending(true);
    setError(null);
    try {
      await submitRequest({
        hospitalId: hospital.id,
        needKey: need,
        etaMin: hospital.driveMin,
        mode,
        description: text.trim(),
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      });
      setSent(true);
      setSelected(null);
    } catch {
      setError('patient.care.requestError');
    } finally {
      setSending(false);
    }
  };

  const canHelp = hospitals.some((h) => h.label !== 'notAvailable');

  return (
    <Screen title={t('patient.care.title')}>
      {phase !== 'results' ? (
        <>
          <Field
            label={t('patient.care.descriptionLabel')}
            value={text}
            onChangeText={setText}
            hint={t('patient.care.descriptionPlaceholder')}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            inputStyle={styles.multiline}
            maxLength={1000}
          />
          {error ? <Text style={[styles.error, { color: theme.emergency }]}>{t(error)}</Text> : null}
          <Button label={phase === 'searching' ? t('patient.care.finding') : t('patient.care.submitButton')} busy={phase === 'searching'} disabled={!text.trim()} onPress={() => void search()} />
        </>
      ) : (
        <>
          {!aiUsed ? <Text style={[styles.note, { color: theme.warning }]}>{t('patient.care.aiUnavailable')}</Text> : null}
          {sent ? <Text accessibilityLiveRegion="polite" style={[styles.note, { color: theme.success }]}>{t('patient.care.requestSent')}</Text> : null}
          {error ? <Text style={[styles.error, { color: theme.emergency }]}>{t(error)}</Text> : null}
          <Text style={[styles.section, { color: theme.text }]}>{t('patient.care.nearbyTitle')}</Text>
          {!canHelp ? <Text style={[styles.note, { color: theme.emergency }]}>{t('patient.care.nobodyHelp')}</Text> : null}
          {hospitals.map((h) => (
            <View key={h.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.name, { color: theme.text }]}>{pick(h.name, lang)}</Text>
              <Text style={[styles.note, { color: theme.textMuted }]}>{t('patient.care.driveMin', { min: h.driveMin })}</Text>
              <Text style={[styles.label, { color: h.label === 'available' ? theme.success : h.label === 'notAvailable' ? theme.emergency : theme.warning }]}>
                {t(LABEL_KEY[h.label])}
              </Text>
              {h.label === 'notAvailable' ? (
                <Text style={[styles.note, { color: theme.textMuted }]}>{t('patient.care.skippedBecause', { reason: t('failure.simple') })}</Text>
              ) : (
                <Button label={t('patient.care.requestButton')} variant="secondary" onPress={() => { setSelected(h); setSent(false); }} />
              )}
              {selected?.id === h.id ? (
                <View style={styles.form}>
                  <Text style={[styles.section, { color: theme.text }]}>{t('patient.care.requestTitle', { hospital: pick(h.name, lang) })}</Text>
                  <Text style={[styles.note, { color: theme.textMuted }]}>{t('patient.care.arrivalMode')}</Text>
                  <View style={styles.modes}>
                    {ARRIVAL_MODES.map((m) => (
                      <Button key={m} label={t(`mode.${m}` as StringKey)} variant={mode === m ? 'primary' : 'secondary'} onPress={() => setMode(m)} />
                    ))}
                  </View>
                  <Field label={t('patient.care.namePlaceholder')} value={name} onChangeText={setName} maxLength={80} />
                  <Field label={t('patient.care.phonePlaceholder')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={20} />
                  <Button label={t('patient.care.sendRequest')} busy={sending} onPress={() => void send(h)} />
                </View>
              ) : null}
            </View>
          ))}
          <Button variant="secondary" label={t('patient.requests.title')} onPress={() => router.push('/(patient)/requests' as Href)} />
          <Button variant="link" label={t('common.back')} onPress={() => setPhase('describe')} />
        </>
      )}
      <Text style={[styles.disclaimer, { color: theme.textMuted }]}>{t('patient.care.disclaimer')}</Text>
      <Button variant="link" label={t('emergency.back')} onPress={() => router.replace('/(patient)/home' as Href)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  multiline: { minHeight: 120, paddingTop: 12 },
  card: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  name: { fontSize: fontSizes.lg, fontFamily: fonts.semibold },
  section: { fontSize: fontSizes.lg, fontFamily: fonts.semibold },
  label: { fontSize: fontSizes.md, fontFamily: fonts.semibold },
  note: { fontSize: fontSizes.sm, fontFamily: fonts.regular },
  error: { fontSize: fontSizes.sm, fontFamily: fonts.medium },
  form: { gap: spacing.sm, marginTop: spacing.sm },
  modes: { gap: spacing.xs },
  disclaimer: { fontSize: fontSizes.xs, fontFamily: fonts.regular, textAlign: 'center' },
});
