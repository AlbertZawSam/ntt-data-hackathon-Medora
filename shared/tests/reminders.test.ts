import { isStatusUnclear, reminderState } from '../logic/reminders';
import { NOW_MS, minutesAgo, openStatus } from './generators';

const at = (min: number) => openStatus({ updatedAt: minutesAgo(min) });

describe('reminderState', () => {
  it('is fresh for the first 30 minutes', () => {
    expect(reminderState(at(5), NOW_MS)).toBe('fresh');
    expect(reminderState(at(29), NOW_MS)).toBe('fresh');
  });
  it('reminds the unit owners after 30 minutes', () => {
    expect(reminderState(at(30), NOW_MS)).toBe('remind');
    expect(reminderState(at(119), NOW_MS)).toBe('remind');
  });
  it('alerts the admin after two hours', () => {
    expect(reminderState(at(120), NOW_MS)).toBe('adminAlert');
    expect(isStatusUnclear(at(120), NOW_MS)).toBe(true);
    expect(isStatusUnclear(at(60), NOW_MS)).toBe(false);
  });
  it('uses a 30 second reminder in the demo stage', () => {
    const status = openStatus({ updatedAt: new Date(NOW_MS - 45_000).toISOString() });
    expect(reminderState(status, NOW_MS)).toBe('fresh');
    expect(reminderState(status, NOW_MS, { demo: true })).toBe('remind');
  });
  it('treats a status that was never confirmed as needing the admin alert', () => {
    expect(reminderState(openStatus({ updatedAt: new Date(0).toISOString() }), NOW_MS)).toBe('adminAlert');
  });
});
