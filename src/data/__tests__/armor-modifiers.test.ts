import { describe, it, expect } from 'bun:test';
import {
  getArmorEffects,
  getArmorEffectModifiers,
  getArmorEffectWornPieceCounts,
  getArmorTierUsage,
  clampArmorTierBudgets,
  MAX_LEGENDARY_COUNT,
} from '@/data/armor-modifiers';
import { effectiveValue, type ResolveContext } from '@/lib/engine/resolve';
import { resolveLoadout } from '@/lib/loadout';
import { getLoadoutModifiers } from '@/data/perk-modifiers';
import { getWeapons } from '@/data';
import { PerkId } from '@/data/perk-ids';
import {
  createDefaultEnemyConditions,
  createDefaultEnemyConfig,
  createDefaultPlayerConditions,
  createDefaultPlayerConfig,
  type PlayerConfig,
} from '@/types';

const UNYIELDING = 'mod_Legendary_Armor1_LowHealthIncreasesStats';
const STRENGTH_2STAR = 'mod_Legendary_Armor2_StatStrength';
const BATTLE_LOADERS = 'mod_Legendary_Armor4_BattleLoaders';
const LIMIT_BREAKING = 'mod_Legendary_Armor4_LimitBreak';

const fixer = getWeapons('live')['CombatRifle_Fixer'];

function ctx(overrides: Partial<ResolveContext['player']> = {}): ResolveContext {
  return {
    weapon: fixer,
    player: { ...createDefaultPlayerConditions(), ...overrides },
    enemy: createDefaultEnemyConditions(),
    scenario: { isVats: false, isSneaking: false, isPowerAttack: false, isCrit: false },
  };
}

describe('getArmorEffects (curated inventory)', () => {
  const effects = getArmorEffects('live');

  it('includes the named priority effects with the expected classification', () => {
    const byId = new Map(effects.map((e) => [e.id, e]));
    expect(byId.get(UNYIELDING)).toMatchObject({
      name: 'Unyielding',
      group: 'legendary',
      maxCount: 5,
      selfScaling: false,
    });
    expect(byId.get(STRENGTH_2STAR)).toMatchObject({
      name: 'Strength',
      group: 'legendary',
      maxCount: 5,
      selfScaling: false,
    });
    expect(byId.get(BATTLE_LOADERS)).toMatchObject({
      name: "Battle-Loader's",
      group: 'legendary',
      maxCount: 5,
      selfScaling: true,
      wornPieceKeyword: 'HasLegendary_Armor_BattleLoaders',
    });
    expect(byId.get(LIMIT_BREAKING)).toMatchObject({
      name: 'Limit-Breaking',
      group: 'legendary',
      maxCount: 5,
      selfScaling: true,
      wornPieceKeyword: 'HasLegendary_Armor_LimitBreak',
    });
  });

  it("excludes known-bad records (Overeater's, Punishing) and broken duplicates never show up twice", () => {
    const names = effects.map((e) => e.name);
    expect(names).not.toContain("Overeater's");
    expect(names).not.toContain('Punishing');
    // Armor + power-armor variants dedupe into exactly one row per name.
    expect(names.filter((n) => n === "Battle-Loader's")).toHaveLength(1);
    expect(names.filter((n) => n === "Bruiser's")).toHaveLength(1);
  });

  it('every returned effect is engine-effective and every modifier folds cleanly (no leftover unresolved conditions)', () => {
    for (const effect of effects) {
      expect(effect.modifiers.length).toBeGreaterThan(0);
      for (const m of effect.modifiers) {
        expect(m.conditions.some((c) => c.kind === 'unresolved')).toBe(false);
      }
    }
  });
});

