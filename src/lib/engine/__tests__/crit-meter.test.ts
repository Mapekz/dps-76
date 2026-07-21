import { describe, it, expect } from 'vitest';
import { getWeapons } from '@/data';
import { getLoadoutModifiers } from '@/data/perk-modifiers';
import { getArmorEffectModifiers, getArmorEffectWornPieceCounts } from '@/data/armor-modifiers';
import { PerkId } from '@/data/perk-ids';
import { computeCritMeter } from '@/lib/engine/crit-meter';
import type { ResolveContext } from '@/lib/engine/resolve';
import { createDefaultEnemyConditions, createDefaultPlayerConditions } from '@/types';

/** Limit-Breaking Armor's checklist id (5-tier critConsumption, wornPieceCount-gated). */
const LIMIT_BREAKING_ID = 'mod_Legendary_Armor4_LimitBreak';

function ctx(overrides: Partial<ResolveContext['player']> = {}): ResolveContext {
  return {
    weapon: getWeapons('live')['CombatRifle_Fixer'],
    player: { ...createDefaultPlayerConditions(), ...overrides },
    enemy: createDefaultEnemyConditions(),
    scenario: { isVats: true, isSneaking: false, isPowerAttack: false, isCrit: false },
  };
}

const fixer = getWeapons('live')['CombatRifle_Fixer'];

describe('computeCritMeter', () => {
  it('baseline: 15 LCK, no perks → crit every 5th shot', () => {
    const result = computeCritMeter([], fixer, ctx());
    expect(result.fillPerHit).toBeCloseTo(27.5, 6); // 5 + 1.5×15
    expect(result.consumption).toBe(100);
    expect(result.shotsPerCrit).toBe(5);
    expect(result.critRate).toBeCloseTo(0.2, 10);
  });

  it('user anchor: 16 LCK + Crit Savvy 3 + 5× Limit Breaking → crit every 2nd shot', () => {
    // Critical Savvy rank 3 SETs consumption to 55. Limit-Breaking Armor at
    // 5 worn pieces (Armor checklist, self-scaling — its modifiers
    // carry their own wornPieceCount tiers) MUL_ADDs −50%.
    const selections = { [LIMIT_BREAKING_ID]: 5 };
    const mods = [
      ...getLoadoutModifiers('live', [{ perkId: PerkId.CriticalSavvy, rank: 3 }]),
      ...getArmorEffectModifiers('live', selections),
    ];
    const wornPieceCounts = getArmorEffectWornPieceCounts('live', selections);
    const result = computeCritMeter(mods, fixer, ctx({ luck: 16, wornPieceCounts }));
    expect(result.fillPerHit).toBeCloseTo(29, 6);
    expect(result.consumption).toBeCloseTo(27.5, 6);
    expect(result.shotsPerCrit).toBe(2);
    expect(result.critRate).toBeCloseTo(0.5, 10);
  });

  it('crit rate never exceeds every-other-shot', () => {
    const selections = { [LIMIT_BREAKING_ID]: 5 };
    const wornPieceCounts = getArmorEffectWornPieceCounts('live', selections);
    const result = computeCritMeter(getArmorEffectModifiers('live', selections), fixer, ctx({ luck: 100, wornPieceCounts }));
    expect(result.critRate).toBeLessThanOrEqual(0.5);
  });
});
