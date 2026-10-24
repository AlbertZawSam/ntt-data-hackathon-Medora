/**
 * Browser-only polish that React Native does not have: smooth hover and focus changes, and a visible keyboard focus
 * ring. Each helper returns an empty style on the phone, so a screen can spread it anywhere.
 */
import { Platform, type ViewStyle } from 'react-native';
import { motion } from './theme';

const web = Platform.OS === 'web';

/** Animate these properties when they change (hover, press, selection). */
export function webTransition(properties = 'background-color, border-color, box-shadow, transform, opacity'): ViewStyle {
  return web ? ({ transitionProperty: properties, transitionDuration: `${motion.fast + 40}ms`, transitionTimingFunction: 'ease-out' } as unknown as ViewStyle) : {};
}

/** A ring around the control that has keyboard focus, so people using a keyboard can see where they are. */
export function focusRing(color: string, focused: boolean): ViewStyle {
  return web && focused ? ({ outlineStyle: 'solid', outlineWidth: 3, outlineColor: color, outlineOffset: 2 } as unknown as ViewStyle) : {};
}

/** Hand cursor over things that can be pressed. */
export const pointer: ViewStyle = web ? ({ cursor: 'pointer' } as unknown as ViewStyle) : {};
