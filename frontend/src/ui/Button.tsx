import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { fonts, fontSizes, radii, shadow, spacing, useIsDark, useTheme } from './theme';
import { focusRing, pointer, webTransition } from './web';

interface Props {
  label: string;
  onPress: () => void;
  /** primary: the main action; secondary: outlined; ghost: quiet; danger: destructive or urgent; link: a text link. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  iconRight?: IconName;
  busy?: boolean;
  disabled?: boolean;
  /** Stretch to the width of the column (the default), or shrink to the label. */
  fullWidth?: boolean;
  accessibilityHint?: string;
}

const HEIGHT = { sm: 40, md: 48, lg: 56 } as const;

export function Button({ label, onPress, variant = 'primary', size = 'md', icon, iconRight, busy = false, disabled = false, fullWidth = true, accessibilityHint }: Props): React.JSX.Element {
  const theme = useTheme();
  const dark = useIsDark();
  const inactive = busy || disabled;
  const filled = variant === 'primary' || variant === 'danger';
  const base = variant === 'danger' ? theme.emergency : theme.primary;
  const fg = filled ? (variant === 'danger' ? theme.onEmergency : theme.onPrimary) : variant === 'ghost' || variant === 'secondary' || variant === 'link' ? theme.primary : theme.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy }}
      style={(state) => {
        const { pressed } = state;
        const hovered = (state as { hovered?: boolean }).hovered === true;
        const focused = (state as { focused?: boolean }).focused === true;
        return [
          variant === 'link' ? styles.link : styles.button,
          variant !== 'link' && { minHeight: HEIGHT[size], paddingHorizontal: size === 'sm' ? spacing.md : spacing.lg },
          !fullWidth && { alignSelf: 'flex-start' as const },
          filled && { backgroundColor: base, ...(hovered && !inactive ? shadow(2, dark) : shadow(1, dark)) },
          variant === 'secondary' && { borderWidth: 1.5, borderColor: theme.primary, backgroundColor: hovered ? theme.primarySoft : theme.surface },
          variant === 'ghost' && { backgroundColor: hovered || pressed ? theme.primarySoft : 'transparent' },
          { opacity: inactive ? 0.55 : pressed ? 0.88 : 1, transform: [{ scale: pressed && !inactive ? 0.985 : 1 }] },
          pointer,
          webTransition(),
          focusRing(theme.primary, focused),
        ];
      }}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} size={size === 'lg' ? 22 : 18} color={fg} /> : null}
          <Text style={[styles.label, { color: fg, fontSize: size === 'lg' ? fontSizes.lg : fontSizes.md, textDecorationLine: variant === 'link' ? 'underline' : 'none' }]}>{label}</Text>
          {iconRight ? <Icon name={iconRight} size={18} color={fg} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center' },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  label: { fontFamily: fonts.semibold, textAlign: 'center' },
});
