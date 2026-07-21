import { describe, it, expect } from 'vitest';
import { getLoadoutModifiers } from '@/data/perk-modifiers';
import { computePerkBudget } from '@/data/perk-budget';
import { PerkId } from '@/data/perk-ids';
import {
  derivePlayerStats,
  deriveClassFreakRank,
  legendarySlotsAtLevel,
  specialAllocationPool,
  BASE_MAX_HP,
  MAX_HP_PER_ENDURANCE,
  PLAYER_LEVEL,
  SPECIAL_ALLOCATION_POOL,
  SPECIAL_KEYS,
  type SpecialKey,
} from '@/lib/player-stats';
import { applyClassFreakPenaltyScaling } from '@/lib/class-freak-mutations';
import { createDefaultPlayerConditions } from '@/types';
import type { GeneratedBuff } from '@/types/generated';
import type { Bucket, Condition, Modifier } from '@/types/modifiers';

function baseSpecial(overrides: Partial<Record<SpecialKey, number>> = {}): Record<SpecialKey, number> {
  return { ...(Object.fromEntries(SPECIAL_KEYS.map(k => [k, 1])) as Record<SpecialKey, number>), ...overrides };
}

function specialMod(bucket: Bucket, value: number, conditions: Condition[] = [], id = 'test-special-mod'): Modifier {
  return {
    id,
    source: { kind: 'mutation', formId: '0xC1A55', edid: 'TestMutation', name: 'Test Mutation' },
    bucket,
    op: 'ADD',
    value,
    conditions,
  };
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

  it('Lifegiver is a single live rank — an out-of-range rank clamps to rank 1 (ranks 2/3 are dead content)', () => {
    const lifegiver = getLoadoutModifiers('live', [{ perkId: PerkId.LifeGiver, rank: 3 }]);
    const { maxHealth } = derivePlayerStats(lifegiver, baseSpecial({ endurance: 15 }), conditions);
    expect(maxHealth).toBe(BASE_MAX_HP + MAX_HP_PER_ENDURANCE * 15 + 120);
  });

  it('Lifegiver interpolates the curve between END points', () => {
    const lifegiver = getLoadoutModifiers('live', [{ perkId: PerkId.LifeGiver, rank: 1 }]);
    const { maxHealth } = derivePlayerStats(lifegiver, baseSpecial({ endurance: 8 }), conditions);
    // Between (1,10) and (15,120): 10 + (8−1)/(15−1)×110 = 65.
    expect(maxHealth).toBe(BASE_MAX_HP + MAX_HP_PER_ENDURANCE * 8 + 65);
  });
});

