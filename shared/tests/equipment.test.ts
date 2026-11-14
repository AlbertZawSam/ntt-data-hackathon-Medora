import { EQUIPMENT_KEYS, equipmentForCase, equipmentForNeed, equipmentList, equipmentOwner, isEquipmentKey } from '../logic/equipment';
import { NEED_KEYS } from '../logic/publicDirectory';

describe('equipment catalogue', () => {
  it('knows each item and its owning unit', () => {
    expect(isEquipmentKey('ct')).toBe(true);
    expect(isEquipmentKey('laser')).toBe(false);
    expect(equipmentOwner('xray')).toBe('surgery');
    expect(equipmentOwner('delivery')).toBe('obstetrics');
    expect(equipmentOwner('laser')).toBeUndefined();
  });
  it('lists only the items a hospital has, in catalogue order', () => {
    expect(equipmentList({ xray: true, ct: false })).toEqual([
      { key: 'ct', working: false },
      { key: 'xray', working: true },
    ]);
  });
});

describe('equipmentForNeed', () => {
  it('names what each kind of care needs: injury imaging and theatre, birth ultrasound and delivery room', () => {
    expect(equipmentForNeed('injury')).toEqual(['xray', 'ct', 'theatre']);
    expect(equipmentForNeed('maternity')).toEqual(['ultrasound', 'delivery']);
    expect(equipmentForNeed('child')).toEqual(['lab', 'xray']);
    expect(equipmentForNeed('general')).toEqual(['lab', 'xray', 'ct']);
  });
  it('covers every need with real catalogue keys, and never the heart or cath lab items a visit does not need', () => {
    for (const need of NEED_KEYS) {
      const keys = equipmentForNeed(need);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) expect(EQUIPMENT_KEYS).toContain(key);
      expect(keys).not.toContain('cathlab');
      expect(keys).not.toContain('ecg');
    }
  });
  it('narrows a hospital list to the case, keeping working and down items, and gives nothing when none match', () => {
    const all = equipmentList({ ct: true, mri: true, cathlab: false, lab: true, xray: false, ultrasound: true, delivery: false });
    expect(equipmentForCase(all, 'injury')).toEqual([
      { key: 'ct', working: true },
      { key: 'xray', working: false },
    ]);
    expect(equipmentForCase(all, 'maternity').map((e) => e.key)).toEqual(['ultrasound', 'delivery']);
    expect(equipmentForCase(equipmentList({ mri: true, cathlab: true }), 'child')).toEqual([]);
  });
});
