/**
 * Unit-scoped changes to a hospital's live status: which unit owns each item, what a "My unit"
 * screen shows, and the single function the server uses to apply (or refuse) a change. The hospital
 * admin sets up beds and departments and decides which unit owns each item (`owners`); unit staff
 * update only the items their unit owns.
 * Pure TypeScript, so the screen and the `update-status` Lambda follow exactly the same rules.
 * Requirements: 9.1 to 9.4, 19.1, 19.2, 19.8, 19.10
 */
import { isDepartment } from './departments';
import { ALL_UNITS, DEFAULT_OWNER_UNIT, DEFAULT_SPECIALIST_UNIT, canUpdateStatusItem, isUnit, type Caller, type Unit } from './access';
import { GROUPS } from './session';
import { EQUIPMENT, EQUIPMENT_KEYS, equipmentOwner } from './equipment';
import type { DeptState, HospitalStatus } from './types';

export const DEPT_KEYS = ['ed', 'neuro', 'cardio', 'obstetrics', 'pediatrics', 'ortho'] as const;
export const EQUIP_KEYS = EQUIPMENT_KEYS;
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
  | { kind: 'confirm' }
  /** Admin only: which unit owns an item from now on. */
  | { kind: 'owner'; item: string; unit: string };

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
    case 'owner':
      return 'owner';
  }
}

/** Every item of a hospital's status, by the id ownership, notes and freshness use. */
export const STATUS_ITEMS: readonly string[] = [
  ...COUNT_ITEMS,
  ...DEPT_KEYS.map((k) => `dept:${k}`),
  ...EQUIP_KEYS.map((k) => `equip:${k}`),
  ...ONCALL_KEYS.map((k) => `oncall:${k}`),
];

/** The unit that owns an item when the admin hasn't chosen one. */
export function defaultOwnerOf(id: string): Unit | undefined {
  const [kind, key] = id.includes(':') ? id.split(':') : ['count', id];
  switch (kind) {
    case 'count':
      return includes(COUNT_ITEMS, key) ? DEFAULT_OWNER_UNIT[key as CountItem] : undefined;
    case 'dept':
      return includes(DEPT_KEYS, key) ? (key === 'ed' ? DEFAULT_OWNER_UNIT.ed : DEFAULT_SPECIALIST_UNIT) : undefined;
    case 'equip':
      return equipmentOwner(key);
    case 'oncall':
      return includes(ONCALL_KEYS, key) ? DEFAULT_SPECIALIST_UNIT : undefined;
    default:
      return undefined;
  }
}

/** Who owns an item at this hospital: the admin's choice if it is a real unit, otherwise the default. */
export function ownerOfItem(status: Pick<HospitalStatus, 'owners'> | undefined, id: string): Unit | undefined {
  if (!STATUS_ITEMS.includes(id)) return undefined;
  const chosen = status?.owners?.[id];
  return isUnit(chosen) ? chosen : defaultOwnerOf(id);
}

/** Admin changes: beds and departments (the hospital's set-up) and who owns each item. No "still correct?":
 * the admin can't vouch for equipment and on-duty doctors the units own. */
const ADMIN_KINDS: ReadonlyArray<StatusChange['kind']> = ['count', 'dept', 'owner'];
const isAdminOf = (caller: Caller, hospitalId: string): boolean => caller.groups.includes(GROUPS.admins) && caller.hospitalId === hospitalId;

