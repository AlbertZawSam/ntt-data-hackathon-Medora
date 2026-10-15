import { StyleSheet, Text, View } from 'react-native';

import type { StringKey } from '@/i18n/t';
import { useT } from '@/state/language';
import { fonts, spacing, useTheme } from '@/ui/theme';

// Stand-in for a screen that a later task builds.
export function Placeholder({ title }: { title: StringKey }) {
  const { colors } = useTheme();
  const { t } = useT();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>{t(title)}</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>{t('common.comingSoon')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.md },
  title: { fontFamily: fonts.bold, fontSize: 24 },
  body: { fontFamily: fonts.regular, fontSize: 16 },
});
