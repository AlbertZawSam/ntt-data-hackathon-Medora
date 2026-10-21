/**
 * Hospital Setup: a new admin registers their hospital once. The backend creates the profile and
 * ties the admin to it; the app then refreshes the session and the auth gate moves them on.
 * Requirements: 1.3, 1.5
 */
import React from 'react';
import { validateHospitalInput, type HospitalInputIssue } from '@medora/shared/logic/hospital';
import { DEFAULT_PLACE, PLACES, type Place } from '@medora/shared/logic/places';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { pick, type StringKey } from '../../src/i18n/t';
import { registerHospital } from '../../src/services/data';
import { useApp, useT } from '../../src/state/AppProvider';
import { Button } from '../../src/ui/Button';
import { Field } from '../../src/ui/Field';
import { FormScreen } from '../../src/ui/FormScreen';
import { fonts, fontSizes, radii, spacing, useTheme } from '../../src/ui/theme';

const ISSUE_KEYS: Record<HospitalInputIssue, StringKey> = {
  name: 'admin.hospitalSetup.error.name',
  location: 'admin.hospitalSetup.error.location',
  beds: 'admin.hospitalSetup.error.beds',
  nicu: 'admin.hospitalSetup.error.nicu',
};

/** Accepts only digits (and one dot for coordinates); anything else is ignored as it is typed. */
const numeric = (value: string, decimal: boolean): string => value.replace(decimal ? /[^0-9.]/g : /[^0-9]/g, '');

export default function AdminHospitalSetupScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const { lang, refreshSession, signOut } = useApp();
  const [nameEn, setNameEn] = React.useState('');
  const [nameTh, setNameTh] = React.useState('');
  const [lat, setLat] = React.useState(String(DEFAULT_PLACE.lat));
  const [lng, setLng] = React.useState(String(DEFAULT_PLACE.lng));
  const [beds, setBeds] = React.useState('');
  const [nicu, setNicu] = React.useState('0');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<StringKey | null>(null);

  const pickPlace = (place: Place): void => {
    setLat(String(place.lat));
    setLng(String(place.lng));
  };

  const onSubmit = async (): Promise<void> => {
    const checked = validateHospitalInput({
      nameEn,
      nameTh,
      lat: lat.trim() === '' ? NaN : Number(lat),
      lng: lng.trim() === '' ? NaN : Number(lng),
      totalBeds: beds.trim() === '' ? NaN : Number(beds),
      nicuTotal: nicu.trim() === '' ? NaN : Number(nicu),
    });
    if (!checked.ok) {
      setError(ISSUE_KEYS[checked.issue]);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await registerHospital(checked.value);
      // The new hospital is in a fresh token; once the session has it, the auth gate leaves this screen.
      await refreshSession(true);
    } catch {
      setError('admin.hospitalSetup.error.generic');
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormScreen
      title={t('admin.hospitalSetup.title')}
      subtitle={t('admin.hospitalSetup.intro')}
      message={error ? { text: t(error), tone: 'error' } : null}
    >
      <Field label={t('admin.hospitalSetup.nameEnLabel')} value={nameEn} onChangeText={setNameEn} autoCapitalize="words" />
      <Field label={t('admin.hospitalSetup.nameThLabel')} value={nameTh} onChangeText={setNameTh} />

      <View style={styles.places}>
        <Text style={[styles.placesLabel, { color: theme.text }]}>{t('admin.hospitalSetup.nearLabel')}</Text>
        <View style={styles.chips}>
          {PLACES.map((place) => (
            <Pressable
              key={place.key}
              accessibilityRole="button"
              onPress={() => pickPlace(place)}
              style={[styles.chip, { borderColor: theme.border, backgroundColor: theme.surface }]}
            >
              <Text style={[styles.chipText, { color: theme.text }]}>{pick(place.name, lang)}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Field label={t('admin.hospitalSetup.latLabel')} value={lat} onChangeText={(v) => setLat(numeric(v, true))} keyboardType="decimal-pad" />
      <Field label={t('admin.hospitalSetup.lngLabel')} value={lng} onChangeText={(v) => setLng(numeric(v, true))} keyboardType="decimal-pad" />
      <Field label={t('admin.hospitalSetup.bedsLabel')} value={beds} onChangeText={(v) => setBeds(numeric(v, false))} keyboardType="number-pad" />
      <Field label={t('admin.hospitalSetup.nicuLabel')} value={nicu} onChangeText={(v) => setNicu(numeric(v, false))} keyboardType="number-pad" />

      <Button label={t('admin.hospitalSetup.submitButton')} busy={busy} onPress={() => void onSubmit()} />
      <Button variant="link" label={t('common.signOut')} onPress={() => void signOut()} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  places: { gap: spacing.xs },
  placesLabel: { fontSize: fontSizes.sm, fontFamily: fonts.medium },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderRadius: radii.lg, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  chipText: { fontSize: fontSizes.xs, fontFamily: fonts.regular },
});
