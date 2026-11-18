/**
 * Clinic hours and appointment times in the reader's language: English reads a 12-hour clock ("1:30–4:30 PM"),
 * Thai the 24-hour clock with "น." ("13:30–16:30 น."). Weekday and month names come from the catalogues, so no
 * date library and no Intl dependence on the device.
 */
import { weekdayOf, type WeeklyHours } from '@medora/shared/logic/specialists';
import type { Lang, Params, StringKey } from './t';

type T = (key: StringKey, params?: Params) => string;

/** "13:30" as "1:30 PM" in English or "13:30 น." in Thai; `withPeriod` false drops the AM/PM or น. */
export function clockText(t: T, lang: Lang, time: string, withPeriod = true): string {
  if (lang !== 'en') return withPeriod ? t('hours.clock', { time }) : time;
  const hour = Number(time.slice(0, 2));
  const minutes = time.slice(3, 5);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return withPeriod ? `${twelve}:${minutes} ${t(hour < 12 ? 'hours.am' : 'hours.pm')}` : `${twelve}:${minutes}`;
}

/** "1:30–4:30 PM" (one period when both ends share it, "9:00 AM–12:00 PM" otherwise) or "13:30–16:30 น.". */
export function hoursText(t: T, lang: Lang, range: Pick<WeeklyHours, 'start' | 'end'>): string {
  const samePeriod = Number(range.start.slice(0, 2)) < 12 === Number(range.end.slice(0, 2)) < 12;
  const startPeriod = lang === 'en' && !samePeriod;
  return t('hours.range', { start: clockText(t, lang, range.start, startPeriod), end: clockText(t, lang, range.end) });
}

export function weekdayText(t: T, weekday: number): string {
  return t(`weekday.${weekday}` as StringKey);
}

/** One appointment as a person says it: "Monday 19 Oct, 1:30 PM" or "วันจันทร์ที่ 19 ต.ค. เวลา 13:30 น.". */
export function whenText(t: T, lang: Lang, slot: { day: string; time: string }): string {
  const [, month, date] = slot.day.split('-').map(Number);
  return t('hours.when', { day: weekdayText(t, weekdayOf(slot.day)), date: `${date} ${t(`month.${month}` as StringKey)}`, time: clockText(t, lang, slot.time) });
}
