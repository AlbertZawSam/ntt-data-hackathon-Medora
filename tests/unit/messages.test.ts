import { describe, expect, it } from 'vitest';

import en from '../../src/i18n/en.json';
import th from '../../src/i18n/th.json';
import { isQuickReplyKey, makeMessage, MAX_MESSAGE_LENGTH, messageTime, QUICK_REPLIES, threadOpen } from '../../src/logic/messages';

const NOW = Date.UTC(2026, 9, 14, 7, 5); // 14:05 Bangkok

describe('makeMessage', () => {
  it('stores a quick reply as its key', () => {
    expect(makeMessage('r1', 'patient', { key: 'runningLate' }, NOW)).toEqual({
      requestId: 'r1',
      from: 'patient',
      key: 'runningLate',
      createdAtMs: NOW,
    });
  });

  it("rejects the other side's quick replies and unknown keys", () => {
    expect(makeMessage('r1', 'patient', { key: 'bringId' }, NOW)).toBeNull();
    expect(makeMessage('r1', 'hospital', { key: 'pleaseCall' }, NOW)).toBeNull();
    expect(makeMessage('r1', 'hospital', { key: 'approveTransfer' }, NOW)).toBeNull();
  });

  it('trims free text and keeps it as written', () => {
    expect(makeMessage('r1', 'hospital', { text: '  Gate 3, please  ' }, NOW)?.text).toBe('Gate 3, please');
  });

  it('rejects empty text and text over 300 characters', () => {
    expect(makeMessage('r1', 'patient', { text: '   ' }, NOW)).toBeNull();
    expect(makeMessage('r1', 'patient', { text: 'a'.repeat(MAX_MESSAGE_LENGTH) }, NOW)).not.toBeNull();
    expect(makeMessage('r1', 'patient', { text: 'a'.repeat(MAX_MESSAGE_LENGTH + 1) }, NOW)).toBeNull();
  });
});

describe('threadOpen', () => {
  it('is open only while waiting or accepted', () => {
    expect(threadOpen('waiting')).toBe(true);
    expect(threadOpen('accepted')).toBe(true);
    for (const s of ['declined', 'no_reply', 'cancelled', 'withdrawn', 'completed'] as const) expect(threadOpen(s)).toBe(false);
  });
});

describe('quick replies', () => {
  it('match the spec for each side', () => {
    expect(QUICK_REPLIES.patient).toHaveLength(3);
    expect(QUICK_REPLIES.hospital).toHaveLength(5);
    expect(isQuickReplyKey('shortWait')).toBe(true);
    expect(isQuickReplyKey('hello')).toBe(false);
  });

  it('have English and Thai text for every key', () => {
    for (const key of [...QUICK_REPLIES.patient, ...QUICK_REPLIES.hospital]) {
      expect(en, key).toHaveProperty([`quick.${key}`]);
      expect(th, key).toHaveProperty([`quick.${key}`]);
    }
  });
});

describe('messageTime', () => {
  it('shows Bangkok time', () => {
    expect(messageTime(NOW)).toBe('14:05');
    expect(messageTime(Date.UTC(2026, 9, 14, 17, 0))).toBe('00:00');
  });
});
