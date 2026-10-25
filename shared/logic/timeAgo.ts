/**
 * How long ago something happened, in the unit people read naturally: "just now", minutes under an
 * hour, hours under a day, then days. Pure TypeScript; the app turns it into words in each language.
 */
export type AgoUnit = 'now' | 'min' | 'hour' | 'day';

export function timeAgo(atMs: number, nowMs: number): { unit: AgoUnit; n: number } {
  const min = Math.max(0, Math.floor((nowMs - atMs) / 60_000));
  if (min < 1) return { unit: 'now', n: 0 };
  if (min < 60) return { unit: 'min', n: min };
  const hours = Math.floor(min / 60);
  if (hours < 24) return { unit: 'hour', n: hours };
  return { unit: 'day', n: Math.floor(hours / 24) };
}
