/**
 * Language toggle: switches between English and Thai and remembers the choice. A pill with a globe, so it reads as a
 * language control and not as a label. Requirements: 2.2, 2.3, 2.6
 */
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useApp, useT } from '../state/AppProvider';
import { Icon } from '../ui/Icon';
import { fonts, radii, spacing, useTheme } from '../ui/theme';
import { focusRing, pointer, webTransition } from '../ui/web';

export function LanguageToggle(): React.JSX.Element {
  const { lang, setLang } = useApp();
  const t = useT();
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => setLang(lang === 'en' ? 'th' : 'en')}
      style={(state) => [
        styles.button,
        { borderColor: theme.border, backgroundColor: (state as { hovered?: boolean }).hovered === true ? theme.primarySoft : theme.surface },
        pointer,
        webTransition(),
        focusRing(theme.primary, (state as { focused?: boolean }).focused === true),
      ]}
      accessibilityRole="button"
      accessibilityLabel={t('language.toggleLabel')}
      hitSlop={8}
    >
      <Icon name="language" size={18} color={theme.primary} />
      <Text style={[styles.label, { color: theme.primary }]}>{t('language.toggle')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md - 2, minHeight: 40, borderRadius: radii.pill, borderWidth: 1 },
  label: { fontSize: 14, fontFamily: fonts.semibold },
});
