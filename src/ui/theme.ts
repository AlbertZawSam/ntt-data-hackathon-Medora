import { useColorScheme } from 'react-native';

// Brand: green #0B6E57, saffron #F2A33A, ink #0E2A23.
// Saffron is a fill colour; put ink text on it, never saffron text on white.
const light = {
  background: '#F5F8F7',
  surface: '#FFFFFF',
  text: '#0E2A23',
  textMuted: '#4A615A',
  border: '#D5E0DC',
  primary: '#0B6E57',
  onPrimary: '#FFFFFF',
  accent: '#F2A33A',
  onAccent: '#0E2A23',
  danger: '#C62828',
  onDanger: '#FFFFFF',
  // Offline map.
  land: '#EEF3F1',
  water: '#A9D3E6',
  grid: '#DCE5E1',
};

export type Colors = typeof light;

// In dark mode the brand green is lightened so it stays readable on the ink background.
const dark: Colors = {
  background: '#081A15',
  surface: '#0E2A23',
  text: '#EAF2EF',
  textMuted: '#A3BAB2',
  border: '#24453B',
  primary: '#4CC2A0',
  onPrimary: '#0E2A23',
  accent: '#F2A33A',
  onAccent: '#0E2A23',
  danger: '#EF5350',
  onDanger: '#0E2A23',
  land: '#0B211B',
  water: '#1D4A5E',
  grid: '#173A31',
};

export const colors = { light, dark };

// Custom fonts ignore fontWeight on Android, so each weight is its own family.
export const fonts = {
  regular: 'BaiJamjuree_400Regular',
  medium: 'BaiJamjuree_500Medium',
  semiBold: 'BaiJamjuree_600SemiBold',
  bold: 'BaiJamjuree_700Bold',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const radius = { sm: 8, md: 12, lg: 20 };

// Smallest touch target allowed for buttons and tabs.
export const minTouch = 44;

export function useTheme() {
  const scheme = useColorScheme();
  return { colors: scheme === 'dark' ? dark : light, dark: scheme === 'dark' };
}
