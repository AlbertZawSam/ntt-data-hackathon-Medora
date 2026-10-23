import type { ExpoConfig } from 'expo/config';

/**
 * Two apps from one codebase: APP_VARIANT=patient builds Medora, APP_VARIANT=hospital builds Medora for
 * Hospitals. Unset gives a development build with both. The variant is also read at run time to decide
 * which sign-in options show and which roles may use the app (see shared/logic/variant.ts).
 */
const variant = process.env.APP_VARIANT === 'hospital' || process.env.APP_VARIANT === 'patient' ? process.env.APP_VARIANT : 'all';

const names = { patient: 'Medora', hospital: 'Medora for Hospitals', all: 'Medora' } as const;
const ids = { patient: 'com.medora.app', hospital: 'com.medora.hospitals', all: 'com.medora.app' } as const;
const slugs = { patient: 'medora', hospital: 'medora-hospitals', all: 'medora' } as const;
const schemes = { patient: 'medora', hospital: 'medora-hospitals', all: 'medora' } as const;

const config: ExpoConfig = {
  name: names[variant],
  slug: slugs[variant],
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  splash: { image: './assets/splash.png', resizeMode: 'contain', backgroundColor: '#0B6E57' },
  ios: { supportsTablet: true, bundleIdentifier: ids[variant] },
  android: {
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#0B6E57' },
    package: ids[variant],
  },
  web: { favicon: './assets/favicon.png', bundler: 'metro' },
  scheme: schemes[variant],
  plugins: [
    'expo-router',
    'expo-font',
    ['expo-splash-screen', { backgroundColor: '#0B6E57' }],
    // Only the patient app uses the phone's location.
    ...(variant === 'hospital'
      ? []
      : [['expo-location', { locationAlwaysAndWhenInUsePermission: 'Allow Medora to use your location to find nearby hospitals.' }] as [string, Record<string, string>]]),
  ],
  experiments: { typedRoutes: true },
  extra: { variant },
};

export default config;
