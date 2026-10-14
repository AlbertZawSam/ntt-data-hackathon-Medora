import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LanguageToggle } from '../components/LanguageToggle';
import { useT } from '../state/AppProvider';
import { fonts, fontSizes, spacing, useTheme } from './theme';

interface Props {
  title: string;
  subtitle?: string;
  /** Error or notice shown above the form. */
  message?: { text: string; tone: 'error' | 'info' } | null;
  children: React.ReactNode;
}

/** Scrollable, keyboard-aware screen for sign-in style forms. */
export function FormScreen({ title, subtitle, message, children }: Props): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* A readable column on wide screens (web, tablets); full width on phones. */}
        <View style={styles.column}>
          <View style={styles.header}>
            <Text style={[styles.brand, { color: theme.primary }]}>{t('app.name')}</Text>
            <LanguageToggle />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: theme.textMuted }]}>{subtitle}</Text> : null}
          {message ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.message, { color: message.tone === 'error' ? theme.emergency : theme.success }]}
            >
              {message.text}
            </Text>
          ) : null}
          <View style={styles.form}>{children}</View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg, paddingTop: spacing.xl * 2 },
  column: { width: '100%', maxWidth: 480 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  brand: { fontSize: fontSizes.xxl, fontFamily: fonts.bold },
  title: { fontSize: fontSizes.xl, fontFamily: fonts.semibold },
  subtitle: { fontSize: fontSizes.sm, fontFamily: fonts.regular, marginTop: spacing.xs },
  message: { fontSize: fontSizes.sm, fontFamily: fonts.medium, marginTop: spacing.md },
  form: { gap: spacing.md, marginTop: spacing.lg },
});
