import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card, toneColors, type Tone } from './Card';
import { Icon, type IconName } from './Icon';
import { fonts, fontSizes, radii, spacing, useTheme } from './theme';

/** A number with a label and an icon, for dashboards: how many beds are ready, how many requests are waiting. */
export function Stat({ label, value, icon, tone = 'primary', hint }: { label: string; value: string; icon: IconName; tone?: Tone; hint?: string }): React.JSX.Element {
  const theme = useTheme();
  const { fg, bg } = toneColors(theme, tone);
  return (
    <Card accessibilityLabel={`${label}: ${value}${hint ? `. ${hint}` : ''}`}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: bg }]}>
          <Icon name={icon} size={22} color={fg} />
        </View>
        <View style={styles.text}>
          <Text style={[styles.value, { color: theme.text }]}>{value}</Text>
          <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
          {hint ? <Text style={[styles.hint, { color: theme.textMuted }]}>{hint}</Text> : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 48, height: 48, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 1 },
  value: { fontSize: fontSizes.xxl, fontFamily: fonts.bold },
  label: { fontSize: fontSizes.sm, fontFamily: fonts.medium },
  hint: { fontSize: fontSizes.xs, fontFamily: fonts.regular },
});
