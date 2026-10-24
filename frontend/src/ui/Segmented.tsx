import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { fonts, fontSizes, radii, spacing, useTheme } from './theme';
import { focusRing, pointer, webTransition } from './web';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

/** Pick one of a few options in a row, like how someone will arrive. The chosen one is raised and coloured. */
export function Segmented<T extends string>({ options, value, onChange, accessibilityLabel }: { options: readonly SegmentOption<T>[]; value: T; onChange: (value: T) => void; accessibilityLabel: string }): React.JSX.Element {
  const theme = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={[styles.track, { backgroundColor: theme.surfaceAlt }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected, checked: selected }}
            style={(state) => [
              styles.item,
              selected && { backgroundColor: theme.surface, borderColor: theme.primary, borderWidth: 1.5 },
              !selected && (state as { hovered?: boolean }).hovered === true && { backgroundColor: theme.primarySoft },
              pointer,
              webTransition(),
              focusRing(theme.primary, (state as { focused?: boolean }).focused === true),
            ]}
          >
            {option.icon ? <Icon name={option.icon} size={18} color={selected ? theme.primary : theme.textMuted} /> : null}
            <Text numberOfLines={1} style={[styles.label, { color: selected ? theme.primary : theme.textMuted }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: radii.lg, padding: 4, gap: 4 },
  item: { flex: 1, minHeight: 44, borderRadius: radii.md, borderWidth: 1.5, borderColor: 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: spacing.xs },
  label: { fontSize: fontSizes.sm, fontFamily: fonts.semibold },
});
