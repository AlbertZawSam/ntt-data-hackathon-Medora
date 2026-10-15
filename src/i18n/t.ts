import type { Bi } from '../logic/types';
import en from './en.json';
import th from './th.json';

export type { Bi };
export type Lang = 'en' | 'th';
export type StringKey = keyof typeof en;
export type Params = Record<string, string | number>;

export const languages: readonly Lang[] = ['en', 'th'];
export const defaultLang: Lang = 'en';

// th.json must have every key en.json has; this fails the type-check if one is missing.
const strings: Record<Lang, Record<StringKey, string>> = { en, th };

let lang: Lang = defaultLang;

export function setLang(next: Lang) {
  lang = next;
}

export function getLang(): Lang {
  return lang;
}

// Accepts anything read back from storage; returns null unless it is a supported language.
export function parseLang(value: unknown): Lang | null {
  return value === 'en' || value === 'th' ? value : null;
}

// Replaces {name} with params.name. A placeholder with no matching param stays as written,
// so a missing value is visible in the UI instead of silently blank.
export function format(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function t(key: StringKey, params?: Params): string {
  return format(strings[lang][key], params);
}

// Picks the reader's language from stored bilingual text; falls back to English if Thai is empty.
export function tr(text: Bi, forLang: Lang = lang): string {
  return text[forLang] || text.en;
}
