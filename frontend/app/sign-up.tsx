import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StringKey } from '../src/i18n/t';
import { SIGN_UP_ROLES, type SignUpRole } from '@medora/shared/logic/session';
import { AuthError, confirmCode, resendCode, signIn, signUp } from '../src/services/auth';
import { useApp, useT } from '../src/state/AppProvider';
import { Button } from '../src/ui/Button';
import { Field } from '../src/ui/Field';
import { FormScreen } from '../src/ui/FormScreen';
import { fonts, fontSizes, radii, spacing, useTheme } from '../src/ui/theme';

/**
 * Sign-up with a role choice (patient, hospital admin, doctor) and an email verification code.
 * Staff accounts come only from an admin's invitation.
 * Requirements: 1.1, 1.6, 18.1, 18.6, 18.7
 */
export default function SignUpScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const { refreshSession } = useApp();
  // Sign-in sends unverified users here with their email to enter the code.
  const params = useLocalSearchParams<{ email?: string; verify?: string }>();
  const [email, setEmail] = React.useState(params.email ?? '');
  const [password, setPassword] = React.useState('');
  const [role, setRole] = React.useState<SignUpRole>('patient');
  const [code, setCode] = React.useState('');
  const [step, setStep] = React.useState<'details' | 'code'>(params.verify === '1' ? 'code' : 'details');
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ key: StringKey; tone: 'error' | 'info' } | null>(null);

  const run = async (action: () => Promise<void>): Promise<void> => {
    setMessage(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setMessage({ key: err instanceof AuthError ? err.messageKey : 'auth.error.generic', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const createAccount = (): void => {
    if (!email.trim() || !password) {
      setMessage({ key: 'auth.error.missingFields', tone: 'error' });
      return;
    }
    void run(async () => {
      await signUp(email, password, role);
      setStep('code');
    });
  };

  const verify = (): void => {
    void run(async () => {
      await confirmCode(email, code);
      if (password) {
        // Same visit: sign straight in; the auth gate routes by role.
        await signIn(email, password);
        await refreshSession();
      } else {
        router.replace('/sign-in');
      }
    });
  };

  const shown = message ? { text: t(message.key), tone: message.tone } : null;

  if (step === 'code') {
    return (
      <FormScreen title={t('signUp.codeTitle')} subtitle={t('signUp.codeHint', { email: email.trim() })} message={shown}>
        <Field
          label={t('signUp.codePlaceholder')}
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={8}
          onSubmitEditing={verify}
        />
        <Button label={t('signUp.confirm')} busy={busy} disabled={code.trim().length < 6} onPress={verify} />
        <Button
          variant="link"
          label={t('signUp.resend')}
          onPress={() =>
            void run(async () => {
              await resendCode(email);
              setMessage({ key: 'signUp.resent', tone: 'info' });
            })
          }
        />
      </FormScreen>
    );
  }

  return (
    <FormScreen title={t('signUp.title')} message={shown}>
      <View style={styles.roles} accessibilityRole="radiogroup" accessibilityLabel={t('signUp.roleLabel')}>
        <Text style={[styles.roleLabel, { color: theme.text }]}>{t('signUp.roleLabel')}</Text>
        {SIGN_UP_ROLES.map((r) => {
          const selected = r === role;
          return (
            <Pressable
              key={r}
              onPress={() => setRole(r)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[
                styles.role,
                { backgroundColor: theme.surface, borderColor: selected ? theme.primary : theme.border },
                selected && styles.roleSelected,
              ]}
            >
              <Text style={[styles.roleName, { color: theme.text }]}>{t(`signUp.role.${r}`)}</Text>
              <Text style={[styles.roleHint, { color: theme.textMuted }]}>{t(`signUp.roleHint.${r}`)}</Text>
            </Pressable>
          );
        })}
        <Text style={[styles.roleHint, { color: theme.textMuted }]}>{t('signUp.staffNote')}</Text>
      </View>
      <Field
        label={t('signIn.emailPlaceholder')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="username"
        maxLength={254}
      />
      <Field
        label={t('signIn.passwordPlaceholder')}
        hint={t('signUp.passwordHint')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        maxLength={128}
        onSubmitEditing={createAccount}
      />
      <Button label={t('signUp.submit')} busy={busy} onPress={createAccount} />
      <Button variant="link" label={t('signUp.haveAccount')} onPress={() => router.replace('/sign-in')} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  roles: { gap: spacing.sm },
  roleLabel: { fontSize: fontSizes.sm, fontFamily: fonts.medium },
  role: { borderWidth: 1, borderRadius: radii.md, padding: spacing.md, gap: 2 },
  roleSelected: { borderWidth: 2 },
  roleName: { fontSize: fontSizes.md, fontFamily: fonts.semibold },
  roleHint: { fontSize: fontSizes.xs, fontFamily: fonts.regular },
});
