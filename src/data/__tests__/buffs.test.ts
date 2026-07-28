import { describe, it, expect } from 'vitest';
import { hasAnyEngineEffect } from '@/types/modifiers';
import { consumablesById } from '@/lib/consumable-rules';
import { getConsumables } from '../buffs';

describe('consumable picker', () => {
  it('keeps known junk hidden (quest-bound items stripped on completion)', () => {
    const ids = getConsumables('live').map((c) => c.id);
    for (const id of [
      // Nuclear Don's Custom Chem Blend: "The Ol' Weston Shuffle" quest item,
      // auto-removed from inventory on quest completion if unconsumed — not a
      // chem a build can rely on having. See overrides/corrections.ts.
      'W05_MQR_203P_ChemBlend',
    ]) {
      expect(ids, id).not.toContain(id);
    }
  });

  it('the Wasteland Fish Sandwich is visible as a selectable food', () => {
    const sandwich = getConsumables('live').find(
      (c) => c.id === 'SeasonalFish_Meal_SummerWastelandFishSandwich',
    );
    expect(sandwich).toBeDefined();
    expect(consumablesById('live').has('SeasonalFish_Meal_SummerWastelandFishSandwich')).toBe(true);
    expect(sandwich!.category).toBe('food');
    expect(sandwich!.obtainable).not.toBe(false);
  });
});

describe('consumable "no effect yet" badge (hasAnyEngineEffect over item.modifiers)', () => {
  const byId = (id: string) => getConsumables('live').find((c) => c.id === id);

  it('flags Med-X, a zero-modifier chem, as no-effect', () => {
    const medX = byId('MedX');
    expect(medX).toBeDefined();
    expect(hasAnyEngineEffect(medX!.modifiers)).toBe(false);
  });

  it('does not flag Tesla Science 5 — resolved via buffValueOverrides (concurrent work) to a real weaponClass-gated ammoFreeChance', () => {
    const teslaScience5 = byId('Magazine_TeslaScience05_Potion');
    expect(teslaScience5).toBeDefined();
    expect(hasAnyEngineEffect(teslaScience5!.modifiers)).toBe(true);
  });

  it('does not flag the Wasteland Fish Sandwich, whose only modifier feeds Fast Fighter conditionally', () => {
    const sandwich = byId('SeasonalFish_Meal_SummerWastelandFishSandwich');
    expect(sandwich).toBeDefined();
    expect(hasAnyEngineEffect(sandwich!.modifiers)).toBe(true);
  });

  it('does not flag wired magazines/bobbleheads — overrides replace unresolved conditions', () => {
    for (const id of [
      'BobbleHead_BigGuns_Potion',
      'Magazine_USCovertOps08_Potion',
      'Magazine_AwesomeTales10_Potion',
      'Magazine_LiveAndLove05_Potion',
    ]) {
      const item = byId(id);
      expect(item, id).toBeDefined();
      expect(hasAnyEngineEffect(item!.modifiers), id).toBe(true);
    }
  });
});
