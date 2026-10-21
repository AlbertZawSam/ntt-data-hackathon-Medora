/**
 * Unit-scoped changes to a hospital's live status: which unit owns each item, what a "My unit"
 * screen shows, and the single function the server uses to apply (or refuse) a change.
 * Pure TypeScript, so the screen and the `update-status` Lambda follow exactly the same rules.
 * Requirements: 9.1 to 9.4, 19.1, 19.2, 19.8, 19.10
 */
import { ALL_UNITS, DEFAULT_OWNER_UNIT, DEFAULT_SPECIALIST_UNIT, canUpdateStatusItem, isUnit, type Caller, type Unit } from './access';
import type { DeptState, HospitalStatus } from './types';

export const DEPT_KEYS = ['ed', 'neuro', 'cardio', 'obstetrics', 'pediatrics', 'ortho'] as const;
export const EQUIP_KEYS = ['ct', 'mri', 'cathlab'] as const;
export const ONCALL_KEYS = ['er', 'neurologist', 'cardiologist', 'obstetrician', 'pediatrician', 'orthopedist'] as const;
export const COUNT_ITEMS = ['beds', 'icu', 'nicu'] as const;

export const MAX_COUNT = 5000;
export const MAX_NOTE = 100;
export const MAX_BUSY_MIN = 480;

export type CountItem = (typeof COUNT_ITEMS)[number];

export type StatusChange =
  | { kind: 'count'; item: CountItem; value: number }
  | { kind: 'dept'; key: string; value: DeptState }
  | { kind: 'equip'; key: string; value: boolean }
  | { kind: 'oncall'; key: string; value: boolean }
  | { kind: 'cathlabBusy'; minutes: number | null }
  /** "Still correct?": the unit confirms the status as it is. */
  | { kind: 'confirm' };

const includes = (list: readonly string[], value: unknown): boolean => typeof value === 'string' && list.includes(value);

/** Stable id of the item a change touches; notes and freshness are stored under it. */
export function itemId(change: StatusChange): string {
  switch (change.kind) {
    case 'count':
      return change.item;
    case 'dept':
      return `dept:${change.key}`;
    case 'equip':
      return `equip:${change.key}`;
    case 'oncall':
      return `oncall:${change.key}`;
    case 'cathlabBusy':
      return 'equip:cathlab';
    case 'confirm':
      return 'confirm';
  }
}

/** The unit that owns the item a change touches, or `undefined` for an unknown item. */
export function ownerUnitOf(change: StatusChange): Unit | undefined {
  switch (change.kind) {
    case 'count':
      return includes(COUNT_ITEMS, change.item) ? DEFAULT_OWNER_UNIT[change.item] : undefined;
    case 'dept':
      if (!includes(DEPT_KEYS, change.key)) return undefined;
      return change.key === 'ed' ? DEFAULT_OWNER_UNIT.ed : DEFAULT_SPECIALIST_UNIT;
    case 'equip':
      if (!includes(EQUIP_KEYS, change.key)) return undefined;
      return DEFAULT_OWNER_UNIT[change.key as 'ct' | 'mri' | 'cathlab'];
    case 'oncall':
      return includes(ONCALL_KEYS, change.key) ? DEFAULT_SPECIALIST_UNIT : undefined;
    case 'cathlabBusy':
      return DEFAULT_OWNER_UNIT.cathlab;
    case 'confirm':
      return undefined;
  }
}

export type StatusChangeResult =
  | { ok: true; status: HospitalStatus }
  | { ok: false; reason: 'not-staff' | 'other-unit' | 'bad-change' | 'bad-note' };

const isCount = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;

/**
 * Applies one change made by unit staff. The caller must be staff of this hospital and own the item
 * (or hold the demo-fallback `all` unit). Any accepted change, and "Still correct?", refreshes the
 * freshness time. The input status is never modified.
 */
