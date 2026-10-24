/**
 * Brand theme: green, saffron and ink, in light and dark; Bai Jamjuree for English and Thai.
 * Requirements: 2.1
 */
import { Platform, useColorScheme, useWindowDimensions, type ViewStyle } from 'react-native';

export const brand = {
  green: '#0B6E57',
  saffron: '#F2A33A',
  ink: '#0E2A23',
} as const;

export interface Palette {
  primary: string;
  onPrimary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  success: string;
  warning: string;
  emergency: string;
  onEmergency: string;
  /** Soft tints for selected rows, badges and notices: a colour the text on top of it still reads against. */
  primarySoft: string;
  successSoft: string;
  warningSoft: string;
  emergencySoft: string;
  info: string;
  infoSoft: string;
  /** A slightly different surface, for sections inside a card and for the page behind cards. */
  surfaceAlt: string;
  /** The dim layer behind sheets and dialogs. */
  overlay: string;
}

export const light: Palette = {
  primary: brand.green,
  onPrimary: '#FFFFFF',
  accent: brand.saffron,
  background: '#F3F6F5',
  surface: '#FFFFFF',
  text: brand.ink,
  textMuted: '#4F635D',
  border: '#D5DEDA',
  success: '#1E7F4F',
  warning: '#A85D00',
  emergency: '#C62828',
  onEmergency: '#FFFFFF',
  primarySoft: '#E2F1EB',
  successSoft: '#E3F3EA',
  warningSoft: '#FCEFD8',
  emergencySoft: '#FBE5E5',
  info: '#1F5FBF',
  infoSoft: '#E5EDFA',
  surfaceAlt: '#EDF2F0',
  overlay: 'rgba(14, 42, 35, 0.45)',
};

export const dark: Palette = {
  primary: '#3FBF9B',
  onPrimary: brand.ink,
  accent: brand.saffron,
  background: '#08191A',
  surface: '#10282A',
  text: '#E8F1EE',
  textMuted: '#A3B8B1',
  border: '#24423F',
  success: '#5BCB8C',
  warning: '#F2A33A',
  emergency: '#EF5350',
  onEmergency: '#FFFFFF',
  primarySoft: '#14382F',
  successSoft: '#143A27',
  warningSoft: '#3C2C10',
  emergencySoft: '#3F1B1B',
  info: '#7FB0FF',
  infoSoft: '#15294A',
  surfaceAlt: '#16302F',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Font family names registered in app/_layout.tsx. */
export const fonts = {
  regular: 'BaiJamjuree_400Regular',
  medium: 'BaiJamjuree_500Medium',
  semibold: 'BaiJamjuree_600SemiBold',
  bold: 'BaiJamjuree_700Bold',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const fontSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/** Screen widths the layout changes at: phone, tablet, desktop. */
export const breakpoints = { medium: 640, expanded: 1024 } as const;
export type Breakpoint = 'compact' | 'medium' | 'expanded';

export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions();
  return width >= breakpoints.expanded ? 'expanded' : width >= breakpoints.medium ? 'medium' : 'compact';
}

/** The widest a page's content grows on large screens, so lines stay readable. */
export const layout = { contentMax: 1040, readableMax: 640, sidebar: 264 } as const;

/** How long things move, in milliseconds. */
export const motion = { fast: 120, base: 220, slow: 360 } as const;

/**
 * Soft elevation. The browser takes a box-shadow, the phone takes shadow props plus Android elevation.
 * Level 1 is a resting card, 2 a raised or hovered card, 3 a floating bar or sheet.
 */
export function shadow(level: 0 | 1 | 2 | 3, dark = false): ViewStyle {
  if (level === 0) return {};
  const opacity = dark ? 0.5 : [0, 0.07, 0.11, 0.16][level];
  const blur = [0, 8, 18, 30][level];
  const lift = [0, 2, 6, 12][level];
  if (Platform.OS === 'web') return { boxShadow: `0 ${lift}px ${blur}px rgba(10, 30, 24, ${opacity})` } as ViewStyle;
  return { shadowColor: '#0A1E18', shadowOpacity: opacity, shadowRadius: blur / 2, shadowOffset: { width: 0, height: lift }, elevation: level * 2 };
}

/** True in dark mode, for the few places that need to know. */
export function useIsDark(): boolean {
  return useColorScheme() === 'dark';
}
