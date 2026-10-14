import en from './en.json';
import th from './th.json';

export type Lang = 'en' | 'th';
export type StringKey = keyof typeof en;

// th.json must have every key en.json has; this fails the type-check if one is missing.
const strings: Record<Lang, Record<StringKey, string>> = { en, th };

let lang: Lang = 'en';

export function setLang(next: Lang) {
  lang = next;
}

export function t(key: StringKey): string {
  return strings[lang][key];
}
