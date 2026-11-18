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
    // Asok Urgent Care is nearest to the default location but has no children's or pregnancy care, so it is skipped.
    expect(skippedCloser(rankPublic(entries, 'child', siam, NOW_MS)).map((r) => r.entry.hospitalId)).toEqual(['asok']);
    // The Thai child-fever search near Lat Phrao finds Chatuchak Children's first.
    expect(rankPublic(entries, 'child', { lat: 13.816, lng: 100.5614 }, NOW_MS)[0].entry.hospitalId).toBe('chatuchak');
    // Lat Phrao's data is over two hours old; Pathum Wan's is marked unclear, so it shows as limited.
    expect(rankPublic(entries, 'injury', siam, NOW_MS).find((r) => r.entry.hospitalId === 'latphrao')?.stale).toBe(true);
    expect(entries.find((e) => e.hospitalId === 'pathumwan')?.needs.general.label).toBe('limited');
    // A twisted ankle near Siam goes to urgent care first, then the trauma hospital.
    expect(rankPublic(entries, 'injury', siam, NOW_MS).slice(0, 2).map((r) => r.entry.hospitalId)).toEqual(['asok', 'khlongsan']);
    expect(nearestOpenEd(entries, siam, NOW_MS)?.entry.edOpen).toBe(true);
  });
});