export function applyStatusChange(
  status: HospitalStatus,
  change: StatusChange,
  caller: Caller,
  hospitalId: string,
  nowIso: string,
  rawNote?: string,
): StatusChangeResult {
  const note = rawNote === undefined ? undefined : rawNote.trim();
  if (note !== undefined && note.length > MAX_NOTE) return { ok: false, reason: 'bad-note' };

  const id = itemId(change);
  const confirming = change.kind === 'confirm';
  const owner = confirming ? undefined : ownerUnitOf(change);
  if (!confirming && owner === undefined) return { ok: false, reason: 'bad-change' };

  // "Still correct?" needs no particular unit, only an account of this hospital's unit staff.
  const allowed = confirming
    ? canUpdateStatusItem(caller, { hospitalId, ownerUnit: isUnit(caller.unit) ? caller.unit : DEFAULT_OWNER_UNIT.beds }) ||
      canUpdateStatusItem(caller, { hospitalId, ownerUnit: ALL_UNITS })
    : canUpdateStatusItem(caller, { hospitalId, ownerUnit: owner as Unit });
  if (!allowed) {
    const isStaff = caller.groups.includes('hospital_staff') && caller.hospitalId === hospitalId;
    return { ok: false, reason: isStaff ? 'other-unit' : 'not-staff' };
  }

  const next: HospitalStatus = {
    ...status,
    depts: { ...status.depts },
    equip: { ...status.equip },
    oncall: { ...status.oncall },
    notes: { ...status.notes },
    meta: { ...status.meta },
    updatedAt: nowIso,
  };

  switch (change.kind) {
    case 'count':
      if (!isCount(change.value, MAX_COUNT)) return { ok: false, reason: 'bad-change' };
      next[change.item] = change.value;
      break;
    case 'dept':
      if (change.value !== 'open' && change.value !== 'diverting') return { ok: false, reason: 'bad-change' };
      next.depts[change.key] = change.value;
      break;
    case 'equip':
      if (typeof change.value !== 'boolean') return { ok: false, reason: 'bad-change' };
      next.equip[change.key] = change.value;
      if (change.key === 'cathlab') delete next.cathlabBusyMin; // a ready or down lab is not "busy"
      break;
    case 'oncall':
      if (typeof change.value !== 'boolean') return { ok: false, reason: 'bad-change' };
      next.oncall[change.key] = change.value;
      break;
    case 'cathlabBusy':
      if (change.minutes === null) delete next.cathlabBusyMin;
      else if (isCount(change.minutes, MAX_BUSY_MIN)) next.cathlabBusyMin = change.minutes;
      else return { ok: false, reason: 'bad-change' };
      break;
    case 'confirm':
      break;
  }

  if (confirming) {
    // Recorded per unit so the log shows who confirmed. A confirmation refreshes the whole status's
    // freshness time (one `updatedAt` per hospital): the ward can't change the CT, but can say the data is current.
    next.meta!['confirm'] = { unit: isUnit(caller.unit) ? caller.unit : ALL_UNITS, at: nowIso };
  } else {
    const unit = isUnit(caller.unit) ? caller.unit : (owner as Unit);
    next.meta![id] = { unit, at: nowIso };
    if (note) next.notes![id] = note;
    else if (note === '') delete next.notes![id];
  }
  return { ok: true, status: next };
}

/** One control on the "My unit" screen. `labelKey` is a string-catalogue key. */
export interface UnitControl {
  id: string;
  kind: 'count' | 'dept' | 'equip' | 'oncall' | 'cathlab';
  item: string;
  labelKey: string;
}

const control = (kind: UnitControl['kind'], item: string, labelKey: string): UnitControl => ({
  id: kind === 'count' ? item : `${kind}:${item}`,
  kind,
  item,
  labelKey,
});

const ALL_CONTROLS: Array<{ unit: Unit; control: UnitControl }> = [
  { unit: 'ward', control: control('count', 'beds', 'unit.beds') },
  { unit: 'icu', control: control('count', 'icu', 'unit.icu') },
  { unit: 'nicu', control: control('count', 'nicu', 'unit.nicu') },
  { unit: 'er', control: control('dept', 'ed', 'item.ed') },
  ...DEPT_KEYS.filter((k) => k !== 'ed').map((k) => ({ unit: 'er' as Unit, control: control('dept', k, `item.${k}`) })),
  ...ONCALL_KEYS.map((k) => ({ unit: 'er' as Unit, control: control('oncall', k, `item.${k === 'er' ? 'er' : k}`) })),
  { unit: 'radiology', control: control('equip', 'ct', 'item.ct') },
  { unit: 'radiology', control: control('equip', 'mri', 'item.mri') },
  { unit: 'cathlab', control: control('cathlab', 'cathlab', 'item.cathlab') },
];

/** The controls a staff member sees: only their own unit's (or everything for the `all` fallback). */
export function controlsForUnit(unit: string | undefined): UnitControl[] {
  if (unit === ALL_UNITS) return ALL_CONTROLS.map((c) => c.control);
  return isUnit(unit) ? ALL_CONTROLS.filter((c) => c.unit === unit).map((c) => c.control) : [];
}

/** The change to send when a control is switched or stepped. */
export function changeFor(controlDef: UnitControl, value: number | boolean | DeptState): StatusChange | undefined {
  switch (controlDef.kind) {
    case 'count':
      return typeof value === 'number' ? { kind: 'count', item: controlDef.item as CountItem, value } : undefined;
    case 'dept':
      return value === 'open' || value === 'diverting' ? { kind: 'dept', key: controlDef.item, value } : undefined;
    case 'equip':
      return typeof value === 'boolean' ? { kind: 'equip', key: controlDef.item, value } : undefined;
    case 'oncall':
      return typeof value === 'boolean' ? { kind: 'oncall', key: controlDef.item, value } : undefined;
    case 'cathlab':
      return typeof value === 'boolean' ? { kind: 'equip', key: 'cathlab', value } : undefined;
  }
}
