import { DEMO_HOSPITALS, demoStatus } from '../logic/demoHospitals';
import { validateHospitalInput } from '../logic/hospital';
import { DEFAULT_PLACE } from '../logic/places';
import { NEED_KEYS, nearestOpenEd, publicEntry, rankPublic, skippedCloser } from '../logic/publicDirectory';
import { DEPT_KEYS, EQUIP_KEYS, ONCALL_KEYS } from '../logic/statusUpdate';
import { NOW_MS } from './generators';

const entries = DEMO_HOSPITALS.map((h) =>
  publicEntry({ hospitalId: h.key, name: h.name, lat: h.lat, lng: h.lng, typicalWaitMin: h.typicalWaitMin }, demoStatus(h, NOW_MS)),
);
const siam = { lat: DEFAULT_PLACE.lat, lng: DEFAULT_PLACE.lng };

describe('demo hospitals', () => {
  it('pass the same checks as a hospital registered in the app', () => {
    for (const h of DEMO_HOSPITALS) {
      expect(validateHospitalInput({ nameEn: h.name.en, nameTh: h.name.th, lat: h.lat, lng: h.lng, totalBeds: h.totalBeds, nicuTotal: h.nicuTotal }).ok).toBe(true);
    }
    expect(new Set(DEMO_HOSPITALS.map((h) => h.key)).size).toBe(DEMO_HOSPITALS.length);
  });

  it('use only status items the status screen can change', () => {
    for (const h of DEMO_HOSPITALS) {
      for (const k of Object.keys(h.status.depts)) expect(DEPT_KEYS).toContain(k);
      for (const k of Object.keys(h.status.equip)) expect(EQUIP_KEYS).toContain(k);
      for (const k of Object.keys(h.status.oncall)) expect(ONCALL_KEYS).toContain(k);
    }
  });

  it('give every type of care at least one hospital that can help', () => {
    for (const need of NEED_KEYS) expect(rankPublic(entries, need, siam, NOW_MS)[0].eligible).toBe(true);
  });

  it('show the behaviours the demo relies on', () => {
    // Siam is nearest to the default location but is skipped for a child.
    expect(skippedCloser(rankPublic(entries, 'child', siam, NOW_MS)).map((r) => r.entry.hospitalId)).toContain('siam');
    expect(rankPublic(entries, 'injury', siam, NOW_MS).find((r) => r.entry.hospitalId === 'thonburi')?.stale).toBe(true);
    expect(entries.find((e) => e.hospitalId === 'victory')?.needs.child.label).toBe('limited');
    expect(entries.find((e) => e.hospitalId === 'chatuchak')?.needs.general.label).toBe('limited');
    expect(nearestOpenEd(entries, { lat: 13.6682, lng: 100.6047 }, NOW_MS)?.entry.hospitalId).not.toBe('bangna');
  });
});
