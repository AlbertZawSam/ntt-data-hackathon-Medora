import { useRouter } from 'expo-router';
import React from 'react';
import type { StringKey } from '../src/i18n/t';
import { staffPoolConfigured } from '../src/services/amplify';
import { AuthError, confirmTotp, finishPasswordReset, requestPasswordReset, setNewPassword, signIn, totpSetupDetails, type PoolKind, type SignInNext } from '../src/services/auth';
import { useApp, useT } from '../src/state/AppProvider';
import { Button } from '../src/ui/Button';
import { Field } from '../src/ui/Field';
import { FormScreen } from '../src/ui/FormScreen';
import { fonts, fontSizes, useTheme } from '../src/ui/theme';
import { Text } from 'react-native';

/**
 * Email and password sign-in. Invited hospital staff switch to "Hospital staff sign-in", set their
 * password on first use, then set up and use an authenticator app (no SMS). Requirements: 1.2, 1.5, 1.6, 18.3
 */
export default function SignInScreen(): React.JSX.Element {
  const t = useT();
  const router = useRouter();
  const { refreshSession } = useApp();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [newPassword, setNewPasswordValue] = React.useState('');
  const theme = useTheme();
  const [pool, setPool] = React.useState<PoolKind>('public');
  const [code, setCode] = React.useState('');
  const [step, setStep] = React.useState<'credentials' | 'newPassword' | 'totpSetup' | 'totpCode' | 'forgot' | 'forgotCode'>('credentials');
  const [info, setInfo] = React.useState<StringKey | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<StringKey | null>(null);

  // The auth gate in app/_layout.tsx routes by role once the session is set.
  const handle = async (next: SignInNext): Promise<void> => {
    if (next === 'done') await refreshSession();
    else if (next === 'newPassword') setStep('newPassword');
    else if (next === 'totpSetup' || next === 'totpCode') {
      setPassword(''); // not needed again; don't keep it in memory during the code step
      setCode('');
      setStep(next);
    }
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
    else void run(() => signIn(email, password, pool));
  };

  const message = errorKey ? { text: t(errorKey), tone: 'error' as const } : info ? { text: t(info), tone: 'info' as const } : null;

  const leaveForgot = (): void => {
    setErrorKey(null);
    setCode('');
    setNewPasswordValue('');
    setStep('credentials');
  };

  if (step === 'forgot' || step === 'forgotCode') {
    const sending = step === 'forgot';
    return (
      <FormScreen title={t('forgot.title')} subtitle={t(sending ? 'forgot.hint' : 'forgot.codeHint')} message={message}>
        <Field
          label={t('signIn.emailPlaceholder')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="username"
          maxLength={254}
          editable={sending}
        />
        {sending ? (
          <Button
            label={t('forgot.sendCode')}
            busy={busy}
            onPress={() => {
              if (!email.trim()) return setErrorKey('auth.error.missingFields');
              setInfo(null);
              void (async () => {
                setErrorKey(null);
                setBusy(true);
                try {
                  await requestPasswordReset(email, pool);
                  setStep('forgotCode');
                } catch (err) {
                  setErrorKey(err instanceof AuthError ? err.messageKey : 'auth.error.generic');
                } finally {
                  setBusy(false);
                }
              })();
            }}
          />
        ) : (
          <>
            <Field label={t('forgot.codePlaceholder')} value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={10} />
            <Field
              label={t('forgot.newPassword')}
              hint={t('signUp.passwordHint')}
              value={newPassword}
              onChangeText={setNewPasswordValue}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              maxLength={128}
            />
            <Button
              label={t('forgot.submit')}
              busy={busy}
              onPress={() => {
                if (!code.trim() || !newPassword) return setErrorKey('auth.error.missingFields');
                void (async () => {
                  setErrorKey(null);
                  setBusy(true);
                  try {
                    await finishPasswordReset(email, code, newPassword, pool);
                    setCode('');
                    setNewPasswordValue('');
                    setInfo('forgot.done');
                    setStep('credentials');
                  } catch (err) {
                    setErrorKey(err instanceof AuthError ? err.messageKey : 'auth.error.generic');
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            />
          </>
        )}
        <Button variant="link" label={t('forgot.back')} onPress={leaveForgot} />
      </FormScreen>
    );
  }

  if (step === 'totpSetup' || step === 'totpCode') {
    const setup = step === 'totpSetup' ? totpSetupDetails() : null;
    return (
      <FormScreen
        title={t(step === 'totpSetup' ? 'signIn.totpSetupTitle' : 'signIn.totpCodeTitle')}
        subtitle={t(step === 'totpSetup' ? 'signIn.totpSetupHint' : 'signIn.totpCodeHint')}
        message={message}
      >
        {setup ? (
          <>
            <Text style={{ color: theme.textMuted, fontFamily: fonts.medium, fontSize: fontSizes.sm }}>{t('signIn.totpSecretLabel')}</Text>
            <Text selectable style={{ color: theme.text, fontFamily: fonts.semibold, fontSize: fontSizes.lg }}>
              {setup.sharedSecret}
            </Text>
          </>
        ) : null}
        <Field
          label={t('signIn.totpCodePlaceholder')}
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={7}
          onSubmitEditing={() => void run(() => confirmTotp(code))}
        />
        <Button label={t('signIn.totpButton')} busy={busy} onPress={() => void run(() => confirmTotp(code))} />
      </FormScreen>
    );
  }

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
    <FormScreen title={t(pool === 'staff' ? 'signIn.staffTitle' : 'signIn.title')} message={message}>
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
      <Button variant="link" label={t('signIn.forgot')} onPress={() => { setErrorKey(null); setInfo(null); setStep('forgot'); }} />
      {pool === 'public' ? (
        <Button variant="link" label={t('signIn.noAccount')} onPress={() => router.push('/sign-up')} />
      ) : null}
      {staffPoolConfigured ? (
        <Button
          variant="link"
          label={t(pool === 'staff' ? 'signIn.patientLink' : 'signIn.staffLink')}
          onPress={() => {
            setErrorKey(null);
            setPool(pool === 'staff' ? 'public' : 'staff');
          }}
        />
      ) : null}
    </FormScreen>
  );
}
