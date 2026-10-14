import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { ScreenStub } from '../../src/components/ScreenStub';
import { useApp, useT } from '../../src/state/AppProvider';
import { Button } from '../../src/ui/Button';
import { fonts, fontSizes, useTheme } from '../../src/ui/theme';

/** Doctors wait here until an admin of their hospital approves them. Requirements: 18.6 */
export default function DoctorPendingScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const { refreshSession } = useApp();
  const [busy, setBusy] = React.useState(false);
  return (
    <ScreenStub titleKey="doctor.pending.title">
      <Text style={[styles.message, { color: theme.textMuted }]}>{t('doctor.pending.message')}</Text>
      <Button
        variant="secondary"
        label={t('doctor.pending.checkAgain')}
        busy={busy}
        onPress={() => {
          setBusy(true);
          // A fresh token picks up approval; the auth gate then opens the doctor screens.
          void refreshSession(true).finally(() => setBusy(false));
        }}
      />
    </ScreenStub>
  );
}

const styles = StyleSheet.create({
  message: { fontSize: fontSizes.md, fontFamily: fonts.regular, textAlign: 'center' },
});
