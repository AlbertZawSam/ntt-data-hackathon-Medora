import React from 'react';
import { Animated, Easing, Platform, StyleSheet, View, type DimensionValue } from 'react-native';
import { Card } from './Card';
import { useReducedMotion } from './Reveal';
import { radii, spacing, useTheme } from './theme';

/** A grey placeholder bar that gently pulses while real content loads, so a screen never looks empty or jumps. */
export function Skeleton({ width = '100%', height = 14, radius = radii.sm }: { width?: DimensionValue; height?: number; radius?: number }): React.JSX.Element {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const pulse = React.useRef(new Animated.Value(0.55)).current;
  React.useEffect(() => {
    if (reduced) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulse, { toValue: 0.55, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);
  return <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width, height, borderRadius: radius, backgroundColor: theme.border, opacity: pulse }} />;
}

/** A card-shaped placeholder: a title bar and a few lines. */
export function SkeletonCard({ lines = 2 }: { lines?: number }): React.JSX.Element {
  return (
    <Card>
      <View accessibilityLabel="Loading" accessibilityLiveRegion="polite" style={styles.stack}>
        <Skeleton width="55%" height={18} />
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} width={i === lines - 1 ? '70%' : '100%'} />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({ stack: { gap: spacing.sm + 2 } });
