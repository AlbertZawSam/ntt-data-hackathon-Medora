import { DEMO_HOSPITALS } from '../logic/demoHospitals';
import { demoReply, hasDepartmentStaff } from '../logic/demoReplies';
import { statedDelayMin } from '../logic/referral';

describe('demoReply', () => {
  it("gives Sathorn's heart-attack reply a delay the agent can read", () => {
    const reply = demoReply('sathorn', 'stemi');
    expect(reply.status).toBe('accepted');
    expect(statedDelayMin(reply.note)).toBe(20);
  });

  it('accepts by default and uses per-hospital presets', () => {
    expect(demoReply('ratchada', 'stroke')).toEqual({ status: 'accepted' });
    expect(demoReply('thonglo', 'peds')).toEqual({ status: 'declined', reason: 'nobed' });
    expect(demoReply('nonthaburi', 'general')).toEqual({ status: 'declined', reason: 'busy' });
    expect(demoReply('unknown', 'stroke')).toEqual({ status: 'accepted' });
  });

  it('only names demo hospitals that exist', () => {
    const keys = new Set(DEMO_HOSPITALS.map((hospital) => hospital.key));
    for (const key of ['sathorn', 'thonglo', 'nonthaburi']) expect(keys.has(key)).toBe(true);
  });
});

describe('hasDepartmentStaff', () => {
  it('is true only for the three department demo hospitals', () => {
    expect(DEMO_HOSPITALS.filter((h) => hasDepartmentStaff(h.key)).map((h) => h.key)).toEqual(['krungthep', 'sukhumvit', 'minburi']);
    expect(hasDepartmentStaff('sathorn')).toBe(false);
    expect(hasDepartmentStaff('unknown')).toBe(false);
  });
});
