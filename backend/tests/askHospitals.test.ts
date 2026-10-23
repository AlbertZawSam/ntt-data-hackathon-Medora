import { DEMO_HOSPITALS, demoStatus } from '@medora/shared/logic/demoHospitals';
import type { CareRequest } from '@medora/shared/logic/types';
import { ReferralTools, type ReferralStore } from '../amplify/functions/agent-runner/tools';

const NOW = Date.parse('2026-01-01T10:00:00Z');

const hospitals = DEMO_HOSPITALS.map((h) => ({ id: h.key, name: h.name, lat: h.lat, lng: h.lng, typicalWaitMin: h.typicalWaitMin, status: demoStatus(h, NOW) }));

/** In-memory store. Every request starts `waiting`; `answerAfterReads` reads later, all of them are accepted. */
function makeStore(answerAfterReads: number | null) {
  const rows: CareRequest[] = [];
  let reads = 0;
  const store: ReferralStore = {
    hospitals: async () => hospitals,
    routeMinutes: async (_origin, destinations) => Object.fromEntries(destinations.map((d) => [d.id, 10])),
    requests: async () => {
      reads += 1;
      if (answerAfterReads !== null && reads >= answerAfterReads) rows.forEach((r) => { r.status = 'accepted'; });
      return rows;
    },
    createRequest: async (request) => {
      const row = { ...request, status: 'waiting', id: `r${rows.length + 1}` } as CareRequest;
      rows.push(row);
      return row;
    },
    updateRequest: async () => undefined,
    updateReferral: async () => undefined,
    trace: async () => undefined,
    activity: async () => undefined,
    knowledgeSearch: async () => [],
    demoHospitalKey: () => undefined,
    now: () => Date.now(),
  };
  return { store, reads: () => reads };
}

async function ask(answerAfterReads: number | null): Promise<{ settledAfterMs: number | null; reads: number }> {
  const { store, reads } = makeStore(answerAfterReads);
  const tools = new ReferralTools(
    { id: 'ref1', ownerId: 'd1', fromHospitalId: hospitals[0].id, text: 'case', lang: 'en', requestIds: [], startedAtMs: Date.now() },
    store,
  );
  const assessed = (await tools.execute('assess_case', { pathway: 'general' })) as { hospitals: Array<{ hospital_id: string; can_help: boolean }> };
  const ids = assessed.hospitals.filter((h) => h.can_help).slice(0, 2).map((h) => h.hospital_id);
  expect(ids.length).toBeGreaterThan(0);

  let settled = false;
  const done = tools.execute('ask_hospitals', { hospital_ids: ids, wait_seconds: 60 }).then(() => { settled = true; });
  let elapsed = 0;
  while (!settled && elapsed < 61_000) {
    await jest.advanceTimersByTimeAsync(1_000);
    elapsed += 1_000;
  }
  await done;
  return { settledAfterMs: settled ? elapsed : null, reads: reads() };
}

describe('ask_hospitals waiting', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  it('returns as soon as every hospital has answered, not after the full wait', async () => {
    const result = await ask(1);
    expect(result.settledAfterMs).not.toBeNull();
    expect(result.settledAfterMs as number).toBeLessThanOrEqual(3_000);
  });

  it('keeps waiting while a hospital has not answered, and stops at the policy limit', async () => {
    const result = await ask(null);
    expect(result.settledAfterMs).toBe(60_000);
  });
});
