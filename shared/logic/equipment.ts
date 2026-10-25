/**
 * The equipment a hospital reports as working or down, and the unit that owns each item. Departments own
 * the equipment of their own care (Cardiology the ECG and echo, Surgery the X-ray and operating theatre,
 * Obstetrics the ultrasound and delivery room); the emergency unit owns the blood lab. Patients see each
 * item as working or not; only the owning unit's staff change it (`update-status`). Pure TypeScript.
 * Requirements: 9.1, 19.1
 */
import type { Unit } from './access';

export const EQUIPMENT = [
  { key: 'ct', owner: 'radiology' },
  { key: 'mri', owner: 'radiology' },
  { key: 'cathlab', owner: 'cathlab' },
  { key: 'lab', owner: 'er' },
  { key: 'ecg', owner: 'cardiology' },
  { key: 'echo', owner: 'cardiology' },
  { key: 'xray', owner: 'surgery' },
  { key: 'theatre', owner: 'surgery' },
  { key: 'ultrasound', owner: 'obstetrics' },
  { key: 'delivery', owner: 'obstetrics' },
] as const satisfies ReadonlyArray<{ key: string; owner: Unit }>;

export type EquipmentKey = (typeof EQUIPMENT)[number]['key'];

export const EQUIPMENT_KEYS: readonly EquipmentKey[] = EQUIPMENT.map((e) => e.key);

export function isEquipmentKey(value: unknown): value is EquipmentKey {
  return typeof value === 'string' && (EQUIPMENT_KEYS as readonly string[]).includes(value);
}

/** The unit whose staff may switch this item, or undefined for an unknown key. */
export function equipmentOwner(key: string): Unit | undefined {
  return EQUIPMENT.find((e) => e.key === key)?.owner;
}

/** The hospital's equipment in catalogue order: only items it has, each working or down. */
export function equipmentList(equip: Record<string, boolean>): Array<{ key: EquipmentKey; working: boolean }> {
  return EQUIPMENT.filter((e) => e.key in equip).map((e) => ({ key: e.key, working: equip[e.key] === true }));
}
