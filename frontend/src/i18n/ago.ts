/** "just now", "5 min ago", "9 hours ago", "2 days ago" in the reader's language. */
import { timeAgo } from '@medora/shared/logic/timeAgo';
import type { Params, StringKey } from './t';

export function agoText(t: (key: StringKey, params?: Params) => string, atMs: number, nowMs: number): string {
  const { unit, n } = timeAgo(atMs, nowMs);
  if (unit === 'now') return t('time.justNow');
  if (unit === 'min') return t('time.minAgo', { n });
  if (unit === 'hour') return t(n === 1 ? 'time.hourAgo' : 'time.hoursAgo', { n });
  return t(n === 1 ? 'time.dayAgo' : 'time.daysAgo', { n });
}
