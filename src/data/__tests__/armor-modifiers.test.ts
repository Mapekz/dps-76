import { describe, it, expect } from 'bun:test';
import { getArmorEffectModifiers, getArmorEffects } from '@/data/armor-modifiers';
import {
  BATTLE_LOADERS,
  EMERGENCY_PROTOCOLS,
  LIMIT_BREAKING,
  STRENGTH_2STAR,
  UNYIELDING,
} from './armor-test-helpers';

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

  it('includes Emergency Protocols as a single-checkbox misc PA effect', () => {
    const byId = new Map(effects.map((e) => [e.id, e]));
    const emergencyProtocols = byId.get(EMERGENCY_PROTOCOLS);
    expect(emergencyProtocols).toMatchObject({
      name: 'Emergency Protocols',
      group: 'misc',
      maxCount: 1,
      selfScaling: false,
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

  it('every returned effect that is NOT badged inert is engine-effective, with no leftover unresolved conditions', () => {
    for (const effect of effects) {
      if (effect.badge === 'inert') continue;
      expect(effect.modifiers.length).toBeGreaterThan(0);
      for (const m of effect.modifiers) {
        expect(m.conditions.some((c) => c.kind === 'unresolved')).toBe(false);
      }
    }
  });

  it('the roster now includes non-engine-effective entries, badged inert', () => {
    const inert = effects.filter((e) => e.badge === 'inert');
    expect(inert.length).toBeGreaterThan(0);
  });
});

describe('wornPieces stacking curves (armor legendaries)', () => {
  // The curve IS the authored stacking table — x = worn pieces, y = the
  // TOTAL effect at that count (Hunter's 1−0.85ⁿ; USER-CONFIRMED
  // 2026-08-20). Assembly evaluates it AT the checklist count and emits a
  // flat value; nothing multiplies per-piece by hand, and no wornPieces
  // curve may leak past assembly into the engine.
  it("Hunter's evaluates its piece-count curve at the selected count", () => {
    const valueAt = (n: number): number => {
      const m = getArmorEffectModifiers('live', { mod_Legendary_Armor1_LessDMGAnimals: n })[0];
      // Assembly emits the value arm of the union — narrow before reading.
      if (!m || !('value' in m) || typeof m.value !== 'number') throw new Error('no flat value');
      return m.value;
    };
    expect(valueAt(1)).toBeCloseTo(-0.15, 10);
    expect(valueAt(3)).toBeCloseTo(-0.3859, 10);
    expect(valueAt(5)).toBeCloseTo(-0.5563, 10);
    // 1−0.85ⁿ shape: 2 pieces is NOT 2×15%.
    expect(valueAt(2)).toBeCloseTo(-(1 - 0.85 ** 2), 3);
  });

  it('no wornPieces curve survives assembly for any full selection', () => {
    const all: Record<string, number> = {};
    for (const e of getArmorEffects('live')) all[e.id] = e.maxCount;
    for (const m of getArmorEffectModifiers('live', all)) {
      expect(m.curve?.input === 'wornPieces').toBe(false);
    }
  });
});
