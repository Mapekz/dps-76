import { describe, expect, it } from 'bun:test';
import {
  classifyUnresolved,
  summarizeUnresolvedClassification,
  unresolvedClassifications,
  type UnresolvedClassification,
} from '../unresolved-classification';

describe('classifyUnresolved', () => {
  it('classifies entries by exact string prefix match', () => {
    const prefixRule: UnresolvedClassification = {
      match: 'PerkCondition_',
      disposition: 'resolve-pending',
      reason: 'test prefix rule',
    };
    const result = classifyUnresolved(
      ['PerkCondition_foo', 'PerkCondition_bar', 'OtherThing'],
      [prefixRule],
    );
    expect(result.classified.get(prefixRule)).toEqual(['PerkCondition_foo', 'PerkCondition_bar']);
    expect(result.unclassified).toEqual(['OtherThing']);
  });

  it('classifies entries by RegExp match', () => {
    const regexRule: UnresolvedClassification = {
      match: /^HTO_crFortifyDamage_/,
      disposition: 'out-of-scope',
      reason: 'event buffs',
    };
    const result = classifyUnresolved(
      ['HTO_crFortifyDamage_A', 'HTO_crFortifyDamage_B', 'HTO_other'],
      [regexRule],
    );
    expect(result.classified.get(regexRule)).toEqual([
      'HTO_crFortifyDamage_A',
      'HTO_crFortifyDamage_B',
    ]);
    expect(result.unclassified).toEqual(['HTO_other']);
  });

  it('uses first matching rule when multiple rules could apply', () => {
    const first: UnresolvedClassification = {
      match: 'Shared_',
      disposition: 'out-of-scope',
      reason: 'first wins',
    };
    const second: UnresolvedClassification = {
      match: /^Shared_/,
      disposition: 'resolve-pending',
      reason: 'second rule',
    };
    const result = classifyUnresolved(['Shared_entry'], [first, second]);
    expect(result.classified.get(first)).toEqual(['Shared_entry']);
    expect(result.classified.has(second)).toBe(false);
    expect(result.unclassified).toEqual([]);
  });

  it('returns unmatched entries in unclassified', () => {
    const result = classifyUnresolved(['TotallyUnknown_edid', 'AlsoUnknown'], []);
    expect(result.classified.size).toBe(0);
    expect(result.unclassified).toEqual(['TotallyUnknown_edid', 'AlsoUnknown']);
  });

  it('classifies the seeded HTO rule against default rules', () => {
    const htoRule = unresolvedClassifications[0]!;
    const result = classifyUnresolved(['HTO_crFortifyDamage_test']);
    expect(result.classified.get(htoRule)).toEqual(['HTO_crFortifyDamage_test']);
    expect(result.unclassified).toEqual([]);
  });
});

describe('summarizeUnresolvedClassification', () => {
  it('rolls up totals and disposition counts', () => {
    const rule: UnresolvedClassification = {
      match: 'foo_',
      disposition: 'out-of-scope',
      reason: 'test',
    };
    const entries = ['foo_a', 'foo_b', 'bar'];
    const result = classifyUnresolved(entries, [rule]);
    expect(summarizeUnresolvedClassification(entries, result)).toEqual({
      total: 3,
      classified: 2,
      unclassified: 1,
      byDisposition: { 'out-of-scope': 2 },
    });
  });
});

describe('unresolvedClassifications schema', () => {
  it('every rule has a non-empty reason', () => {
    for (const rule of unresolvedClassifications) {
      expect(rule.reason.trim().length).toBeGreaterThan(0);
    }
  });

  it('every deferred-with-issue rule has an issue ref', () => {
    for (const rule of unresolvedClassifications) {
      if (rule.disposition === 'deferred-with-issue') {
        expect(rule.issue).toMatch(/^#\d+$/);
      }
    }
  });
});
