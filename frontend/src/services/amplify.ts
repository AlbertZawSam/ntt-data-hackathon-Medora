/**
 * Connects the app to the Amplify backend. Imported once, first, by frontend/app/_layout.tsx.
 * Needs amplify_outputs.json in the project root: run `npm run sandbox`.
 * Without it, metro.config.js bundles an empty stub and the app runs with sign-in disabled.
 */
import 'react-native-get-random-values';
import { Amplify } from 'aws-amplify';
import outputs from '../../amplify_outputs.json';

/** False when no sandbox has been deployed yet (amplify_outputs.json is missing). */
export const backendConfigured = 'auth' in outputs;

if (backendConfigured) {
  Amplify.configure(outputs as Parameters<typeof Amplify.configure>[0]);
} else {
  console.warn('[Medora] amplify_outputs.json not found. Run `npm run sandbox` and restart Expo.');
}
