import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { fonts, fontSizes, spacing, useTheme } from './theme';

/** A heading for a group of cards, with an optional line under it and one quiet action on the right. */
export function SectionHeader({ title, subtitle, actionLabel, onAction }: { title: string; subtitle?: string; actionLabel?: string; onAction?: () => void }): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: theme.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onAction ? <Button variant="ghost" size="sm" fullWidth={false} label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.sm },
  text: { flex: 1, gap: 2 },
  title: { fontSize: fontSizes.lg, fontFamily: fonts.bold },
  subtitle: { fontSize: fontSizes.sm, fontFamily: fonts.regular },
});
