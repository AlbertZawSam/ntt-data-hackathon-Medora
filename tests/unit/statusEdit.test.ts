import { describe, expect, it } from 'vitest';

import en from '../../src/i18n/en.json';
import { hospitals } from '../../src/logic/data';
import { setBeds, setNicu, toggleDept, toggleEquip, toggleOncall } from '../../src/logic/statusEdit';

const NOW = Date.UTC(2026, 9, 14, 5);
const h02 = hospitals.find((h) => h.id === 'H02')!;
const h03 = hospitals.find((h) => h.id === 'H03')!;

describe('setBeds and setNicu', () => {
  it('sets the count and stamps the time', () => {
    const next = setBeds(h02, h02.status, 7, NOW);
    expect(next.beds).toBe(7);
    expect(next.updatedAt).toBe(NOW);
  });

  it('keeps counts between 0 and the hospital total', () => {
    expect(setBeds(h02, h02.status, -1, NOW).beds).toBe(0);
    expect(setBeds(h02, h02.status, 999, NOW).beds).toBe(h02.totalBeds);
    expect(setNicu(h02, h02.status, 1, NOW).nicu).toBe(0); // H02 has no NICU
    expect(setNicu(h03, h03.status, 99, NOW).nicu).toBe(h03.nicuTotal);
  });

  it('does not modify the original status', () => {
    const before = JSON.stringify(h02.status);
    setBeds(h02, h02.status, 1, NOW);
    expect(JSON.stringify(h02.status)).toBe(before);
  });
});

describe('toggles', () => {
  it('switches a department between open and diverting', () => {
    const diverting = toggleDept(h02.status, 'neuro', NOW);
    expect(diverting.depts.neuro).toBe('diverting');
    expect(diverting.updatedAt).toBe(NOW);
    expect(toggleDept(diverting, 'neuro', NOW).depts.neuro).toBe('open');
  });

  it('switches equipment and on-call doctors', () => {
    expect(toggleEquip(h02.status, 'ct', NOW).equip.ct).toBe(false);
    expect(toggleOncall(h02.status, 'neurologist', NOW).oncall.neurologist).toBe(false);
  });

  it('ignores items the hospital does not have', () => {
    expect(toggleDept(h02.status, 'obstetrics', NOW)).toBe(h02.status);
    expect(toggleEquip(h02.status, 'xray', NOW)).toBe(h02.status);
    expect(toggleOncall(h02.status, 'obstetrician', NOW)).toBe(h02.status);
  });
});

describe('status board labels', () => {
  it('has a string for every department, equipment item and doctor in the data', () => {
    const keys = new Set(Object.keys(en));
    for (const h of hospitals) {
      for (const k of Object.keys(h.status.depts)) expect(keys.has(`dept.${k}`), `dept.${k}`).toBe(true);
      for (const k of Object.keys(h.status.equip)) expect(keys.has(`equip.${k}`), `equip.${k}`).toBe(true);
      for (const k of Object.keys(h.status.oncall)) expect(keys.has(`oncall.${k}`), `oncall.${k}`).toBe(true);
    }
  });
});
