import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { fonts, fontSizes, spacing, useTheme } from './theme';

/** What a list shows when there is nothing in it yet: a friendly icon, a line of explanation and, if useful, the next step. */
export function EmptyState({ icon, title, text, actionLabel, onAction }: { icon: IconName; title: string; text?: string; actionLabel?: string; onAction?: () => void }): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.circle, { backgroundColor: theme.primarySoft }]}>
        <Icon name={icon} size={34} color={theme.primary} />
      </View>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{title}</Text>
      {text ? <Text style={[styles.text, { color: theme.textMuted }]}>{text}</Text> : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} fullWidth={false} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.sm + 2, paddingVertical: spacing.xl, paddingHorizontal: spacing.md },
  circle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  title: { fontSize: fontSizes.lg, fontFamily: fonts.semibold, textAlign: 'center' },
  text: { fontSize: fontSizes.sm, fontFamily: fonts.regular, textAlign: 'center', maxWidth: 360, lineHeight: 20 },
});
