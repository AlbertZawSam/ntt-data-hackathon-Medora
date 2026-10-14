import { useRouter } from 'expo-router';
import React from 'react';
import type { StringKey } from '../src/i18n/t';
import { AuthError, setNewPassword, signIn, type SignInNext } from '../src/services/auth';
import { useApp, useT } from '../src/state/AppProvider';
import { Button } from '../src/ui/Button';
import { Field } from '../src/ui/Field';
import { FormScreen } from '../src/ui/FormScreen';

/** Email and password sign-in; invited staff set their password here on first sign-in. Requirements: 1.2, 1.6, 18.3 */
export default function SignInScreen(): React.JSX.Element {
  const t = useT();
  const router = useRouter();
  const { refreshSession } = useApp();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [newPassword, setNewPasswordValue] = React.useState('');
  const [step, setStep] = React.useState<'credentials' | 'newPassword'>('credentials');
  const [busy, setBusy] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<StringKey | null>(null);

  // The auth gate in app/_layout.tsx routes by role once the session is set.
  const handle = async (next: SignInNext): Promise<void> => {
    if (next === 'done') await refreshSession();
    else if (next === 'newPassword') setStep('newPassword');
    else router.push({ pathname: '/sign-up', params: { email, verify: '1' } });
  };

  const run = async (action: () => Promise<SignInNext>): Promise<void> => {
    setErrorKey(null);
    setBusy(true);
    try {
      await handle(await action());
    } catch (err) {
      setErrorKey(err instanceof AuthError ? err.messageKey : 'signIn.errorGeneric');
    } finally {
      setBusy(false);
    }
  };

  const submit = (): void => {
    if (!email.trim() || !password) setErrorKey('auth.error.missingFields');
    else void run(() => signIn(email, password));
  };

  const message = errorKey ? { text: t(errorKey), tone: 'error' as const } : null;

  if (step === 'newPassword') {
    return (
      <FormScreen title={t('signIn.newPasswordTitle')} subtitle={t('signIn.newPasswordHint')} message={message}>
        <Field
          label={t('signIn.passwordPlaceholder')}
          hint={t('signUp.passwordHint')}
          value={newPassword}
          onChangeText={setNewPasswordValue}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          maxLength={128}
        />
        <Button label={t('signIn.newPasswordButton')} busy={busy} onPress={() => void run(() => setNewPassword(newPassword))} />
      </FormScreen>
    );
  }

  return (
    <FormScreen title={t('signIn.title')} message={message}>
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
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        maxLength={128}
        onSubmitEditing={submit}
      />
      <Button label={t('signIn.submitButton')} busy={busy} onPress={submit} />
      <Button variant="link" label={t('signIn.noAccount')} onPress={() => router.push('/sign-up')} />
    </FormScreen>
  );
}
