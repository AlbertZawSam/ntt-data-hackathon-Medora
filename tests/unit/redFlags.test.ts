import { describe, expect, it } from 'vitest';

import { redFlagExamples, redFlagRules } from '../../src/logic/data';
import { normalize, redFlag } from '../../src/logic/redFlags';

const everyPhrase = redFlagRules.flatMap((rule) => rule.patterns.map((pattern) => ({ key: rule.key, pattern })));
const isThai = (s: string) => /[฀-๿]/.test(s);

describe('redFlag: every phrase in data/red_flags.json', () => {
  it.each(everyPhrase)('$key: "$pattern" on its own', ({ key, pattern }) => {
    expect(redFlag(pattern)?.key).toBe(key);
  });

  it.each(everyPhrase)('$key: "$pattern" inside a sentence', ({ key, pattern }) => {
    const sentence = isThai(pattern) ? `คุณแม่${pattern}ตั้งแต่เช้า` : `My mother has ${pattern} since this morning`;
    expect(redFlag(sentence)?.key).toBe(key);
  });

  it.each(everyPhrase.filter((p) => !isThai(p.pattern)))('$key: "$pattern" in capitals', ({ key, pattern }) => {
    expect(redFlag(pattern.toUpperCase())?.key).toBe(key);
  });

  it('covers both languages for every rule', () => {
    for (const rule of redFlagRules) {
      expect(rule.patterns.some(isThai), `${rule.key} has a Thai phrase`).toBe(true);
      expect(rule.patterns.some((p) => !isThai(p)), `${rule.key} has an English phrase`).toBe(true);
    }
  });
});

describe('redFlag: examples in data/red_flags.json', () => {
  it.each(redFlagExamples.emergency)('flags "%s"', (text) => {
    expect(redFlag(text)).not.toBeNull();
  });

  it.each(redFlagExamples.safe)('does not flag "%s"', (text) => {
    expect(redFlag(text)).toBeNull();
  });
});

describe('redFlag: more safe phrases', () => {
  it.each([
    'I have a mild headache',
    'My child has a cough and runny nose',
    'Need a check-up for my blood pressure',
    'Sprained my wrist playing football',
    'ปวดหัวเล็กน้อย',
    'ลูกไอและมีน้ำมูก',
    'ปวดฟันมาสองวัน',
    '',
    '   ',
  ])('does not flag "%s"', (text) => {
    expect(redFlag(text)).toBeNull();
  });
});

describe('redFlag: input that would otherwise hide a match', () => {
  it('matches a smart apostrophe from a phone keyboard', () => {
    expect(redFlag('I can’t breathe')?.key).toBe('breathing');
    expect(redFlag('He won’t stop bleeding')?.key).toBe('bleeding');
  });

  it('matches across line breaks and repeated spaces', () => {
    expect(redFlag('sudden\nchest   pain')?.key).toBe('chest');
  });

  it('matches Thai text with zero-width spaces', () => {
    expect(redFlag('เจ็บ​หน้า​อก')?.key).toBe('chest');
  });

  it('flags negated phrases rather than risk a miss', () => {
    expect(redFlag('no chest pain but feels dizzy')?.key).toBe('chest');
  });
});

describe('redFlag: result', () => {
  it('returns the label in both languages and the phrase that matched', () => {
    expect(redFlag('My dad had a seizure')).toEqual({
      key: 'seizure',
      label: { en: 'a seizure', th: 'อาการชัก' },
      pattern: 'seizure',
    });
  });

  it('accepts custom rules', () => {
    const rules = [{ key: 'test', label: { en: 'test', th: 'ทดสอบ' }, patterns: ['Purple Rash'] }];
    expect(redFlag('a purple rash appeared', rules)?.key).toBe('test');
    expect(redFlag('chest pain', rules)).toBeNull();
  });

  it('ignores an empty pattern instead of matching everything', () => {
    const rules = [{ key: 'empty', label: { en: '', th: '' }, patterns: [''] }];
    expect(redFlag('anything at all', rules)).toBeNull();
  });
});

describe('normalize', () => {
  it('lowercases, trims and folds apostrophes and spaces', () => {
    expect(normalize('  Can’T\tBreathe \n')).toBe("can't breathe");
  });
});
