import { DEMO_HOSPITALS } from '../logic/demoHospitals';
import { demoReply } from '../logic/demoReplies';
import { statedDelayMin } from '../logic/referral';

describe('demoReply', () => {
  it("gives Rama Nine's stroke reply a delay the agent can read", () => {
    const reply = demoReply('rama9', 'stroke');
    expect(reply.status).toBe('accepted');
    expect(statedDelayMin(reply.note)).toBe(40);
  });

  it('accepts by default and uses per-hospital presets', () => {
    expect(demoReply('rama9', 'stemi')).toEqual({ status: 'accepted' });
    expect(demoReply('chatuchak', 'general')).toEqual({ status: 'declined', reason: 'busy' });
    expect(demoReply('unknown', 'stroke')).toEqual({ status: 'accepted' });
  });

  it('only names demo hospitals that exist', () => {
    const keys = new Set(DEMO_HOSPITALS.map((hospital) => hospital.key));
    for (const key of ['rama9', 'chatuchak', 'thonburi']) expect(keys.has(key)).toBe(true);
  });
});
