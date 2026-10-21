/**
 * Find care: the description is checked against the fixed red-flag rules on the phone first.
 * A match goes straight to the emergency screen. Hospital matching follows in the next slice.
 * Requirements: 4.1 to 4.4, 5.7
 */
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { checkEmergency, logEmergencyCheck } from '../../src/services/emergency';
import { useApp, useT } from '../../src/state/AppProvider';
import { Button } from '../../src/ui/Button';
import { Field } from '../../src/ui/Field';
import { FormScreen } from '../../src/ui/FormScreen';
import { fonts, fontSizes, useTheme } from '../../src/ui/theme';

export default function PatientCareScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const { session } = useApp();
  const [text, setText] = React.useState('');
  const [cleared, setCleared] = React.useState(false);

  const onSubmit = (): void => {
    if (!text.trim()) return;
    const match = checkEmergency(text);
    void logEmergencyCheck(session, match);
    if (match) {
      setCleared(false);
      router.push({ pathname: '/(patient)/emergency', params: { flag: match.key } } as unknown as Href);
      return;
    }
    setCleared(true);
  };

  return (
    <FormScreen title={t('patient.care.title')} message={cleared ? { text: t('patient.care.noRedFlag'), tone: 'info' } : null}>
      <Field
        label={t('patient.care.descriptionLabel')}
        value={text}
        onChangeText={(value) => {
          setText(value);
          setCleared(false);
        }}
        hint={t('patient.care.descriptionPlaceholder')}
        multiline
        numberOfLines={5}
        textAlignVertical="top"
        inputStyle={styles.multiline}
      />
      <Button label={t('patient.care.submitButton')} disabled={!text.trim()} onPress={onSubmit} />
      <Text style={[styles.disclaimer, { color: theme.textMuted }]}>{t('patient.care.disclaimer')}</Text>
      <Button variant="link" label={t('common.back')} onPress={() => router.replace('/(patient)/home' as Href)} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  multiline: { minHeight: 120, paddingTop: 12 },
  disclaimer: { fontSize: fontSizes.xs, fontFamily: fonts.regular, textAlign: 'center' },
});
