import fc from 'fast-check';
import data from '../data/red_flags.json';
import { normalize, RED_FLAGS, redFlag } from '../logic/redFlags';

const ALL_PATTERNS = RED_FLAGS.flatMap((f) => f.patterns.map((p) => ({ key: f.key, pattern: p })));

describe('redFlag', () => {
  it.each(ALL_PATTERNS)('matches $key pattern "$pattern" inside a sentence', ({ key, pattern }) => {
    expect(redFlag(`Patient says: ${pattern} since this morning`)?.key).toBe(key);
  });

  it.each(data.emergencyExamples)('flags emergency example "%s"', (text) => {
    expect(redFlag(text)).not.toBeNull();
  });

  it.each(data.safeExamples)('does not flag safe example "%s"', (text) => {
    expect(redFlag(text)).toBeNull();
  });

  it('ignores case and extra spaces', () => {
    expect(redFlag('CHEST   PAIN')?.key).toBe('chest');
  });

  it('matches curly apostrophes typed on phone keyboards', () => {
    expect(redFlag('I can’t breathe')?.key).toBe('breathing');
    expect(redFlag('it won’t stop bleeding')?.key).toBe('bleeding');
  });

  it('returns the matched pattern for the activity log', () => {
    expect(redFlag('มีอาการแน่นหน้าอก')).toEqual({
      key: 'chest',
      label: { en: 'chest pain', th: 'อาการเจ็บหน้าอก' },
      pattern: 'แน่นหน้าอก',
    });
  });

  // Feature: hospital-referral-app, Property 1: red-flag detection completeness
  it('Property 1: any text containing a phrase, in any case, is flagged', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.constantFrom(...ALL_PATTERNS),
        fc.string(),
        fc.boolean(),
        (before, { pattern }, after, upper) => {
          const phrase = upper ? pattern.toUpperCase() : pattern;
          expect(redFlag(`${before} ${phrase} ${after}`)).not.toBeNull();
        },
      ),
      { numRuns: 200 },
    );
  });

  // Feature: hospital-referral-app, Property 2: red-flag non-contamination
  it('Property 2: text containing no phrase is not flagged', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 80 }).filter((s) => !ALL_PATTERNS.some(({ pattern }) => normalize(s).includes(normalize(pattern)))),
        (text) => {
          expect(redFlag(text)).toBeNull();
        },
      ),
      { numRuns: 200 },
    );
  });
});
