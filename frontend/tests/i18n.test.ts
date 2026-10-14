import en from '../src/i18n/en.json';
import th from '../src/i18n/th.json';
import { failureText, pick, translate } from '../src/i18n/t';

const placeholders = (s: string): string[] => [...s.matchAll(/{{(\w+)}}/g)].map((m) => m[1]).sort();

describe('string catalogues', () => {
  it('have the same keys in English and Thai', () => {
    expect(Object.keys(th).sort()).toEqual(Object.keys(en).sort());
  });

  it.each(Object.keys(en))('"%s" is non-empty in both languages with matching placeholders', (key) => {
    const e = (en as Record<string, string>)[key];
    const t = (th as Record<string, string>)[key];
    expect(e.trim()).not.toBe('');
    expect(t.trim()).not.toBe('');
    expect(placeholders(t)).toEqual(placeholders(e));
  });
});

describe('translate', () => {
  it('returns the string in the requested language', () => {
    expect(translate('en', 'emergency.call1669')).toBe('Call 1669');
    expect(translate('th', 'emergency.call1669')).toBe('โทร 1669');
  });

  it('fills placeholders', () => {
    expect(translate('en', 'patient.care.skippedBecause', { reason: 'No free beds' })).toBe(
      'Skipped because: No free beds',
    );
  });

  it('never returns an empty string', () => {
    for (const key of Object.keys(en)) {
      expect(translate('th', key)).not.toBe('');
      expect(translate('en', key)).not.toBe('');
    }
  });
});

describe('pick and failureText', () => {
  it('picks bilingual text with English fallback', () => {
    expect(pick({ en: 'Hello', th: 'สวัสดี' }, 'th')).toBe('สวัสดี');
    expect(pick({ en: 'Hello', th: '' }, 'th')).toBe('Hello');
  });

  it('describes failures with translated item names', () => {
    expect(failureText({ kind: 'equip', item: 'ct' }, 'en')).toBe("CT scanner isn't working");
    expect(failureText({ kind: 'onDuty', item: 'neurologist' }, 'th')).toBe('ไม่มีแพทย์ระบบประสาทประจำการ');
    expect(failureText({ kind: 'dept', item: 'unknown' }, 'en')).toBe("unknown isn't open");
    expect(failureText({ kind: 'beds' }, 'en')).toBe('No free beds');
  });
});
