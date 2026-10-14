/**
 * Titled screen shell with the language toggle, used by screens not built yet.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StringKey } from '../i18n/t';
import { useApp, useT } from '../state/AppProvider';
import { Button } from '../ui/Button';
import { fonts, fontSizes, spacing, useTheme } from '../ui/theme';
import { LanguageToggle } from './LanguageToggle';

export function ScreenStub({ titleKey, children }: { titleKey: StringKey; children?: React.ReactNode }): React.JSX.Element {
  const t = useT();
  const { signOut } = useApp();
  const theme = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.toggle}>
        <LanguageToggle />
      </View>
      <Text style={[styles.title, { color: theme.text }]}>{t(titleKey)}</Text>
      {children}
      <Button variant="link" label={t('common.signOut')} onPress={() => void signOut()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.md, gap: spacing.md },
  toggle: { position: 'absolute', top: spacing.xl * 1.5, right: spacing.md },
  title: { fontSize: fontSizes.xxl, fontFamily: fonts.bold },
});
