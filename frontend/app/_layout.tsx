import '../src/services/amplify'; // must run before anything uses Amplify
import {
  BaiJamjuree_400Regular,
  BaiJamjuree_500Medium,
  BaiJamjuree_600SemiBold,
  BaiJamjuree_700Bold,
  useFonts,
} from '@expo-google-fonts/bai-jamjuree';
import { Stack, useRouter, useSegments, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React from 'react';
import { redirectFor } from '@medora/shared/logic/session';
import { roleAllowedInVariant } from '@medora/shared/logic/variant';
import { appVariant } from '../src/services/variant';
import { AppProvider, useApp } from '../src/state/AppProvider';
import { useTheme } from '../src/ui/theme';

void SplashScreen.preventAutoHideAsync();

/**
 * Auth gate: signed-out users go to sign-in; signed-in users land on their role's screens and
 * can't open another role's screens. Requirements: 1.3, 1.4, 18.1, 18.6
 */
function useAuthGate(enabled: boolean): void {
  const { session, signOut } = useApp();
  const segments = useSegments();
  const router = useRouter();
  React.useEffect(() => {
    if (!enabled) return;
    // The patient app is for patients only and the hospital app for hospital roles only.
    if (session && !roleAllowedInVariant(appVariant, session)) {
      void signOut();
      return;
    }
    const target = redirectFor(session, segments);
    if (target) router.replace(target as Href);
  }, [enabled, session, segments, router, signOut]);
}

function Navigator(): React.JSX.Element | null {
  const { ready } = useApp();
  const theme = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    BaiJamjuree_400Regular,
    BaiJamjuree_500Medium,
    BaiJamjuree_600SemiBold,
    BaiJamjuree_700Bold,
  });
  // Fall back to the system font rather than blocking the app if fonts fail to load.
  const loaded = ready && (fontsLoaded || fontError !== null);
  useAuthGate(loaded);

  React.useEffect(() => {
    if (loaded) void SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }} />;
}

export default function RootLayout(): React.JSX.Element {
  return (
    <AppProvider>
      <Navigator />
    </AppProvider>
  );
}