describe("ArmorStarTier: derived from the representative record's ap_LegendaryN attach point", () => {
  const effects = getArmorEffects('live');
  const byId = new Map(effects.map((e) => [e.id, e]));

  it('assigns the tier read directly off armor-omods.json attachPointEdid for known effects', () => {
    // Unyielding: mod_Legendary_Armor1_LowHealthIncreasesStats @ ap_Legendary1.
    expect(byId.get(UNYIELDING)?.starTier).toBe(1);
    // 2★ Strength: mod_Legendary_Armor2_StatStrength @ ap_Legendary2.
    expect(byId.get(STRENGTH_2STAR)?.starTier).toBe(2);
    // Battle-Loader's and Limit-Breaking: mod_Legendary_Armor4_* @ ap_Legendary4.
    expect(byId.get(BATTLE_LOADERS)?.starTier).toBe(4);
    expect(byId.get(LIMIT_BREAKING)?.starTier).toBe(4);
  });

  it(
    'Powered is a pre-existing data ambiguity: a non-obtainable tier-1 twin ' +
      '(mod_Legendary_Armor_APRegen @ ap_Legendary1) is filtered out by obtainability, ' +
      'leaving the tier-2 record (mod_Legendary_Armor2_APRegen @ ap_Legendary2) as the ' +
      'sole survivor and thus the representative — Powered counts against the 2★ budget',
    () => {
      const powered = effects.find((e) => e.name === 'Powered');
      expect(powered?.id).toBe('mod_Legendary_Armor2_APRegen');
      expect(powered?.starTier).toBe(2);
    },
  );

  it('misc-group entries never carry a starTier', () => {
    const misc = effects.filter((e) => e.group === 'misc');
    expect(misc.length).toBeGreaterThan(0); // sanity: misc group is non-empty
    for (const e of misc) expect(e.starTier).toBeUndefined();
  });
});

describe('getArmorTierUsage', () => {
  it('sums selected counts within a tier and ignores misc/unknown ids', () => {
    const usage = getArmorTierUsage('live', {
      [UNYIELDING]: 3, // tier 1
      [STRENGTH_2STAR]: 2, // tier 2
      mod_armor_UnderArmor_style_BOS: 1, // misc — ignored
      not_a_real_armor_effect_id: 5, // unknown — ignored
    });
    expect(usage).toEqual({ 1: 3, 2: 2, 3: 0, 4: 0 });
  });

  it('sums multiple effects sharing the same tier', () => {
    const usage = getArmorTierUsage('live', {
      [BATTLE_LOADERS]: 3, // tier 4
      [LIMIT_BREAKING]: 2, // tier 4
    });
    expect(usage[4]).toBe(5); // 3 + 2
  });

  it('returns all-zero for empty selections', () => {
    expect(getArmorTierUsage('live', {})).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0 });
  });
});

describe('clampArmorTierBudgets', () => {
  it('two same-tier effects summing over the budget: first-inserted keeps its full count, second is trimmed to the remainder', () => {
    // Battle-Loader's + Limit-Breaking are both tier 4; 3 + 4 = 7 > MAX_LEGENDARY_COUNT (5).
    const input = { [BATTLE_LOADERS]: 3, [LIMIT_BREAKING]: 4 };
    const { armorEffects, changed } = clampArmorTierBudgets('live', input);
    expect(armorEffects).toEqual({ [BATTLE_LOADERS]: 3, [LIMIT_BREAKING]: 2 });
    expect(changed).toBe(true);
  });

  it('an entry trimmed all the way to 0 is omitted from the result, not kept as an explicit zero', () => {
    // Strength fills the whole tier-2 budget; Powered (also tier 2) has nothing left.
    const input = { [STRENGTH_2STAR]: MAX_LEGENDARY_COUNT, mod_Legendary_Armor2_APRegen: 3 };
    const { armorEffects, changed } = clampArmorTierBudgets('live', input);
    expect(armorEffects).toEqual({ [STRENGTH_2STAR]: MAX_LEGENDARY_COUNT });
    expect('mod_Legendary_Armor2_APRegen' in armorEffects).toBe(false);
    expect(changed).toBe(true);
  });

  it('a legal map (every tier under budget) is returned unchanged, with changed:false', () => {
    const input = { [UNYIELDING]: 3, [STRENGTH_2STAR]: 2, [BATTLE_LOADERS]: 5 };
    const { armorEffects, changed } = clampArmorTierBudgets('live', input);
    expect(armorEffects).toEqual(input);
    expect(changed).toBe(false);
  });

  it('misc and unknown ids pass through untouched and never count against a tier budget', () => {
    const input = {
      [STRENGTH_2STAR]: MAX_LEGENDARY_COUNT,
      mod_armor_UnderArmor_style_BOS: 1,
      not_a_real_armor_effect_id: 42,
    };
    const { armorEffects, changed } = clampArmorTierBudgets('live', input);
    expect(armorEffects).toEqual(input);
    expect(changed).toBe(false);
  });
});

