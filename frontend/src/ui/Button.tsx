import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { fonts, fontSizes, radii, spacing, useTheme } from './theme';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'link';
  busy?: boolean;
  disabled?: boolean;
}

export function Button({ label, onPress, variant = 'primary', busy = false, disabled = false }: Props): React.JSX.Element {
  const theme = useTheme();
  const inactive = busy || disabled;
  const bg = variant === 'primary' ? theme.primary : 'transparent';
  const fg = variant === 'primary' ? theme.onPrimary : theme.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      style={({ pressed }) => [
        variant === 'link' ? styles.link : styles.button,
        { backgroundColor: bg, borderColor: theme.primary, opacity: inactive ? 0.6 : pressed ? 0.85 : 1 },
        variant === 'secondary' && styles.outlined,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[styles.label, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 48, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  outlined: { borderWidth: 1.5 },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: fontSizes.md, fontFamily: fonts.semibold, textAlign: 'center' },
});
