import type { StringKey } from './t';

/** Free beds as patients see them: the exact count (team decision, AGENTS.md rule 6), or "No free beds". */
export function bedsText(t: (key: StringKey, vars?: Record<string, string | number>) => string, count: number): string {
  if (count <= 0) return t('details.bedsFree.none');
  return count === 1 ? t('details.freeBed') : t('details.freeBeds', { count });
}

/** Badge colour for a free-bed count: none, one or two (running low), or more. */
export function bedsTone(count: number): 'danger' | 'warning' | 'success' {
  return count <= 0 ? 'danger' : count <= 2 ? 'warning' : 'success';
}
