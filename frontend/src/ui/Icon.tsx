import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { useTheme } from './theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** A decorative icon: screen readers skip it, so every button or row keeps its own text label. */
export function Icon({ name, size = 20, color, style }: { name: IconName; size?: number; color?: string; style?: StyleProp<TextStyle> }): React.JSX.Element {
  const theme = useTheme();
  return <Ionicons name={name} size={size} color={color ?? theme.text} style={style} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
}
