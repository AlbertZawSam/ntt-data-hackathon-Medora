import { beforeEach, describe, expect, it } from 'vitest';

import en from '../../src/i18n/en.json';
import th from '../../src/i18n/th.json';
import { format, getLang, parseLang, setLang, t, tr, translate } from '../../src/i18n/t';

beforeEach(() => setLang('en'));

describe('string files', () => {
  it('have the same keys in English and Thai', () => {
    expect(Object.keys(th).sort()).toEqual(Object.keys(en).sort());
  });

  it('have no empty strings', () => {
    for (const value of [...Object.values(en), ...Object.values(th)]) expect(value.trim()).not.toBe('');
  });

  it('use the same {placeholders} in both languages', () => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) expect(names(th[key])).toEqual(names(en[key]));
  });
});

describe('t', () => {
  it('returns the string for the current language', () => {
    expect(t('patient.home')).toBe('Home');
    setLang('th');
    expect(t('patient.home')).toBe(th['patient.home']);
  });
});

describe('translate', () => {
  it('uses the language it is given, not the current one', () => {
    setLang('en');
    expect(translate('th', 'patient.home')).toBe(th['patient.home']);
    expect(translate('en', 'patient.home')).toBe('Home');
  });
});

describe('format', () => {
  it('fills {params}, numbers included', () => {
    expect(format('{minutes} min left', { minutes: 40 })).toBe('40 min left');
    expect(format('{a} and {a}, {b}', { a: 'x', b: 2 })).toBe('x and x, 2');
  });

  it('keeps an unknown placeholder visible and ignores extra params', () => {
    expect(format('{minutes} min', { hours: 1 })).toBe('{minutes} min');
  });

  it('returns the text unchanged without params', () => {
    expect(format('No params')).toBe('No params');
  });
});

describe('tr (stored bilingual text)', () => {
  const text = { en: 'Accepted', th: 'รับแล้ว' };

  it('picks the current language, or an explicit one', () => {
    expect(tr(text)).toBe('Accepted');
    setLang('th');
    expect(tr(text)).toBe('รับแล้ว');
    expect(tr(text, 'en')).toBe('Accepted');
  });

  it('falls back to English when the Thai text is empty', () => {
    expect(tr({ en: 'Accepted', th: '' }, 'th')).toBe('Accepted');
  });
});

describe('language choice', () => {
  it('accepts only supported languages when read back from storage', () => {
    expect(parseLang('th')).toBe('th');
    expect(parseLang('en')).toBe('en');
    expect(parseLang('fr')).toBeNull();
    expect(parseLang(null)).toBeNull();
  });

  it('setLang updates getLang', () => {
    setLang('th');
    expect(getLang()).toBe('th');
  });
});