/** The unit that owns the item a change touches (the admin's choice first), or `undefined` for an unknown item. */
export function ownerUnitOf(change: StatusChange, status?: Pick<HospitalStatus, 'owners'>): Unit | undefined {
  if (change.kind !== 'confirm' && change.kind !== 'owner' && status?.owners) {
    const id = itemId(change);
    if (STATUS_ITEMS.includes(id) && isUnit(status.owners[id])) return status.owners[id] as Unit;
  }
  switch (change.kind) {
    case 'count':
      return includes(COUNT_ITEMS, change.item) ? DEFAULT_OWNER_UNIT[change.item] : undefined;
    case 'dept':
      if (!includes(DEPT_KEYS, change.key)) return undefined;
      return change.key === 'ed' ? DEFAULT_OWNER_UNIT.ed : DEFAULT_SPECIALIST_UNIT;
    case 'equip':
      return equipmentOwner(change.key);
    case 'oncall':
      return includes(ONCALL_KEYS, change.key) ? DEFAULT_SPECIALIST_UNIT : undefined;
    case 'cathlabBusy':
      return equipmentOwner('cathlab');
    case 'confirm':
    case 'owner':
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

  // The hospital admin: sets up beds and departments, decides who owns each item, may confirm the status.
  if (isAdminOf(caller, hospitalId) && ADMIN_KINDS.includes(change.kind)) return applyAdminChange(status, change, nowIso, note);
  if (change.kind === 'owner') return { ok: false, reason: 'not-staff' };

  const owner = confirming ? undefined : ownerUnitOf(change, status);
  if (!confirming && owner === undefined) return { ok: false, reason: 'bad-change' };

  // "Still correct?" needs no particular unit, only an account of this hospital's unit staff. Department
  // staff own only their equipment, so they can't confirm the hospital's whole status.
  const allowed = confirming
    ? !isDepartment(caller.unit) && canUpdateStatusItem(caller, { hospitalId, ownerUnit: isUnit(caller.unit) ? caller.unit : DEFAULT_OWNER_UNIT.beds }) ||
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

function applyAdminChange(status: HospitalStatus, change: StatusChange, nowIso: string, note: string | undefined): StatusChangeResult {
  // Choosing an owner changes no readiness, so it doesn't make the status look freshly confirmed.
  const next: HospitalStatus = {
    ...status,
    depts: { ...status.depts },
    owners: { ...status.owners },
    notes: { ...status.notes },
    meta: { ...status.meta },
    updatedAt: change.kind === 'owner' ? status.updatedAt : nowIso,
  };
  switch (change.kind) {
    case 'count':
      if (!includes(COUNT_ITEMS, change.item) || !isCount(change.value, MAX_COUNT)) return { ok: false, reason: 'bad-change' };
      next[change.item] = change.value;
      break;
    case 'dept':
      if (!includes(DEPT_KEYS, change.key) || (change.value !== 'open' && change.value !== 'diverting')) return { ok: false, reason: 'bad-change' };
      next.depts[change.key] = change.value;
      break;
    case 'owner':
      // A real unit only: never the demo-wide `all`, never an unknown item.
      if (!STATUS_ITEMS.includes(change.item) || !isUnit(change.unit)) return { ok: false, reason: 'bad-change' };
      // Department staff keep only equipment (docs/roles.md): never beds, departments or doctors on duty.
      if (isDepartment(change.unit) && !change.item.startsWith('equip:')) return { ok: false, reason: 'bad-change' };
      next.owners![change.item] = change.unit;
      return { ok: true, status: next };
    default:
      return { ok: false, reason: 'bad-change' };
  }
  const id = itemId(change);
  next.meta![id] = { unit: 'admin', at: nowIso };
  if (note) next.notes![id] = note;
  else if (note === '') delete next.notes![id];
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
  { unit: 'cathlab', control: control('cathlab', 'cathlab', 'item.cathlab') },
  // Every other piece of equipment is a working/down switch for the unit that owns it.
  ...EQUIPMENT.filter((e) => e.key !== 'cathlab').map((e) => ({ unit: e.owner as Unit, control: control('equip', e.key, `equip.${e.key}`) })),
];

/** The status item a control changes (the cath lab control changes `equip:cathlab`). */
export function controlItemId(controlDef: UnitControl): string {
  return controlDef.kind === 'count' ? controlDef.item : controlDef.kind === 'cathlab' ? 'equip:cathlab' : `${controlDef.kind}:${controlDef.item}`;
}

/**
 * The controls a staff member sees: the items their unit owns at this hospital (the admin's choices,
 * or the defaults), or everything for the `all` fallback.
 */
export function controlsForUnit(unit: string | undefined, status?: Pick<HospitalStatus, 'owners'>): UnitControl[] {
  if (unit === ALL_UNITS) return ALL_CONTROLS.map((c) => c.control);
  if (!isUnit(unit)) return [];
  return ALL_CONTROLS.map((c) => c.control).filter((c) => ownerOfItem(status, controlItemId(c)) === unit);
}

/** The hospital admin's set-up controls: beds, ICU, NICU and every department. */
export function controlsForAdmin(): UnitControl[] {
  return ALL_CONTROLS.map((c) => c.control).filter((c) => c.kind === 'count' || c.kind === 'dept');
}

/** Every control, for the admin's "who owns what" screen. */
export function allControls(): UnitControl[] {
  return ALL_CONTROLS.map((c) => c.control);
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
