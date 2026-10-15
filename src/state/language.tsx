import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  defaultLang,
  parseLang,
  setLang as setActiveLang,
  translate,
  tr,
  type Bi,
  type Lang,
  type Params,
  type StringKey,
} from '@/i18n/t';

export const LANG_STORAGE_KEY = 'medora.lang';

type LanguageContextValue = { lang: Lang; setLang: (next: Lang) => void };

const LanguageContext = createContext<LanguageContextValue>({ lang: defaultLang, setLang: () => {} });

// Holds the chosen language, restores it on launch and saves every change.
// Components that show text get their strings from useT() so they re-render when the language changes.
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(defaultLang);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(LANG_STORAGE_KEY)
      .then((saved) => {
        const parsed = parseLang(saved);
        if (parsed && !cancelled) {
          setActiveLang(parsed);
          setLangState(parsed);
        }
      })
      .catch(() => {}) // storage unavailable: keep the default language
      .finally(() => !cancelled && setRestored(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const setLang = useCallback((next: Lang) => {
    setActiveLang(next);
    setLangState(next);
    AsyncStorage.setItem(LANG_STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);

  // Wait for the saved choice so the app never flashes the wrong language.
  if (!restored) return null;
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}

// Strings for the current language. t and tr change identity with the language, so
// memoized render output (React Compiler) is recomputed when the user switches.
export function useT() {
  const { lang } = useLanguage();
  return useMemo(
    () => ({
      lang,
      t: (key: StringKey, params?: Params) => translate(lang, key, params),
      tr: (text: Bi) => tr(text, lang),
    }),
    [lang],
  );
}
