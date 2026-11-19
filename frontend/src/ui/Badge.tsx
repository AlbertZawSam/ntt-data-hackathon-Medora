import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { toneColors, type Tone } from './Card';
import { Icon, type IconName } from './Icon';
import { fonts, fontSizes, lineHeights, radii, spacing, useTheme } from './theme';
import { focusRing, pointer, webTransition } from './web';

/** A small status pill: coloured background, strong text, an optional icon. Never colour alone: the label says it too. */
export function Badge({ label, tone = 'neutral', icon, dot = false }: { label: string; tone?: Tone; icon?: IconName; dot?: boolean }): React.JSX.Element {
  const theme = useTheme();
  const { fg, bg } = toneColors(theme, tone);
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {dot ? <View style={[styles.dot, { backgroundColor: fg }]} /> : null}
      {icon ? <Icon name={icon} size={14} color={fg} /> : null}
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

/** A choice the person can turn on or off, for filters and options. */
export function Chip({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon?: IconName }): React.JSX.Element {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, checked: selected }}
      style={(state) => [
        styles.chip,
        { borderColor: selected ? theme.primary : theme.borderStrong, backgroundColor: selected ? theme.primarySoft : (state as { hovered?: boolean }).hovered ? theme.surfaceAlt : theme.surface },
        pointer,
        webTransition(),
        focusRing(theme.primary, (state as { focused?: boolean }).focused === true),
      ]}
    >
      {/* Selected always shows a checkmark, so the choice never depends on colour alone. */}
      {selected ? <Icon name="checkmark-circle" size={18} color={theme.primary} /> : icon ? <Icon name={icon} size={18} color={theme.textMuted} /> : null}
      <Text style={[styles.chipText, { color: selected ? theme.primary : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing.xs, borderRadius: radii.pill, paddingHorizontal: spacing.sm + spacing.xxs, paddingVertical: spacing.xs },
  dot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: fontSizes.xs, lineHeight: lineHeights.xs, fontFamily: fonts.semibold },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + spacing.xxs, borderWidth: 1.5, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, minHeight: 44 },
  chipText: { fontSize: fontSizes.sm, lineHeight: lineHeights.sm, fontFamily: fonts.medium },
});
