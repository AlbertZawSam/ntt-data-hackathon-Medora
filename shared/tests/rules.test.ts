import fc from 'fast-check';
import { PATHWAYS } from '../logic/pathways';
import { failsFor } from '../logic/ranking';
import { ruleAccepts } from '../logic/rules';
import { arbPathway, arbStatus, openStatus } from './generators';

describe('ruleAccepts', () => {
  const stroke = PATHWAYS.stroke;

  it('accepts when the rule is on, nothing fails and beds meet the minimum', () => {
    expect(ruleAccepts(openStatus({ beds: 2, rules: { stroke: true, minBeds: 2 } }), stroke)).toBe(true);
  });

  it('rejects when the rule is off or missing', () => {
    expect(ruleAccepts(openStatus({ rules: { stroke: false, minBeds: 1 } }), stroke)).toBe(false);
    expect(ruleAccepts(openStatus({ rules: { minBeds: 1 } }), stroke)).toBe(false);
  });

  it('rejects when the hospital fails the pathway', () => {
    const s = openStatus({ rules: { stroke: true, minBeds: 1 } });
    s.equip.ct = false;
    expect(ruleAccepts(s, stroke)).toBe(false);
  });

  it('rejects when free beds are below the minimum', () => {
    expect(ruleAccepts(openStatus({ beds: 1, rules: { stroke: true, minBeds: 2 } }), stroke)).toBe(false);
  });

  it('accepts a patient visit only with the visit rule on and the emergency department open', () => {
    expect(ruleAccepts(openStatus({ beds: 0, rules: { visit: true, minBeds: 5 } }), 'visit')).toBe(true);
    expect(ruleAccepts(openStatus({ rules: { visit: false, minBeds: 1 } }), 'visit')).toBe(false);
    const diverting = openStatus({ rules: { visit: true, minBeds: 1 } });
    diverting.depts.ed = 'diverting';
    expect(ruleAccepts(diverting, 'visit')).toBe(false);
  });

  // Feature: hospital-referral-app, Property 5: auto-accept correctness
  it('Property 5: accepts if and only if all three conditions hold', () => {
    fc.assert(
      fc.property(arbStatus, arbPathway, (status, pathway) => {
        const expected =
          status.rules[pathway.key] === true &&
          failsFor(status, pathway).length === 0 &&
          status.beds >= status.rules.minBeds;
        expect(ruleAccepts(status, pathway)).toBe(expected);
      }),
      { numRuns: 300 },
    );
  });
});
