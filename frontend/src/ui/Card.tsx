import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radii, shadow, spacing, useIsDark, useTheme, type Palette } from './theme';
import { focusRing, pointer, webTransition } from './web';

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

/** The strong colour and the soft background for a tone, from the palette. */
export function toneColors(theme: Palette, tone: Tone): { fg: string; bg: string } {
  switch (tone) {
    case 'primary':
      return { fg: theme.primary, bg: theme.primarySoft };
    case 'success':
      return { fg: theme.success, bg: theme.successSoft };
    case 'warning':
      return { fg: theme.warning, bg: theme.warningSoft };
    case 'danger':
      return { fg: theme.emergency, bg: theme.emergencySoft };
    case 'info':
      return { fg: theme.info, bg: theme.infoSoft };
    default:
      return { fg: theme.textMuted, bg: theme.surfaceAlt };
  }
}

interface Props {
  children: React.ReactNode;
  /** Tints the card (a soft background and a coloured edge). */
  tone?: Tone;
  /** When set, the whole card is pressable: it lifts on hover and presses in. */
  onPress?: () => void;
  elevation?: 0 | 1 | 2;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Highlights the card, for the best match or the chosen row. */
  selected?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const PAD = { none: 0, sm: spacing.sm + 2, md: spacing.md, lg: spacing.lg } as const;

/** The basic container of the app: rounded, softly raised, and optionally pressable. */
export function Card({ children, tone = 'neutral', onPress, elevation = 1, padding = 'md', selected = false, accessibilityLabel, style }: Props): React.JSX.Element {
  const theme = useTheme();
  const dark = useIsDark();
  const { fg, bg } = toneColors(theme, tone);
  const tinted = tone !== 'neutral';
  const look = (hovered: boolean, pressed: boolean, focused: boolean): StyleProp<ViewStyle> => [
    styles.card,
    {
      padding: PAD[padding],
      backgroundColor: tinted ? bg : theme.surface,
      borderColor: selected ? theme.primary : tinted ? fg : theme.border,
      borderWidth: selected ? 2 : 1,
      ...shadow(onPress && hovered ? 2 : elevation, dark),
    },
    onPress ? { transform: [{ scale: pressed ? 0.99 : 1 }, { translateY: hovered && !pressed ? -1 : 0 }] } : null,
    webTransition(),
    onPress ? pointer : null,
    focusRing(theme.primary, focused),
    style,
  ];
  if (!onPress) return <View accessibilityLabel={accessibilityLabel} style={look(false, false, false)}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={(state) => look((state as { hovered?: boolean }).hovered === true, state.pressed, (state as { focused?: boolean }).focused === true)}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.xl, gap: spacing.sm },
});
