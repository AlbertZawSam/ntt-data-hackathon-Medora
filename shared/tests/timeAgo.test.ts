import { timeAgo } from '../logic/timeAgo';

describe('timeAgo', () => {
  const now = 1_000_000_000_000;
  const ago = (min: number) => timeAgo(now - min * 60_000, now);
  it('uses minutes under an hour, hours under a day, then days', () => {
    expect(ago(0.5)).toEqual({ unit: 'now', n: 0 });
    expect(ago(2)).toEqual({ unit: 'min', n: 2 });
    expect(ago(59)).toEqual({ unit: 'min', n: 59 });
    expect(ago(60)).toEqual({ unit: 'hour', n: 1 });
    expect(ago(568)).toEqual({ unit: 'hour', n: 9 });
    expect(ago(60 * 24 * 3 + 5)).toEqual({ unit: 'day', n: 3 });
  });
  it('never goes negative for a clock slightly behind', () => {
    expect(timeAgo(now + 5_000, now)).toEqual({ unit: 'now', n: 0 });
  });
});
