import { DEMO_HOSPITALS, demoStatus } from '@medora/shared/logic/demoHospitals';
import type { CareRequest } from '@medora/shared/logic/types';
import { ReferralTools, type ReferralStore } from '../amplify/functions/agent-runner/tools';

const NOW = Date.parse('2026-01-01T10:00:00Z');

const hospitals = DEMO_HOSPITALS.map((h) => ({ id: h.key, name: h.name, lat: h.lat, lng: h.lng, typicalWaitMin: h.typicalWaitMin, status: demoStatus(h, NOW) }));

/** In-memory store. Every request starts `waiting`; `answerAfterReads` reads later, all of them are accepted. */
function makeStore(answerAfterReads: number | null, kb: Array<{ hospitalId: string; text: string; source: string }> = [], note?: string) {
  const rows: CareRequest[] = [];
  const updates: Array<Record<string, unknown>> = [];
  let reads = 0;
  const store: ReferralStore = {
    hospitals: async () => hospitals,
    routeMinutes: async (_origin, destinations) => Object.fromEntries(destinations.map((d) => [d.id, 10])),
    requests: async () => {
      reads += 1;
      if (answerAfterReads !== null && reads >= answerAfterReads) {
        rows.forEach((r) => {
          r.status = 'accepted';
          if (note) r.note = note;
        });
      }
      return rows;
    },
    createRequest: async (request) => {
      const row = { ...request, status: 'waiting', id: `r${rows.length + 1}` } as CareRequest;
      rows.push(row);
      return row;
    },
    updateRequest: async () => undefined,
    updateReferral: async (_id, changes) => {
      updates.push(changes);
    },
    trace: async () => undefined,
    activity: async () => undefined,
    knowledgeSearch: async () => kb,
    demoHospitalKey: () => undefined,
    now: () => Date.now(),
  };
  return { store, reads: () => reads, updates };
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

describe('report_no_placement', () => {
  const start = async () => {
    const { store, updates } = makeStore(null);
    const tools = new ReferralTools({ id: 'ref1', ownerId: 'd1', fromHospitalId: hospitals[0].id, text: 'case', lang: 'en', requestIds: [], startedAtMs: Date.now() }, store);
    const assessed = (await tools.execute('assess_case', { pathway: 'general' })) as { hospitals: Array<{ hospital_id: string; can_help: boolean }> };
    return { tools, updates, ids: assessed.hospitals.filter((h) => h.can_help).map((h) => h.hospital_id) };
  };
  const reasons = { reason_en: 'Nobody could take the patient.', reason_th: 'ไม่มีโรงพยาบาลรับผู้ป่วย' };

  it('refuses to give up before asking hospitals that can help, and leaves the referral open', async () => {
    const { tools, updates, ids } = await start();
    expect(ids.length).toBeGreaterThan(0);
    const result = await tools.execute('report_no_placement', reasons);
    expect(result).toMatchObject({ ok: false });
    expect(String(result.error)).toContain('ask_hospitals');
    expect(updates.some((u) => u.status === 'failed')).toBe(false);
  });

  it('lets our own failure paths close the referral even before anyone was asked, which the model cannot do', async () => {
    const { tools, updates, ids } = await start();
    expect(ids.length).toBeGreaterThan(0);
    await tools.failClosed('The coordinator is unavailable.', 'ระบบไม่พร้อมใช้งาน');
    expect(updates.some((u) => u.status === 'failed')).toBe(true);
  });

  it('accepts a no-placement report once the hospitals have been asked', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    try {
      const { tools, updates, ids } = await start();
      const asking = tools.execute('ask_hospitals', { hospital_ids: ids.slice(0, 1), wait_seconds: 5 });
      await jest.advanceTimersByTimeAsync(10_000);
      await asking;
      expect(await tools.execute('report_no_placement', reasons)).toEqual({ ok: true });
      expect(updates.some((u) => u.status === 'failed')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('search_knowledge_base', () => {
  it('hands the model a short list with a next step, and keeps full sources in the trace', async () => {
    const kb = Array.from({ length: 10 }, (_, i) => ({ hospitalId: hospitals[i % hospitals.length].id, source: `s3://b/${i}.md`, text: 'x'.repeat(500) }));
    const { store } = makeStore(null, kb);
    const traces: Array<{ kind: string; detail: { en: string } }> = [];
    store.trace = async (kind, _title, detail) => {
      traces.push({ kind, detail });
    };
    const tools = new ReferralTools({ id: 'ref1', ownerId: 'd1', fromHospitalId: hospitals[0].id, text: 'case', lang: 'en', requestIds: [], startedAtMs: Date.now() }, store);
    await tools.execute('assess_case', { pathway: 'general' });
    const result = (await tools.execute('search_knowledge_base', { query: 'stroke neurology CT scanner' })) as { ok: boolean; matches: Array<{ excerpt: string }>; next: string };
    expect(result.ok).toBe(true);
    expect(result.matches).toHaveLength(5);
    expect(Math.max(...result.matches.map((m) => m.excerpt.length))).toBeLessThanOrEqual(160);
    expect(result.next).toContain('ask_hospitals');
    expect(traces.find((t) => t.kind === 'search_knowledge_base')?.detail.en).toContain('10 source document(s)');
  });
  it('says to assess the case first when it is searched before assess_case', async () => {
    const { store } = makeStore(null, [{ hospitalId: 'H1', source: 's3://b/a.md', text: 'doc' }]);
    const tools = new ReferralTools({ id: 'ref1', ownerId: 'd1', fromHospitalId: hospitals[0].id, text: 'case', lang: 'en', requestIds: [], startedAtMs: Date.now() }, store);
    const result = (await tools.execute('search_knowledge_base', { query: 'stroke' })) as { next: string };
    expect(result.next).toContain('assess_case');
  });
});

describe('rule-based backup', () => {
  const run = async (pathway: 'general' | 'stroke', onsetMin: number | undefined, note?: string) => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    try {
      const { store, updates } = makeStore(1, [], note);
      const tools = new ReferralTools(
        { id: 'ref1', ownerId: 'd1', fromHospitalId: 'thonburi', text: 'case', lang: 'en', ...(onsetMin !== undefined ? { onsetMin } : {}), requestIds: [], startedAtMs: Date.now() },
        store,
      );
      const assessed = (await tools.execute('assess_case', { pathway })) as { hospitals: Array<{ hospital_id: string; can_help: boolean }> };
      const ids = assessed.hospitals.filter((h) => h.can_help).slice(0, 1).map((h) => h.hospital_id);
      expect(ids.length).toBeGreaterThan(0);
      // The model path asked a hospital and it accepted, then the model stopped before recommending.
      const asking = tools.execute('ask_hospitals', { hospital_ids: ids, wait_seconds: 5 });
      await jest.advanceTimersByTimeAsync(10_000);
      await asking;
      const backup = tools.ruleBasedBackup();
      await jest.advanceTimersByTimeAsync(10_000);
      await backup;
      return { ids, updates };
    } finally {
      jest.useRealTimers();
    }
  };

  it('recommends a hospital that already accepted instead of reporting no placement', async () => {
    const { ids, updates } = await run('general', undefined);
    const final = updates.filter((u) => u.status).at(-1);
    expect(final).toMatchObject({ status: 'awaiting', chosenId: ids[0] });
  });

  it('reports no placement, and closes the referral, when the accepted hospital has a delay that breaks the window', async () => {
    const { updates } = await run('stroke', 200, 'Neurologist free in about 40 minutes');
    const final = updates.filter((u) => u.status).at(-1);
    expect(final).toMatchObject({ status: 'failed' });
  });
});
