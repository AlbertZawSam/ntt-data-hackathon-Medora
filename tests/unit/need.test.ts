import { describe, expect, it } from 'vitest';

import { redFlagExamples } from '../../src/logic/data';
import { classifyNeed } from '../../src/logic/need';

describe('classifyNeed', () => {
  it('classifies the safe examples from red_flags.json', () => {
    const expected: Record<string, string> = {
      "I'm 30 weeks pregnant with mild cramps": 'maternity',
      'My 6-year-old has a 39°C fever': 'peds',
      "Twisted my ankle, it's swollen": 'injury',
      'ข้อเท้าแพลง บวมมาก': 'injury',
      'ลูกอายุ 6 ขวบ มีไข้ 39 องศา': 'peds',
    };
    for (const text of redFlagExamples.safe) expect(classifyNeed(text), text).toBe(expected[text]);
  });

  it.each([
    ['My waters broke an hour ago', 'maternity'],
    ['ตั้งครรภ์ 8 เดือน เจ็บท้องคลอด', 'maternity'],
    ['My baby is coming early', 'maternity'],
    ['My daughter has been vomiting since morning', 'peds'],
    ['ทารกอายุ 3 เดือนไม่ยอมกินนม', 'peds'],
    ['I had a fall', 'injury'],
    ['I think my wrist is broken', 'injury'],
    ['หกล้มเข่าเป็นแผล', 'injury'],
    ['Bad cough and sore throat for three days', 'general'],
    ['ไอ เจ็บคอ มีไข้', 'general'],
  ])('%s → %s', (text, need) => {
    expect(classifyNeed(text)).toBe(need);
  });

  it('reads an age as a child only under 15', () => {
    expect(classifyNeed('My 3 year old has a rash')).toBe('peds');
    expect(classifyNeed('my 9-month-old won’t stop crying')).toBe('peds');
    expect(classifyNeed('My 40-year-old wife broke her leg')).toBe('injury');
    expect(classifyNeed('My 70 year old father has a fever')).toBe('general');
  });

  it('does not read stomach ache in Thai as pregnancy', () => {
    expect(classifyNeed('ปวดท้องมาก')).toBe('general');
  });

  it('does not read heartburn as a burn injury', () => {
    expect(classifyNeed('I have heartburn after dinner')).toBe('general');
  });

  it('falls back to general for empty text', () => {
    expect(classifyNeed('')).toBe('general');
  });
});
