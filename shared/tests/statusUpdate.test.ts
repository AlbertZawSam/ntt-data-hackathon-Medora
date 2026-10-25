import fc from 'fast-check';
import { UNITS, type Caller } from '../logic/access';
import { allControls, applyStatusChange, controlsForAdmin, controlsForUnit, itemId, ownerOfItem, ownerUnitOf, type StatusChange } from '../logic/statusUpdate';
import type { HospitalStatus } from '../logic/types';

const H1 = 'hosp-a';
const NOW = '2026-01-01T10:00:00.000Z';
const base = (): HospitalStatus => ({
  beds: 5,
  nicu: 2,
  depts: { ed: 'open', neuro: 'open' },
  equip: { ct: true, mri: true, cathlab: true },
  oncall: { neurologist: true },
  rules: { minBeds: 1 },
  conflict: false,
  updatedAt: '2026-01-01T08:00:00.000Z',
});
const nurse = (unit: string, hospitalId = H1): Caller => ({ groups: ['hospital_staff'], hospitalId, unit });
const apply = (change: StatusChange, caller: Caller, note?: string, hospital = H1) =>
  applyStatusChange(base(), change, caller, hospital, NOW, note);

describe('ownership', () => {
  it('assigns each item to its unit', () => {
    expect(ownerUnitOf({ kind: 'count', item: 'beds', value: 1 })).toBe('ward');
    expect(ownerUnitOf({ kind: 'count', item: 'icu', value: 1 })).toBe('icu');
    expect(ownerUnitOf({ kind: 'count', item: 'nicu', value: 1 })).toBe('nicu');
    expect(ownerUnitOf({ kind: 'dept', key: 'ed', value: 'open' })).toBe('er');
    expect(ownerUnitOf({ kind: 'equip', key: 'ct', value: true })).toBe('radiology');
    expect(ownerUnitOf({ kind: 'equip', key: 'cathlab', value: true })).toBe('cathlab');
    expect(ownerUnitOf({ kind: 'oncall', key: 'neurologist', value: true })).toBe('er');
  });

  it('refuses unknown items', () => {
    expect(ownerUnitOf({ kind: 'equip', key: 'laser', value: true })).toBeUndefined();
    expect(apply({ kind: 'equip', key: 'laser', value: true }, nurse('all'))).toEqual({ ok: false, reason: 'bad-change' });
  });
});

