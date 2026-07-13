import { describe, it, expect } from 'vitest';
import { getLoadoutModifiers } from '@/data/perk-modifiers';
import { computePerkBudget } from '@/data/perk-budget';
import { PerkId } from '@/data/perk-ids';
import { derivePlayerStats, BASE_MAX_HP, MAX_HP_PER_ENDURANCE, SPECIAL_KEYS, type SpecialKey } from '@/lib/player-stats';
import { createDefaultPlayerConditions } from '@/types';
import type { Modifier } from '@/types/modifiers';

function baseSpecial(overrides: Partial<Record<SpecialKey, number>> = {}): Record<SpecialKey, number> {
  return { ...(Object.fromEntries(SPECIAL_KEYS.map(k => [k, 1])) as Record<SpecialKey, number>), ...overrides };
}

const conditions = createDefaultPlayerConditions();

describe('derivePlayerStats', () => {
  it('max HP = 245 + 5×END with no modifiers', () => {
    const { maxHealth } = derivePlayerStats([], baseSpecial({ endurance: 7 }), conditions);
    expect(maxHealth).toBe(BASE_MAX_HP + MAX_HP_PER_ENDURANCE * 7); // 280
  });

  it('specialEndurance buffs raise END before the HP formula', () => {
    const endBuff: Modifier = {
      id: 'test:end',
      source: { kind: 'consumable', formId: '0x0', edid: 'test', name: 'test' },
      bucket: 'specialEndurance',
      op: 'ADD',
      value: 3,
      conditions: [],
    };
    const { special, maxHealth } = derivePlayerStats([endBuff], baseSpecial({ endurance: 7 }), conditions);
    expect(special.endurance).toBe(10);
    expect(maxHealth).toBe(BASE_MAX_HP + MAX_HP_PER_ENDURANCE * 10);
  });

  it("Lifegiver rank 1 adds its END-keyed curve (real extracted data)", () => {
    const lifegiver = getLoadoutModifiers('live', [{ perkId: PerkId.LifeGiver, rank: 1 }]);
    const { maxHealth } = derivePlayerStats(lifegiver, baseSpecial({ endurance: 15 }), conditions);
    // Curve (15, 120): END 15 → +120 HP over the base formula.
    expect(maxHealth).toBe(BASE_MAX_HP + MAX_HP_PER_ENDURANCE * 15 + 120);
  });

  it('Lifegiver rank 3 = END curve + the description-sourced flat 45', () => {
    const lifegiver = getLoadoutModifiers('live', [{ perkId: PerkId.LifeGiver, rank: 3 }]);
    const { maxHealth } = derivePlayerStats(lifegiver, baseSpecial({ endurance: 15 }), conditions);
    expect(maxHealth).toBe(BASE_MAX_HP + MAX_HP_PER_ENDURANCE * 15 + 120 + 45);
  });

  it('Lifegiver interpolates the curve between END points', () => {
    const lifegiver = getLoadoutModifiers('live', [{ perkId: PerkId.LifeGiver, rank: 1 }]);
    const { maxHealth } = derivePlayerStats(lifegiver, baseSpecial({ endurance: 8 }), conditions);
    // Between (1,10) and (15,120): 10 + (8−1)/(15−1)×110 = 65.
    expect(maxHealth).toBe(BASE_MAX_HP + MAX_HP_PER_ENDURANCE * 8 + 65);
  });
});

describe('computePerkBudget (real card costs, not rank)', () => {
  it('Tenderizer rank 1 costs 2 Charisma points (its real PCRD cost, not rank 1)', () => {
    const budget = computePerkBudget(
      'live',
      [{ perkId: PerkId.Tenderizer, rank: 1 }],
      [],
      baseSpecial()
    );
    expect(budget.cardPoints.charisma).toBe(2);
  });

  it('a rank-2 Party Boy/Girl costs 3 (its rank-2 cost), not cumulative 2+3', () => {
    const budget = computePerkBudget(
      'live',
      [{ perkId: PerkId.PartyBoyGirl, rank: 2 }],
      [],
      baseSpecial()
    );
    expect(budget.cardPoints.charisma).toBe(3);
  });
});

describe('deriveStrangeInNumbers', () => {
  it('requires both the card and at least one teammate', async () => {
    const { deriveStrangeInNumbers } = await import('@/lib/player-stats');
    const conditions = createDefaultPlayerConditions();
    const withTeam = { ...conditions, teammateCount: 2 };
    const sin = [{ perkId: 'StrangeInNumbers', rank: 1 }];
    expect(deriveStrangeInNumbers(sin, withTeam)).toBe(true);
    expect(deriveStrangeInNumbers(sin, conditions)).toBe(false); // solo
    expect(deriveStrangeInNumbers([], withTeam)).toBe(false); // no card
  });
});

describe('deriveHungerThirstTier', () => {
  it('sums the two meter tiers, clamped to 0-4 each', async () => {
    const { deriveHungerThirstTier } = await import('@/lib/player-stats');
    const base = createDefaultPlayerConditions();
    expect(deriveHungerThirstTier(base)).toBe(0);
    expect(deriveHungerThirstTier({ ...base, foodTier: 4, drinkTier: 4 })).toBe(8);
    expect(deriveHungerThirstTier({ ...base, foodTier: 3, drinkTier: 1 })).toBe(4);
    expect(deriveHungerThirstTier({ ...base, foodTier: 9, drinkTier: -2 })).toBe(4); // clamped
  });
});