describe('derivePlayerStats: effective SPECIAL clamp', () => {
  it('defaults to [1, 100] (the SPECIAL AVIF floor/ceiling) when no clamp is passed', () => {
    const debuff = specialMod('specialStrength', -50);
    const buff = specialMod('specialLuck', 500);
    const { special } = derivePlayerStats([debuff, buff], baseSpecial({ strength: 5, luck: 5 }), conditions);
    expect(special.strength).toBe(1); // 5 - 50 floors at the default min
    expect(special.luck).toBe(100); // 5 + 500 ceils at the default max
  });

  it('honors a caller-supplied clamp (the live ESM-extracted value) over the fallback default', () => {
    const buff = specialMod('specialLuck', 500);
    const { special } = derivePlayerStats(
      [buff],
      baseSpecial({ luck: 5 }),
      conditions,
      undefined,
      undefined,
      undefined,
      [],
      { min: 1, max: 120 }
    );
    expect(special.luck).toBe(120); // custom ceiling, not the [1,100] fallback
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

describe('deriveClassFreakRank', () => {
  it('reads the equipped ClassFreak card rank, defaulting to 0 and ignoring other perks', () => {
    expect(deriveClassFreakRank([])).toBe(0);
    expect(deriveClassFreakRank([{ perkId: PerkId.ClassFreak, rank: 2 }])).toBe(2);
    expect(deriveClassFreakRank([{ perkId: PerkId.LifeGiver, rank: 3 }])).toBe(0);
  });
});

describe('derivePlayerStats: condition-aware SPECIAL folds (2026-07-14)', () => {
  it('classFreakRank-gated SPECIAL modifiers (Egg Head STR shape) apply only at their exact tier', () => {
    // Real shape: applyClassFreakPenaltyScaling expands a tagged flat
    // modifier into 4 rank-conditioned variants (×1/×0.75/×0.5/×0.25).
    const strengthPenalty: GeneratedBuff = {
      id: 'TestMutation',
      formId: '0xC1A55',
      name: 'Test Mutation',
      kind: 'mutation',
      modifiers: [specialMod('specialStrength', -3, [], '0xC1A55:0')],
      notes: [],
      penaltyModifierIds: ['0xC1A55:0'],
    };
    const variants = applyClassFreakPenaltyScaling(strengthPenalty);
    expect(variants).toHaveLength(4);

    const rank0 = derivePlayerStats(variants, baseSpecial({ strength: 10 }), { ...conditions, classFreakRank: 0 });
    expect(rank0.special.strength).toBe(7); // 10 + (−3 × 1)

    const rank2 = derivePlayerStats(variants, baseSpecial({ strength: 10 }), { ...conditions, classFreakRank: 2 });
    expect(rank2.special.strength).toBe(8.5); // 10 + (−3 × 0.5)
  });

  it('teammateCount-gated SPECIAL modifiers pick by team state (Herd Mentality shape)', () => {
    const herdMentality = [
      specialMod('specialLuck', -2, [{ kind: 'teammateCount', count: 0 }], 'herd:solo'),
      specialMod('specialLuck', 2, [{ kind: 'teammateCount', count: 1, orMore: true }], 'herd:team'),
    ];

    const solo = derivePlayerStats(herdMentality, baseSpecial({ luck: 5 }), { ...conditions, teammateCount: 0 });
    expect(solo.special.luck).toBe(3); // 5 − 2

    const inTeam = derivePlayerStats(herdMentality, baseSpecial({ luck: 5 }), { ...conditions, teammateCount: 2 });
    expect(inTeam.special.luck).toBe(7); // 5 + 2
  });

  it('strangeInNumbers-gated SPECIAL modifiers pick by SIN state (Egg Head INT shape)', () => {
    const eggHeadInt = [
      specialMod('specialIntelligence', 6, [{ kind: 'strangeInNumbers', value: false }], 'sin:false'),
      specialMod('specialIntelligence', 8, [{ kind: 'strangeInNumbers', value: true }], 'sin:true'),
    ];

    const withoutSin = derivePlayerStats(eggHeadInt, baseSpecial({ intelligence: 5 }), {
      ...conditions,
      strangeInNumbers: false,
    });
    expect(withoutSin.special.intelligence).toBe(11); // 5 + 6

    const withSin = derivePlayerStats(eggHeadInt, baseSpecial({ intelligence: 5 }), {
      ...conditions,
      strangeInNumbers: true,
    });
    expect(withSin.special.intelligence).toBe(13); // 5 + 8
  });

  it('United Ordeal shape: SPECIAL modifiers gated on BOTH playerIsGhoul and teammateCount only apply when both hold', () => {
    // Real shape (GHL_UnitedOrdeal rank 1): each of the 7 SPECIAL ADDs carries
    // TWO conditions on the same modifier — playerIsGhoul:true AND
    // teammateCount>=1 — both must resolve for the fold to apply.
    const unitedOrdealRank1 = [
      specialMod(
        'specialStrength',
        1,
        [
          { kind: 'playerIsGhoul', value: true },
          { kind: 'teammateCount', count: 1, orMore: true },
        ],
        'united-ordeal:str'
      ),
      specialMod(
        'specialLuck',
        1,
        [
          { kind: 'playerIsGhoul', value: true },
          { kind: 'teammateCount', count: 1, orMore: true },
        ],
        'united-ordeal:lck'
      ),
    ];

    const ghoulInTeam = derivePlayerStats(unitedOrdealRank1, baseSpecial({ strength: 5, luck: 5 }), {
      ...conditions,
      isGhoul: true,
      teammateCount: 1,
    });
    expect(ghoulInTeam.special.strength).toBe(6); // 5 + 1
    expect(ghoulInTeam.special.luck).toBe(6); // 5 + 1

    const ghoulSolo = derivePlayerStats(unitedOrdealRank1, baseSpecial({ strength: 5, luck: 5 }), {
      ...conditions,
      isGhoul: true,
      teammateCount: 0,
    });
    expect(ghoulSolo.special.strength).toBe(5); // teammateCount condition fails
    expect(ghoulSolo.special.luck).toBe(5);

    const humanInTeam = derivePlayerStats(unitedOrdealRank1, baseSpecial({ strength: 5, luck: 5 }), {
      ...conditions,
      isGhoul: false,
      teammateCount: 1,
    });
    expect(humanInTeam.special.strength).toBe(5); // playerIsGhoul condition fails
    expect(humanInTeam.special.luck).toBe(5);
  });
});

describe('level-derived allocation pools (DFOB-bridged curves)', () => {
  it('SPECIAL pool: 7 starting points + 49 level-ups = 56 at level 50 and beyond', () => {
    expect(specialAllocationPool(50)).toBe(56);
    expect(specialAllocationPool(300)).toBe(56); // curve clamps flat past its (50, 49) endpoint
    expect(SPECIAL_ALLOCATION_POOL).toBe(56); // the PLAYER_LEVEL=300 default consumers read
  });

  it('SPECIAL pool grows +1 per level from 7 at level 1', () => {
    expect(specialAllocationPool(1)).toBe(7);
    expect(specialAllocationPool(2)).toBe(8);
    expect(specialAllocationPool(25)).toBe(31);
  });

  it('legendary slots: unlock levels 50/75/100/150/200/300 per the LegendaryPerkSlotCount curve', () => {
    expect(legendarySlotsAtLevel(PLAYER_LEVEL)).toBe(6);
    expect(legendarySlotsAtLevel(100)).toBe(3);
    expect(legendarySlotsAtLevel(74)).toBe(1);
    expect(legendarySlotsAtLevel(49)).toBe(0);
  });
});
