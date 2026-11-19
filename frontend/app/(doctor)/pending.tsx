import React from 'react';
import { useApp, useT } from '../../src/state/AppProvider';
import { Button } from '../../src/ui/Button';
import { FormScreen } from '../../src/ui/FormScreen';
import { Notice } from '../../src/ui/Notice';

/**
 * Doctors wait here until an admin of their hospital approves them: what is happening, what to do, and a way to
 * check again or sign out. It has no tab bar, so it uses the same centred card as sign-in. Requirements: 18.6
 */
export default function DoctorPendingScreen(): React.JSX.Element {
  const t = useT();
  const { refreshSession, signOut } = useApp();
  const [busy, setBusy] = React.useState(false);
  return (
    <FormScreen title={t('doctor.pending.title')}>
      <Notice tone="info">{t('doctor.pending.message')}</Notice>
      <Button
        icon="refresh"
        label={t('doctor.pending.checkAgain')}
        busy={busy}
        onPress={() => {
          setBusy(true);
          // A fresh token picks up approval; the auth gate then opens the doctor screens.
          void refreshSession(true).finally(() => setBusy(false));
        }}
      />
      <Button variant="link" label={t('common.signOut')} onPress={() => void signOut()} />
    </FormScreen>
  );
}
