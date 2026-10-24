import React from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, type StyleProp, type ViewStyle } from 'react-native';
import { motion } from './theme';

/** True when the person asked their device for less motion; then nothing slides or fades. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => alive && setReduced(value));
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

/** Fades and slides its content in when it first appears. `index` staggers a list so it cascades in. */
export function Reveal({ children, index = 0, y = 14, style }: { children: React.ReactNode; index?: number; y?: number; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const reduced = useReducedMotion();
  const progress = React.useRef(new Animated.Value(reduced ? 1 : 0)).current;
  React.useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    Animated.timing(progress, { toValue: 1, duration: motion.slow, delay: Math.min(index, 8) * 55, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [index, progress, reduced]);
  return (
    <Animated.View style={[{ opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [y, 0] }) }] }, style]}>
      {children}
    </Animated.View>
  );
}
