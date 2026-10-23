import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { canOpen } from '@medora/shared/logic/session';
import { LanguageToggle } from '../components/LanguageToggle';
import { useApp, useT } from '../state/AppProvider';
import { Button } from './Button';
import { fonts, fontSizes, spacing, useTheme } from './theme';

/**
 * Scrollable screen with a title and the language toggle, in a readable column on wide screens.
 * Every screen that uses it ends with "Home" (for people seeking care) and "Sign out".
 */
export function Screen({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  const theme = useTheme();
  const t = useT();
  const router = useRouter();
  const { session, signOut } = useApp();
  const isPatient = session ? canOpen(session, 'patient') : false;
  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.column}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
            {title}
          </Text>
          <LanguageToggle />
        </View>
        {children}
        <View style={styles.footer}>
          {isPatient ? <Button variant="link" label={t('common.home')} onPress={() => router.replace('/(patient)/home' as Href)} /> : null}
          {session ? <Button variant="link" label={t('common.signOut')} onPress={() => void signOut()} /> : null}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, alignItems: 'center', padding: spacing.lg, paddingTop: spacing.xl * 1.5 },
  column: { width: '100%', maxWidth: 560, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flex: 1, fontSize: fontSizes.xl, fontFamily: fonts.bold },
  footer: { gap: spacing.xs },
});
