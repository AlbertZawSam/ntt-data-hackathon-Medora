import { DEMO_HOSPITALS } from '../logic/demoHospitals';
import { demoReply, hasDepartmentStaff } from '../logic/demoReplies';
import { statedDelayMin } from '../logic/referral';

describe('demoReply', () => {
  it("gives Rama Nine's stroke reply a delay the agent can read", () => {
    const reply = demoReply('rama9', 'stroke');
    expect(reply.status).toBe('accepted');
    expect(statedDelayMin(reply.note)).toBe(40);
  });

  it('accepts by default and uses per-hospital presets', () => {
    expect(demoReply('rama9', 'stemi')).toEqual({ status: 'accepted' });
    expect(demoReply('latphrao', 'stroke')).toMatchObject({ status: 'declined', reason: 'divert' });
    expect(demoReply('nanvalley', 'stroke').status).toBe('accepted');
    expect(demoReply('unknown', 'stroke')).toEqual({ status: 'accepted' });
  });

  it('uses only reasons staff can pick in the inbox', () => {
    for (const h of DEMO_HOSPITALS) for (const reply of Object.values(h.demoReply ?? {})) if (reply?.reason) expect(['nobed', 'busy', 'equip', 'divert']).toContain(reply.reason);
  });
});

describe('hasDepartmentStaff', () => {
  it('is true only for hospitals with all three departments and no preset reply', () => {
    expect(DEMO_HOSPITALS.filter((h) => hasDepartmentStaff(h.key)).map((h) => h.key)).toEqual(['pathumwan']);
    expect(hasDepartmentStaff('latphrao')).toBe(false); // all three departments, but its preset reply answers
    expect(hasDepartmentStaff('unknown')).toBe(false);
  });
});