describe('getArmorEffectModifiers: per-piece scaling', () => {
  it('2★ Strength scales value ×count (flat ADD)', () => {
    const at0 = getArmorEffectModifiers('live', { [STRENGTH_2STAR]: 0 });
    expect(at0).toHaveLength(0);

    const at3 = getArmorEffectModifiers('live', { [STRENGTH_2STAR]: 3 });
    expect(at3).toHaveLength(1);
    expect(at3[0].bucket).toBe('specialStrength');
    expect(at3[0].curve).toBeUndefined();
    expect((at3[0] as { value: number }).value).toBeCloseTo(6, 10); // 2 × 3

    // Clamped to maxCount (5) even if a stale/adversarial selection asks for more.
    const over = getArmorEffectModifiers('live', { [STRENGTH_2STAR]: 99 });
    expect((over[0] as { value: number }).value).toBeCloseTo(10, 10); // 2 × 5
  });

  it('Unyielding scales curveScale ×count, verified against the hand-computed curve at 0% HP', () => {
    const at3 = getArmorEffectModifiers('live', { [UNYIELDING]: 3 });
    expect(at3).toHaveLength(6); // 6 SPECIALs (all but Endurance)
    const strengthMod = at3.find((m) => m.bucket === 'specialStrength')!;
    if (!strengthMod.curve) throw new Error('expected a curve-driven modifier');
    expect(strengthMod.curveScale).toBeCloseTo(3, 10); // base curveScale 1 × count 3

    // At 0% HP the curve's per-piece Y is 3 (the curve's own first point) —
    // 3 pieces should read 3× that: 9.
    const atZeroHp = ctx({ healthPercent: 0 });
    expect(effectiveValue(strengthMod, atZeroHp)).toBeCloseTo(9, 10);

    // Above the 60% HP threshold the curve Y is 0 regardless of count.
    const atFullHp = ctx({ healthPercent: 100 });
    expect(effectiveValue(strengthMod, atFullHp)).toBeCloseTo(0, 10);

    // count=1 (one piece) at 0% HP reads the raw per-piece value (3), not 9.
    const at1 = getArmorEffectModifiers('live', { [UNYIELDING]: 1 });
    const strengthAt1 = at1.find((m) => m.bucket === 'specialStrength')!;
    expect(effectiveValue(strengthAt1, atZeroHp)).toBeCloseTo(3, 10);
  });
});

