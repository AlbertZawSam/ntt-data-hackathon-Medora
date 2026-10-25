/**
 * Remembers a little screen state for this browser tab only (sessionStorage), so reloading the web app
 * doesn't throw away a chosen place or a search. It is cleared when the tab closes, stays on the device,
 * and silently does nothing where storage is blocked or on native, where a reload doesn't happen.
 */
import { Platform } from 'react-native';

const PREFIX = 'medora.';

function storage(): Storage | null {
  try {
    return Platform.OS === 'web' && typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

export function remember(key: string, value: unknown): void {
  try {
    storage()?.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // full or blocked storage: the screen simply starts fresh after a reload
  }
}

export function recall<T>(key: string): T | undefined {
  try {
    const raw = storage()?.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function forget(key: string): void {
  try {
    storage()?.removeItem(PREFIX + key);
  } catch {
    // nothing to clear
  }
}
