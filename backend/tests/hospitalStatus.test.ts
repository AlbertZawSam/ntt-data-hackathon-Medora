import { writeHospitalStatus, type StatusModels } from '../amplify/lib/hospitalStatus';
import type { HospitalStatus } from '@medora/shared/logic/types';

const base = (beds: number): HospitalStatus =>
  ({ beds, nicu: 0, depts: { ed: 'open' }, equip: {}, oncall: {}, rules: {}, conflict: false, updatedAt: new Date().toISOString() }) as HospitalStatus;

/** A status row whose value can be changed by "someone else" between this Lambda's reads. */
function fakeStore(initial: HospitalStatus, opts: { meddle?: (readNo: number) => HospitalStatus | undefined } = {}) {
  let raw = JSON.stringify(initial);
  let reads = 0;
  const directory: Array<{ id: string; entry: string }> = [];
  const client: StatusModels = {
    models: {
      HospitalStatus: {
        get: async () => {
          reads += 1;
          const other = opts.meddle?.(reads);
          if (other) raw = JSON.stringify(other);
          return { data: { status: raw } };
        },
        update: async ({ status }) => {
          raw = status;
          return {};
        },
      },
      HospitalProfile: { get: async () => ({ data: { name: '{"en":"A","th":"ก"}', lat: 13.75, lng: 100.53, typicalWaitMin: 20 } }) },
      PublicDirectory: {
        update: async () => ({ data: null }),
        create: async (row) => {
          directory.push(row);
          return {};
        },
      },
    },
  };
  return { client, saved: () => JSON.parse(raw) as HospitalStatus, directory };
}

beforeEach(() => {
  for (const level of ['info', 'warn', 'error'] as const) jest.spyOn(console, level).mockImplementation(() => undefined);
});

describe('writeHospitalStatus', () => {
  it('saves the change and refreshes the public directory', async () => {
    const store = fakeStore(base(3));
    await writeHospitalStatus(store.client, 'H1', (s) => ({ ok: true, status: { ...s, beds: s.beds - 1 } }), 'test');
    expect(store.saved().beds).toBe(2);
    expect(store.directory).toHaveLength(1);
  });

  it("re-applies the change on top of someone else's newer save instead of overwriting it", async () => {
    // Between the first read and the check before saving, a nurse sets ready beds to 10.
    const store = fakeStore(base(3), { meddle: (n) => (n === 2 ? base(10) : undefined) });
    await writeHospitalStatus(store.client, 'H1', (s) => ({ ok: true, status: { ...s, beds: s.beds - 1 } }), 'test');
    expect(store.saved().beds).toBe(9); // 10 - 1, not 3 - 1
  });

  it('returns a refusal unchanged and saves nothing', async () => {
    const store = fakeStore(base(3));
    const result = await writeHospitalStatus(store.client, 'H1', () => ({ ok: false as const, reason: 'not-owner' }), 'test');
    expect(result).toEqual({ ok: false, reason: 'not-owner' });
    expect(store.saved().beds).toBe(3);
    expect(store.directory).toHaveLength(0);
  });

  it('gives up with "busy" when the status keeps changing', async () => {
    const store = fakeStore(base(3), { meddle: (n) => base(100 + n) });
    await expect(writeHospitalStatus(store.client, 'H1', (s) => ({ ok: true, status: s }), 'test')).rejects.toThrow('busy');
  });
});
