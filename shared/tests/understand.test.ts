import data from '../data/red_flags.json';
import { cleanDescription, looksLikeNonsense, MAX_DESCRIPTION, parseUnderstanding, safetyGate, understandByRules } from '../logic/understand';

describe('safetyGate (layer 2)', () => {
  it('catches every emergency example in English and Thai', () => {
    for (const example of data.emergencyExamples) expect(safetyGate(example)).toMatchObject({ emergency: true });
  });

  it('lets every safe example through', () => {
    for (const example of data.safeExamples) expect(safetyGate(example)).toBeNull();
  });
});

describe('understandByRules', () => {
  it('uses the keyword rules and says so', () => {
    expect(understandByRules('my 3-year-old son has a fever')).toEqual({ emergency: false, need: 'child', source: 'rules' });
    expect(understandByRules('ข้อเท้าแพลงตอนวิ่ง')).toEqual({ emergency: false, need: 'injury', source: 'rules' });
  });
});

describe('parseUnderstanding', () => {
  it('reads a clean JSON answer', () => {
    expect(parseUnderstanding('{"need":"maternity","summary_en":"Pregnant, mild cramps","summary_th":"ตั้งครรภ์ ปวดท้องเล็กน้อย"}')).toEqual({
      emergency: false,
      need: 'maternity',
      summary: { en: 'Pregnant, mild cramps', th: 'ตั้งครรภ์ ปวดท้องเล็กน้อย' },
      source: 'ai',
    });
  });

  it('finds the JSON inside extra words', () => {
    expect(parseUnderstanding('Here you go: {"need":"injury","summary_en":"Sprained ankle","summary_th":"ข้อเท้าแพลง"} Thanks')?.emergency).toBe(false);
  });

  it('drops a summary that is missing a language', () => {
    expect(parseUnderstanding('{"need":"general","summary_en":"Headache"}')).toEqual({ emergency: false, need: 'general', source: 'ai' });
  });

  it('refuses unknown needs, emergencies claimed by the model, and non-JSON', () => {
    expect(parseUnderstanding('{"need":"stroke"}')).toBeNull();
    expect(parseUnderstanding('{"need":"emergency","emergency":true}')).toBeNull();
    expect(parseUnderstanding('I think it is a child problem')).toBeNull();
    expect(parseUnderstanding('{"need": child}')).toBeNull();
  });

  it('caps the summary length', () => {
    const long = 'a'.repeat(500);
    const parsed = parseUnderstanding(JSON.stringify({ need: 'general', summary_en: long, summary_th: long }));
    expect(parsed && !parsed.emergency && parsed.summary?.en.length).toBe(160);
  });
});

describe('cleanDescription', () => {
  it('trims, caps length and rejects non-text', () => {
    expect(cleanDescription('  fever  ')).toBe('fever');
    expect(cleanDescription('x'.repeat(5000))).toHaveLength(MAX_DESCRIPTION);
    expect(cleanDescription(42)).toBe('');
  });
});

describe('unclear descriptions', () => {
  it('catches text that cannot be a description, without a model', () => {
    for (const text of ['?', '123', 'a', 'aaaa', 'asdfgh', 'qwerty', 'zxcvbn', '!!!']) expect(looksLikeNonsense(text)).toBe(true);
    expect(understandByRules('asdfgh')).toMatchObject({ unclear: true });
  });
  it('never catches a real complaint, however short, in English or Thai', () => {
    for (const text of ['hurt', 'fall', 'flash burns', 'fever', 'I twisted my ankle', 'ปวดหัว', 'ไข้', 'ข้อเท้าพลิก', 'my child has a fever', 'help me please']) {
      expect(looksLikeNonsense(text)).toBe(false);
    }
    expect(understandByRules('I twisted my ankle').emergency === false && understandByRules('I twisted my ankle')).not.toHaveProperty('unclear');
  });
  it('reads the model answering "unclear" as general care marked unclear', () => {
    expect(parseUnderstanding('{"need":"unclear","summary_en":"Weather","summary_th":"อากาศ"}')).toEqual({ emergency: false, need: 'general', source: 'ai', unclear: true });
  });
});
