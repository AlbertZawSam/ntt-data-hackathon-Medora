import { operationalText } from '../logic/agentText';

describe('operationalText', () => {
  it('drops thinking blocks and keeps the update', () => {
    expect(operationalText('<thinking>It looks like a STEMI.</thinking> Asking two hospitals now.')).toBe('Asking two hospitals now.');
  });

  it('drops several blocks, any case and with attributes', () => {
    expect(operationalText('<THINKING>a</THINKING>One. <thinking type="x">b</thinking>Two.')).toBe('One. Two.');
    expect(operationalText('<thinking >a</thinking >Done.')).toBe('Done.');
  });

  it('drops an unclosed block to the end', () => {
    expect(operationalText('Asking now. <thinking>the patient probably has')).toBe('Asking now.');
  });

  it('drops reasoning before a stray closing tag', () => {
    expect(operationalText('the patient probably has a stroke</thinking> Asking Rama Nine.')).toBe('Asking Rama Nine.');
  });

  it('returns nothing for reasoning only, and caps the length', () => {
    expect(operationalText('<thinking>only reasoning</thinking>')).toBe('');
    expect(operationalText('x'.repeat(1000))).toHaveLength(300);
  });
});