describe('getArmorEffectModifiers + getArmorEffectWornPieceCounts: self-scaling effects', () => {
  it("Battle-Loader's: selections {battleLoaders: 3} activate exactly the count=3 tier (0.45), others inactive", () => {
    const selections = { [BATTLE_LOADERS]: 3 };
    const modifiers = getArmorEffectModifiers('live', selections);
    expect(modifiers).toHaveLength(5); // unscaled — all 5 tiers pass through

    const wornPieceCounts = getArmorEffectWornPieceCounts('live', selections);
    expect(wornPieceCounts).toMatchObject({ HasLegendary_Armor_BattleLoaders: 3 });

    const resolveCtx = ctx({ wornPieceCounts });
    const activeValues = modifiers
      .map((m) => effectiveValue(m, resolveCtx))
      .filter((v): v is number => v !== null);
    expect(activeValues).toEqual([0.45]);
  });

  it("Battle-Loader's: modifiers carry the bash-triggered reloadSkipChanceBash bucket, not the passive reloadSkipChance channel (Phase C)", () => {
    const modifiers = getArmorEffectModifiers('live', { [BATTLE_LOADERS]: 3 });
    expect(modifiers.length).toBeGreaterThan(0);
    expect(modifiers.every((m) => m.bucket === 'reloadSkipChanceBash')).toBe(true);
    expect(modifiers.some((m) => m.bucket === 'reloadSkipChance')).toBe(false);
  });

  it("Battle-Loader's: 0 selected pieces activates nothing", () => {
    const modifiers = getArmorEffectModifiers('live', {});
    expect(modifiers).toHaveLength(0); // count 0 → not even emitted
  });

  it("Battle-Loader's: 5 pieces activates the ≥5 (orMore) tier at 0.75, not the exact-4 tier", () => {
    const selections = { [BATTLE_LOADERS]: 5 };
    const modifiers = getArmorEffectModifiers('live', selections);
    const wornPieceCounts = getArmorEffectWornPieceCounts('live', selections);
    const resolveCtx = ctx({ wornPieceCounts });
    const activeValues = modifiers
      .map((m) => effectiveValue(m, resolveCtx))
      .filter((v): v is number => v !== null);
    expect(activeValues).toEqual([0.75]);
  });
});

describe('Number Cruncher exemption: armor selections never feed scaledByWeaponApCost', () => {
  const nc = getLoadoutModifiers('live', [{ perkId: PerkId.NumberCruncher, rank: 1 }]);

  function resolve(armorEffects: Record<string, number>) {
    const playerConfig: PlayerConfig = {
      ...createDefaultPlayerConfig(),
      weapon: { weaponId: 'CombatRifle_Fixer', mods: {}, legendaryEffects: [] },
      armorEffects,
    };
    const result = resolveLoadout(playerConfig, createDefaultEnemyConfig(), 'live');
    expect(result).not.toBeNull();
    return result!;
  }

  it("the effective weapon's apCost is identical with and without armor selections", () => {
    const bare = resolve({});
    const withArmor = resolve({ [BATTLE_LOADERS]: 5, [UNYIELDING]: 5, [STRENGTH_2STAR]: 5 });
    expect(withArmor.weapon.apCost).toBe(bare.weapon.apCost);
  });

  it("Number Cruncher's dbm scaling is unaffected by armor selections (same weapon, same perk)", () => {
    const bareMods = [...nc];
    const armorMods = getArmorEffectModifiers('live', {
      [BATTLE_LOADERS]: 5,
      [UNYIELDING]: 5,
      [STRENGTH_2STAR]: 5,
    });
    const bare = resolveLoadout(
      {
        ...createDefaultPlayerConfig(),
        weapon: { weaponId: 'CombatRifle_Fixer', mods: {}, legendaryEffects: [] },
        perks: [{ perkId: PerkId.NumberCruncher, rank: 1 }],
      },
      createDefaultEnemyConfig(),
      'live',
    )!;
    const withArmor = resolveLoadout(
      {
        ...createDefaultPlayerConfig(),
        weapon: { weaponId: 'CombatRifle_Fixer', mods: {}, legendaryEffects: [] },
        perks: [{ perkId: PerkId.NumberCruncher, rank: 1 }],
        armorEffects: { [BATTLE_LOADERS]: 5, [UNYIELDING]: 5, [STRENGTH_2STAR]: 5 },
      },
      createDefaultEnemyConfig(),
      'live',
    )!;
    expect(withArmor.weapon.apCost).toBe(bare.weapon.apCost);
    expect(bareMods.length).toBeGreaterThan(0);
    expect(armorMods.length).toBeGreaterThan(0);
  });
});
