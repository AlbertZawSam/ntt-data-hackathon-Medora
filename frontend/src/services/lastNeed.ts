/** The need from the last Find care search, so Find a specialist can suggest a specialty (requirement 8.2). Kept in memory only. */
let lastNeed = 'general';

export function setLastNeed(need: string): void {
  lastNeed = need;
}

export function getLastNeed(): string {
  return lastNeed;
}
