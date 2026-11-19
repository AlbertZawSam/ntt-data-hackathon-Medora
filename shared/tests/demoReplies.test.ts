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
    // The women's and children's hospital declines adult fractures, so the trauma hospital takes a broken leg.
    expect(demoReply('chaophraya', 'injury')).toMatchObject({ status: 'declined', reason: 'equip' });
    expect(demoReply('chaophraya', 'maternity')).toEqual({ status: 'accepted' });
  });

  it('lets specialty hospitals decline cases outside their specialty', () => {
    // A stomach pain ("general") referral: the bone, women's and children's, children's and urgent-care hospitals decline.
    for (const key of ['khlongsan', 'chaophraya', 'chatuchak', 'asok']) expect(demoReply(key, 'general')).toMatchObject({ status: 'declined', reason: 'equip' });
    // Hospitals with internal medicine accept it.
    expect(demoReply('rama9', 'general')).toEqual({ status: 'accepted' });
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

describe('demo reply notes in the doctor\'s language', () => {
  it('writes the note in Thai for a Thai referral, and the delay is still read', () => {
    const th = demoReply('rama9', 'stroke', 'th');
    expect(th.note).toContain('นาที');
    expect(statedDelayMin(th.note)).toBe(40);
    expect(demoReply('chatuchak', 'general', 'th').note).toContain('เด็ก');
    expect(demoReply('chatuchak', 'general', 'en').note).toContain('children only');
  });
});
