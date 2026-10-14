/**
 * App-wide state: language and the signed-in session; the live data snapshot arrives with the data service.
 * Requirements: 1.3, 1.4, 2.2, 2.3, 2.6
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { setActiveLang, translate, type Lang, type Params, type StringKey } from '../i18n/t';
import type { Session } from '@medora/shared/logic/session';
import { getSession, signOut as authSignOut } from '../services/auth';

const LANG_STORAGE_KEY = 'medora.lang';

interface AppContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** False until the saved language and the session have been read, so nothing flashes. */
  ready: boolean;
  session: Session | null;
  /** Re-reads the session; `force` fetches new tokens after the backend changed groups or attributes. */
  refreshSession: (force?: boolean) => Promise<Session | null>;
  signOut: () => Promise<void>;
}

const AppContext = React.createContext<AppContextValue>({
  lang: 'en',
  setLang: () => undefined,
  ready: false,
  session: null,
  refreshSession: async () => null,
  signOut: async () => undefined,
});

export function AppProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [lang, setLangState] = React.useState<Lang>('en');
  const [ready, setReady] = React.useState(false);
  const [session, setSession] = React.useState<Session | null>(null);

  React.useEffect(() => {
    const loadLang = AsyncStorage.getItem(LANG_STORAGE_KEY)
      .then((saved) => {
        if (saved === 'en' || saved === 'th') {
          setActiveLang(saved);
          setLangState(saved);
        }
      })
      .catch(() => undefined); // keep English if storage is unavailable
    const loadSession = getSession().then(setSession);
    void Promise.all([loadLang, loadSession]).finally(() => setReady(true));
  }, []);

  const refreshSession = React.useCallback(async (force = false) => {
    const next = await getSession(force);
    setSession(next);
    return next;
  }, []);

  const signOut = React.useCallback(async () => {
    await authSignOut().catch(() => undefined); // tokens are cleared locally even if the network call fails
    setSession(null);
  }, []);

  const setLang = React.useCallback((next: Lang) => {
    setActiveLang(next);
    setLangState(next);
    AsyncStorage.setItem(LANG_STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const value = React.useMemo(
    () => ({ lang, setLang, ready, session, refreshSession, signOut }),
    [lang, setLang, ready, session, refreshSession, signOut],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  return React.useContext(AppContext);
}

/**
 * Translation bound to the current language. Screens use this rather than `t` so they
 * re-render as soon as the language changes.
 */
export function useT(): (key: StringKey, params?: Params) => string {
  const { lang } = useApp();
  return React.useCallback((key: StringKey, params?: Params) => translate(lang, key, params), [lang]);
}
