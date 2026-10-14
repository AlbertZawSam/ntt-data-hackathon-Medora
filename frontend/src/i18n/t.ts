/**
 * t(key, params) — translation helper.
 * Returns the string for `key` in the active language, falling back to English when the key is
 * missing from the Thai file; `{{name}}` placeholders are filled from `params`.
 * The active language is set by AppProvider, which re-renders the tree when it changes.
 * Requirements: 2.1, 2.7
 */
import type { Bi, Failure } from '@medora/shared/logic/types';
import en from './en.json';
import th from './th.json';

export type Lang = 'en' | 'th';
export type { Bi };

export type StringKey = keyof typeof en;
export type Params = Record<string, string | number>;

const catalogues: Record<Lang, Record<string, string>> = { en, th };

let activeLang: Lang = 'en';

export function setActiveLang(lang: Lang): void {
  activeLang = lang;
}

function fill(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/{{(\w+)}}/g, (whole, name: string) =>
    params[name] === undefined ? whole : String(params[name]),
  );
}

/** Pure lookup in a given language; used by `t` and by tests. */
export function translate(lang: Lang, key: string, params?: Params): string {
  const text = catalogues[lang][key] || catalogues.en[key];
  // A missing key is a bug caught by tests/unit/i18n.test.ts; show the key rather than a blank.
  return fill(text ?? key, params);
}

export function t(key: StringKey, params?: Params): string {
  return translate(activeLang, key, params);
}

/** Picks the active language from stored bilingual text, falling back to English. */
export function pick(text: Bi, lang: Lang = activeLang): string {
  return text[lang] || text.en;
}

/** Item names (departments, equipment, doctor roles) that have a translation; others show as-is. */
function itemName(item: string, lang: Lang): string {
  const key = `item.${item}`;
  return key in catalogues.en ? translate(lang, key) : item;
}

/** Detailed reason for doctors and staff. Patients see `failure.simple` instead (AGENTS.md safety rule 6). */
export function failureText(failure: Failure, lang: Lang = activeLang): string {
  const key = `failure.${failure.kind}`;
  return 'item' in failure ? translate(lang, key, { item: itemName(failure.item, lang) }) : translate(lang, key);
}
