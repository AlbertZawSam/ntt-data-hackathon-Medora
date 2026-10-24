import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StringKey } from '../src/i18n/t';
/** Public sign-up creates patients only; hospital accounts come from an invitation. */
const SIGN_UP_ROLE = 'patient' as const;
import { AuthError, confirmCode, resendCode, signIn, signUp } from '../src/services/auth';
import { useApp, useT } from '../src/state/AppProvider';
import { Button } from '../src/ui/Button';
import { Field } from '../src/ui/Field';
import { FormScreen } from '../src/ui/FormScreen';
import { fonts, fontSizes, radii, spacing, useTheme } from '../src/ui/theme';

/**
 * Patient sign-up with an email verification code.
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
      await signUp(email, password, SIGN_UP_ROLE);
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
      <Text style={[styles.roleHint, { color: theme.textMuted }]}>{t('signUp.staffNote')}</Text>
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
      {/* Doctors and hospital staff don't sign up: their hospital gives them an account with an authenticator code. */}
      <Button variant="link" label={t('signIn.staffLink')} onPress={() => router.replace({ pathname: '/sign-in', params: { staff: '1' } })} />
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