describe('applyStatusChange', () => {
  it('lets a ward nurse change ward beds and refreshes freshness', () => {
    const result = apply({ kind: 'count', item: 'beds', value: 7 }, nurse('ward'));
    expect(result.ok && result.status.beds).toBe(7);
    expect(result.ok && result.status.updatedAt).toBe(NOW);
    expect(result.ok && result.status.meta?.beds).toEqual({ unit: 'ward', at: NOW });
  });

  it('refuses a ward nurse for the CT, ICU or another hospital', () => {
    expect(apply({ kind: 'equip', key: 'ct', value: false }, nurse('ward'))).toEqual({ ok: false, reason: 'other-unit' });
    expect(apply({ kind: 'count', item: 'icu', value: 3 }, nurse('ward'))).toEqual({ ok: false, reason: 'other-unit' });
    expect(apply({ kind: 'count', item: 'beds', value: 3 }, nurse('ward', 'hosp-b'))).toEqual({ ok: false, reason: 'not-staff' });
  });

  it('lets a radiology technologist switch the CT down', () => {
    const result = apply({ kind: 'equip', key: 'ct', value: false }, nurse('radiology'));
    expect(result.ok && result.status.equip.ct).toBe(false);
  });

  it('refuses doctors and patients', () => {
    const change: StatusChange = { kind: 'count', item: 'beds', value: 1 };
    for (const groups of [['doctors'], ['patients'], []]) {
      expect(apply(change, { groups, hospitalId: H1, unit: 'ward' })).toEqual({ ok: false, reason: 'not-staff' });
    }
  });

  it('lets the all-units fallback change every item of its hospital only', () => {
    expect(apply({ kind: 'equip', key: 'mri', value: false }, nurse('all')).ok).toBe(true);
    expect(apply({ kind: 'equip', key: 'mri', value: false }, nurse('all', 'hosp-b')).ok).toBe(false);
  });

  it('keeps cath lab busy minutes only while the lab is busy', () => {
    const busy = apply({ kind: 'cathlabBusy', minutes: 20 }, nurse('cathlab'));
    expect(busy.ok && busy.status.cathlabBusyMin).toBe(20);
    const ready = applyStatusChange(
      busy.ok ? busy.status : base(),
      { kind: 'equip', key: 'cathlab', value: true },
      nurse('cathlab'),
      H1,
      NOW,
    );
    expect(ready.ok && ready.status.cathlabBusyMin).toBeUndefined();
  });

  it('validates values and notes', () => {
    expect(apply({ kind: 'count', item: 'beds', value: -1 }, nurse('ward'))).toEqual({ ok: false, reason: 'bad-change' });
    expect(apply({ kind: 'count', item: 'beds', value: 1.5 }, nurse('ward'))).toEqual({ ok: false, reason: 'bad-change' });
    expect(apply({ kind: 'cathlabBusy', minutes: 9999 }, nurse('cathlab'))).toEqual({ ok: false, reason: 'bad-change' });
    expect(apply({ kind: 'count', item: 'beds', value: 2 }, nurse('ward'), 'x'.repeat(101))).toEqual({ ok: false, reason: 'bad-note' });
    const withNote = apply({ kind: 'count', item: 'beds', value: 2 }, nurse('ward'), '  two beds closed ');
    expect(withNote.ok && withNote.status.notes?.beds).toBe('two beds closed');
  });

  it('"Still correct?" refreshes freshness for any unit staff without changing values', () => {
    const result = apply({ kind: 'confirm' }, nurse('icu'));
    expect(result.ok && result.status.updatedAt).toBe(NOW);
    expect(result.ok && result.status.beds).toBe(5);
    expect(result.ok && result.status.meta?.confirm).toEqual({ unit: 'icu', at: NOW });
    expect(apply({ kind: 'confirm' }, { groups: ['doctors'], hospitalId: H1 }).ok).toBe(false);
  });

  it('never modifies the input status', () => {
    const status = base();
    const copy = JSON.parse(JSON.stringify(status));
    applyStatusChange(status, { kind: 'count', item: 'beds', value: 9 }, nurse('ward'), H1, NOW);
    expect(status).toEqual(copy);
  });

  // Feature: hospital-referral-app, Property: a unit only ever changes its own items
  it('Property: every accepted change was made by the owning unit', () => {
    const changes: StatusChange[] = [
      { kind: 'count', item: 'beds', value: 3 },
      { kind: 'count', item: 'icu', value: 3 },
      { kind: 'count', item: 'nicu', value: 3 },
      { kind: 'dept', key: 'ed', value: 'diverting' },
      { kind: 'equip', key: 'ct', value: false },
      { kind: 'equip', key: 'cathlab', value: false },
      { kind: 'oncall', key: 'neurologist', value: false },
    ];
    fc.assert(
      fc.property(fc.constantFrom(...UNITS), fc.constantFrom(...changes), (unit, change) => {
        const result = apply(change, nurse(unit));
        expect(result.ok).toBe(ownerUnitOf(change) === unit);
        if (result.ok) expect(result.status.meta?.[itemId(change)]?.unit).toBe(unit);
      }),
    );
  });
});

