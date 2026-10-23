/** Which app this build is: Medora, Medora for Hospitals, or the development build with both. */
import Constants from 'expo-constants';
import { parseVariant, variantPolicy, type AppVariant } from '@medora/shared/logic/variant';

export const appVariant: AppVariant = parseVariant(Constants.expoConfig?.extra?.variant);
export const policy = variantPolicy(appVariant);
