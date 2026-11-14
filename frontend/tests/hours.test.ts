import { clockText, hoursText, whenText } from '../src/i18n/hours';
import { translate, type Lang, type Params, type StringKey } from '../src/i18n/t';

const tFor = (lang: Lang) => (key: StringKey, params?: Params) => translate(lang, key, params);

describe('clinic hours text', () => {
  it('reads a 12-hour clock in English and the 24-hour clock with น. in Thai', () => {
    expect(clockText(tFor('en'), 'en', '13:30')).toBe('1:30 PM');
    expect(clockText(tFor('en'), 'en', '00:15')).toBe('12:15 AM');
    expect(clockText(tFor('en'), 'en', '12:00')).toBe('12:00 PM');
    expect(clockText(tFor('th'), 'th', '13:30')).toBe('13:30 น.');
  });

  it('writes one range the way a clinic sign does', () => {
    expect(hoursText(tFor('en'), 'en', { start: '13:30', end: '16:30' })).toBe('1:30–4:30 PM');
    expect(hoursText(tFor('en'), 'en', { start: '09:00', end: '12:00' })).toBe('9:00 AM–12:00 PM');
    expect(hoursText(tFor('th'), 'th', { start: '13:30', end: '16:30' })).toBe('13:30–16:30 น.');
  });

  it('names one appointment with its weekday, date and time', () => {
    expect(whenText(tFor('en'), 'en', { day: '2026-10-19', time: '13:30' })).toBe('Monday 19 Oct, 1:30 PM');
    expect(whenText(tFor('th'), 'th', { day: '2026-10-19', time: '13:30' })).toBe('วันจันทร์ที่ 19 ต.ค. เวลา 13:30 น.');
  });
});
