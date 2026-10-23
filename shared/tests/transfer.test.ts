import { transferProgress } from '../logic/transfer';

describe('transferProgress', () => {
  const start = 1_000_000;

  it('moves from start to due over the drive time', () => {
    expect(transferProgress({ startedAt: start, etaMin: 10, status: 'in_progress' }, start)).toEqual({ fraction: 0, minutesLeft: 10, due: false });
    const half = transferProgress({ startedAt: start, etaMin: 10, status: 'in_progress' }, start + 5 * 60_000);
    expect(half.fraction).toBeCloseTo(0.5);
    expect(half.minutesLeft).toBe(5);
    expect(transferProgress({ startedAt: start, etaMin: 10, status: 'in_progress' }, start + 11 * 60_000)).toEqual({ fraction: 1, minutesLeft: 0, due: true });
  });

  it('rounds minutes left up and shows an arrived transfer as done', () => {
    expect(transferProgress({ startedAt: start, etaMin: 10, status: 'in_progress' }, start + 30_000).minutesLeft).toBe(10);
    expect(transferProgress({ startedAt: start, etaMin: 10, status: 'arrived' }, start)).toEqual({ fraction: 1, minutesLeft: 0, due: true });
  });

  it('never goes backwards for a clock behind the start', () => {
    expect(transferProgress({ startedAt: start, etaMin: 0, status: 'in_progress' }, start - 5_000).fraction).toBe(0);
  });
});
