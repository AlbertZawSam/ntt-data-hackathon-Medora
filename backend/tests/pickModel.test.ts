import { pickModel } from '../amplify/functions/agent-runner/model';

const env = { GUARDRAIL_ID: 'g', AGENT_GUARDRAIL_ID: 'ag', MODEL_ID_FAST: 'lite', MODEL_ID_STRONG: 'pro' };

describe('pickModel', () => {
  it('uses the fast model by default and the strong one on the demo stage', () => {
    expect(pickModel(env)).toBe('lite');
    expect(pickModel({ ...env, AWS_BRANCH: 'demo' })).toBe('pro');
  });
  it('lets a direct invoke choose either model, and ignores anything else', () => {
    expect(pickModel(env, 'strong')).toBe('pro');
    expect(pickModel({ ...env, AWS_BRANCH: 'demo' }, 'fast')).toBe('lite');
    expect(pickModel(env, 'anthropic.claude-3')).toBe('lite');
    expect(pickModel(env, { evil: true })).toBe('lite');
  });
  it('falls back to the fast model when no strong model is set', () => {
    expect(pickModel({ ...env, MODEL_ID_STRONG: undefined }, 'strong')).toBe('lite');
  });
  it('takes the rule-based path when either guardrail is missing', () => {
    expect(pickModel({ ...env, GUARDRAIL_ID: undefined })).toBeUndefined();
    expect(pickModel({ ...env, AGENT_GUARDRAIL_ID: undefined }, 'strong')).toBeUndefined();
  });
});