describe('controlsForUnit', () => {
  it('shows only the unit’s own controls', () => {
    expect(controlsForUnit('ward').map((c) => c.id)).toEqual(['beds']);
    expect(controlsForUnit('radiology').map((c) => c.id)).toEqual(['equip:ct', 'equip:mri']);
    expect(controlsForUnit('cathlab').map((c) => c.kind)).toEqual(['cathlab']);
    expect(controlsForUnit('er').length).toBeGreaterThan(5);
  });

  it('shows everything to the fallback account and nothing to others', () => {
    expect(controlsForUnit('all').length).toBeGreaterThan(controlsForUnit('er').length);
    expect(controlsForUnit(undefined)).toEqual([]);
    expect(controlsForUnit('pharmacy')).toEqual([]);
  });

  it('gives each control a unique id', () => {
    const ids = controlsForUnit('all').map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('department staff', () => {
  it('own only their own equipment and cannot confirm the hospital status', () => {
    const changes: StatusChange[] = [
      { kind: 'count', item: 'beds', value: 3 },
      { kind: 'count', item: 'icu', value: 1 },
      { kind: 'dept', key: 'ed', value: 'diverting' },
      { kind: 'dept', key: 'neuro', value: 'diverting' },
      { kind: 'equip', key: 'ct', value: false },
      { kind: 'oncall', key: 'neurologist', value: false },
      { kind: 'confirm' },
    ];
    for (const unit of ['cardiology', 'surgery', 'obstetrics']) {
      for (const change of changes) expect(apply(change, nurse(unit)).ok).toBe(false);
      expect(controlsForUnit(unit).every((c) => c.kind === 'equip')).toBe(true);
    }
    // Cardiology switches its ECG, never Surgery's X-ray; the emergency unit owns the lab.
    expect(apply({ kind: 'equip', key: 'ecg', value: false }, nurse('cardiology')).ok).toBe(true);
    expect(apply({ kind: 'equip', key: 'xray', value: false }, nurse('cardiology'))).toEqual({ ok: false, reason: 'other-unit' });
    expect(apply({ kind: 'equip', key: 'xray', value: false }, nurse('surgery')).ok).toBe(true);
    expect(apply({ kind: 'equip', key: 'delivery', value: false }, nurse('obstetrics')).ok).toBe(true);
    expect(apply({ kind: 'equip', key: 'lab', value: false }, nurse('er')).ok).toBe(true);
    expect(controlsForUnit('surgery').map((c) => c.item)).toEqual(['xray', 'theatre']);
    expect(apply({ kind: 'confirm' }, nurse('ward')).ok).toBe(true);
  });
});

describe('hospital admin', () => {
  const admin = (hospitalId = H1): Caller => ({ groups: ['admins'], hospitalId });
  it('sets up beds, ICU, NICU and departments at their own hospital only', () => {
    expect(apply({ kind: 'count', item: 'beds', value: 12 }, admin()).ok).toBe(true);
    expect(apply({ kind: 'count', item: 'nicu', value: 3 }, admin()).ok).toBe(true);
    expect(apply({ kind: 'dept', key: 'cardio', value: 'diverting' }, admin()).ok).toBe(true);
    expect(apply({ kind: 'count', item: 'beds', value: 12 }, admin('hosp-b')).ok).toBe(false);
    expect(apply({ kind: 'count', item: 'beds', value: -1 }, admin()).ok).toBe(false);
  });
  it("doesn't switch equipment or on-duty doctors: those stay with the owning unit", () => {
    expect(apply({ kind: 'equip', key: 'ct', value: false }, admin()).ok).toBe(false);
    expect(apply({ kind: 'oncall', key: 'cardiologist', value: false }, admin()).ok).toBe(false);
  });
  it('assigns each item to a real unit, and the new owner is enforced', () => {
    const moved = applyStatusChange(base(), { kind: 'owner', item: 'equip:ct', unit: 'er' }, admin(), H1, NOW);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(ownerOfItem(moved.status, 'equip:ct')).toBe('er');
    expect(applyStatusChange(moved.status, { kind: 'equip', key: 'ct', value: false }, nurse('er'), H1, NOW).ok).toBe(true);
    expect(applyStatusChange(moved.status, { kind: 'equip', key: 'ct', value: false }, nurse('radiology'), H1, NOW)).toEqual({ ok: false, reason: 'other-unit' });
    expect(controlsForUnit('er', moved.status).some((c) => c.item === 'ct')).toBe(true);
    expect(controlsForUnit('radiology', moved.status).some((c) => c.item === 'ct')).toBe(false);
  });
  it('refuses unknown items, the all fallback as an owner, other hospitals and non-admins', () => {
    expect(apply({ kind: 'owner', item: 'equip:laser', unit: 'er' }, admin()).ok).toBe(false);
    expect(apply({ kind: 'owner', item: 'beds', unit: 'all' }, admin()).ok).toBe(false);
    expect(apply({ kind: 'owner', item: 'beds', unit: 'er' }, admin('hosp-b')).ok).toBe(false);
    expect(apply({ kind: 'owner', item: 'beds', unit: 'er' }, nurse('ward'))).toEqual({ ok: false, reason: 'not-staff' });
    expect(apply({ kind: 'owner', item: 'beds', unit: 'er' }, nurse('all'))).toEqual({ ok: false, reason: 'not-staff' });
  });
  it('gives departments only equipment, never confirms for the units, keeps freshness on an owner change', () => {
    expect(apply({ kind: 'owner', item: 'equip:ecg', unit: 'surgery' }, admin()).ok).toBe(true);
    expect(apply({ kind: 'owner', item: 'beds', unit: 'cardiology' }, admin()).ok).toBe(false);
    expect(apply({ kind: 'owner', item: 'dept:ed', unit: 'surgery' }, admin()).ok).toBe(false);
    expect(apply({ kind: 'confirm' }, admin()).ok).toBe(false);
    const moved = applyStatusChange(base(), { kind: 'owner', item: 'beds', unit: 'er' }, admin(), H1, NOW);
    expect(moved.ok && moved.status.updatedAt).toBe(base().updatedAt);
  });
  it('ignores prototype keys as items and as stored owners', () => {
    expect(apply({ kind: 'owner', item: '__proto__', unit: 'er' }, admin()).ok).toBe(false);
    expect(apply({ kind: 'owner', item: 'constructor', unit: 'er' }, admin()).ok).toBe(false);
    const tricked = { ...base(), owners: JSON.parse('{"__proto__":"er","constructor":"er"}') } as HospitalStatus;
    expect(ownerOfItem(tricked, 'beds')).toBe('ward');
    expect(applyStatusChange(tricked, { kind: 'count', item: 'beds', value: 3 }, nurse('ward'), H1, NOW).ok).toBe(true);
  });
  it('lists set-up controls for the admin and every control for the ownership screen', () => {
    expect(controlsForAdmin().every((c) => c.kind === 'count' || c.kind === 'dept')).toBe(true);
    expect(allControls().length).toBeGreaterThan(controlsForAdmin().length);
  });
});
