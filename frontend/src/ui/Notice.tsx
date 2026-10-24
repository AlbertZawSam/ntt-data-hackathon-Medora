import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { toneColors, type Tone } from './Card';
import { Icon, type IconName } from './Icon';
import { fonts, fontSizes, radii, spacing, useTheme } from './theme';

const ICONS: Record<Tone, IconName> = {
  neutral: 'information-circle',
  primary: 'information-circle',
  info: 'information-circle',
  success: 'checkmark-circle',
  warning: 'warning',
  danger: 'alert-circle',
};

/** An inline message with an icon, for errors, tips and results. Errors are announced to screen readers at once. */
export function Notice({ tone = 'info', title, children, actionLabel, onAction }: { tone?: Tone; title?: string; children?: React.ReactNode; actionLabel?: string; onAction?: () => void }): React.JSX.Element {
  const theme = useTheme();
  const { fg, bg } = toneColors(theme, tone);
  return (
    <View accessibilityRole={tone === 'danger' ? 'alert' : undefined} accessibilityLiveRegion={tone === 'danger' ? 'assertive' : 'polite'} style={[styles.notice, { backgroundColor: bg, borderColor: fg }]}>
      <Icon name={ICONS[tone]} size={22} color={fg} />
      <View style={styles.body}>
        {title ? <Text style={[styles.title, { color: theme.text }]}>{title}</Text> : null}
        {typeof children === 'string' ? <Text style={[styles.text, { color: theme.text }]}>{children}</Text> : children}
        {actionLabel && onAction ? <Button variant="ghost" size="sm" fullWidth={false} label={actionLabel} onPress={onAction} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', gap: spacing.sm + 2, padding: spacing.md, borderRadius: radii.lg, borderWidth: 1, alignItems: 'flex-start' },
  body: { flex: 1, gap: 2 },
  title: { fontSize: fontSizes.md, fontFamily: fonts.semibold },
  text: { fontSize: fontSizes.sm, fontFamily: fonts.regular, lineHeight: 20 },
});
