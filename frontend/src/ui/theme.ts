/**
 * Brand theme: green, saffron and ink, in light and dark; Bai Jamjuree for English and Thai.
 * Requirements: 2.1
 */
import { useColorScheme } from 'react-native';

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
}

export const light: Palette = {
  primary: brand.green,
  onPrimary: '#FFFFFF',
  accent: brand.saffron,
  background: '#F6F8F7',
  surface: '#FFFFFF',
  text: brand.ink,
  textMuted: '#4F635D',
  border: '#D5DEDA',
  success: '#1E7F4F',
  warning: '#A85D00',
  emergency: '#C62828',
  onEmergency: '#FFFFFF',
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
} as const;
