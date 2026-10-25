/**
 * The patient's one-time consent before describing a health problem: what is read by AI, where it is
 * sent, and that Medora gives no medical advice. Kept on the device only (AsyncStorage, which is the
 * browser's storage on the web); if storage fails, the patient is simply asked again.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'medora.consent';
const VERSION = 'v1';

export async function hasConsented(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === VERSION;
  } catch {
    return false;
  }
}

export async function giveConsent(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, VERSION);
  } catch {
    // asked again next time
  }
}
