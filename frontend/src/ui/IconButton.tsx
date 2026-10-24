import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Icon, type IconName } from './Icon';
import { useTheme } from './theme';
import { focusRing, pointer, webTransition } from './web';

/** A round button with only an icon, for plus and minus and quick actions. `label` is what screen readers say. */
export function IconButton({ icon, label, onPress, size = 'md', variant = 'outline', disabled = false }: { icon: IconName; label: string; onPress: () => void; size?: 'md' | 'lg'; variant?: 'outline' | 'filled'; disabled?: boolean }): React.JSX.Element {
  const theme = useTheme();
  const diameter = size === 'lg' ? 56 : 44;
  const filled = variant === 'filled';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={6}
      style={(state) => [
        styles.button,
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          borderColor: theme.primary,
          backgroundColor: filled ? theme.primary : (state as { hovered?: boolean }).hovered === true ? theme.primarySoft : theme.surface,
          opacity: disabled ? 0.4 : state.pressed ? 0.8 : 1,
          transform: [{ scale: state.pressed && !disabled ? 0.94 : 1 }],
        },
        pointer,
        webTransition(),
        focusRing(theme.primary, (state as { focused?: boolean }).focused === true),
      ]}
    >
      <Icon name={icon} size={size === 'lg' ? 28 : 22} color={filled ? theme.onPrimary : theme.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({ button: { alignItems: 'center', justifyContent: 'center', borderWidth: 2 } });
