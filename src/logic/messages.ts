import { bangkokMinutes } from './ranking';
import type { Message, RequestStatus } from './types';

// Messages between a patient and a hospital about one request (requirement 7).

export const MAX_MESSAGE_LENGTH = 300;

export type Side = Message['from'];

// Stored as keys so each side reads them in its own language (requirement 7.3, 2.4).
export const QUICK_REPLIES = {
  patient: ['runningLate', 'whereDoIGo', 'pleaseCall'],
  hospital: ['emergencyEntrance', 'bringId', 'wellCall', 'ready', 'shortWait'],
} as const satisfies Record<Side, readonly string[]>;

export type QuickReplyKey = (typeof QUICK_REPLIES)[Side][number];

const ALL_KEYS = new Set<string>([...QUICK_REPLIES.patient, ...QUICK_REPLIES.hospital]);

export function isQuickReplyKey(key: string): key is QuickReplyKey {
  return ALL_KEYS.has(key);
}

// Both sides can write while the request is waiting or accepted (7.1); otherwise closed (7.4).
export function threadOpen(status: RequestStatus): boolean {
  return status === 'waiting' || status === 'accepted';
}

export type Draft = { key: string } | { text: string };
export type NewMessage = Omit<Message, 'id'>;

// A message ready to save, or null if it isn't allowed: an unknown or other side's quick
// reply, empty text, or text over 300 characters.
export function makeMessage(requestId: string, from: Side, draft: Draft, nowMs: number): NewMessage | null {
  if ('key' in draft) {
    if (!(QUICK_REPLIES[from] as readonly string[]).includes(draft.key)) return null;
    return { requestId, from, key: draft.key, createdAtMs: nowMs };
  }
  const text = draft.text.trim();
  if (!text || text.length > MAX_MESSAGE_LENGTH) return null;
  return { requestId, from, text, createdAtMs: nowMs };
}

// "14:05" in Bangkok time, whatever the device's time zone.
export function messageTime(ms: number): string {
  const m = bangkokMinutes(new Date(ms));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
