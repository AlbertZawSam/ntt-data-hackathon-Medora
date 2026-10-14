/**
 * Language toggle — switches between English and Thai and remembers the choice.
 * Requirements: 2.2, 2.3, 2.6
 */
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useApp, useT } from '../state/AppProvider';
import { fonts, radii, spacing, useTheme } from '../ui/theme';

export function LanguageToggle(): React.JSX.Element {
  const { lang, setLang } = useApp();
  const t = useT();
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => setLang(lang === 'en' ? 'th' : 'en')}
      style={[styles.button, { borderColor: theme.primary }]}
      accessibilityRole="button"
      accessibilityLabel={t('language.toggleLabel')}
      hitSlop={8}
    >
      <Text style={[styles.label, { color: theme.primary }]}>{t('language.toggle')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radii.lg, borderWidth: 1 },
  label: { fontSize: 15, fontFamily: fonts.semibold },
});
