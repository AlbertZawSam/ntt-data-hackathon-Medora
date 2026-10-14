import { describe, expect, it } from 'vitest';

import { hospitals, pathways } from '../../src/logic/data';
import type { PathwayKey } from '../../src/logic/types';

// src/logic/data.ts casts the JSON to its types; these checks catch a seed file that drifts from them.

const PATHWAY_KEYS: PathwayKey[] = ['stroke', 'stemi', 'preterm', 'peds', 'maternity', 'injury', 'general'];

describe('data/hospitals.json', () => {
  it('has ten hospitals with unique IDs', () => {
    expect(hospitals).toHaveLength(10);
    expect(new Set(hospitals.map((h) => h.id)).size).toBe(10);
  });

  it.each(hospitals)('$id matches the Hospital type', (h) => {
    expect(h.name.en && h.name.th).toBeTruthy();
    // Inside greater Bangkok.
    expect(h.lat).toBeGreaterThan(13.4);
    expect(h.lat).toBeLessThan(14.1);
    expect(h.lng).toBeGreaterThan(100.2);
    expect(h.lng).toBeLessThan(100.95);
    expect(h.typicalWaitMin).toBeGreaterThanOrEqual(0);

    const s = h.status;
    expect(s.beds).toBeGreaterThanOrEqual(0);
    expect(s.beds).toBeLessThanOrEqual(h.totalBeds);
    expect(s.nicu).toBeLessThanOrEqual(h.nicuTotal);
    expect(typeof s.ageMin).toBe('number');
    expect(typeof s.conflict).toBe('boolean');
    for (const state of Object.values(s.depts)) expect(['open', 'diverting']).toContain(state);
    for (const v of [...Object.values(s.equip), ...Object.values(s.oncall)]) expect(typeof v).toBe('boolean');
    expect(s.rules.minBeds).toBeGreaterThanOrEqual(0);
  });
});

describe('data/pathways.json', () => {
  it('has exactly the known pathways', () => {
    expect(Object.keys(pathways).sort()).toEqual([...PATHWAY_KEYS].sort());
  });

  it.each(PATHWAY_KEYS)('%s matches the Pathway type', (key) => {
    const p = pathways[key];
    expect(p.name.en && p.name.th).toBeTruthy();
    expect(p.departments.length).toBeGreaterThan(0);
    expect(p.windowMin === null || p.windowMin > p.prepMin).toBe(true);
    expect(p.prepMin).toBeGreaterThanOrEqual(0);
  });
});
