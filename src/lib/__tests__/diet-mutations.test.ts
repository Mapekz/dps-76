import { describe, it, expect } from 'vitest';
import type { GeneratedBuff } from '@/types/generated';
import type { Modifier } from '@/types/modifiers';
import {
  applyDietScaling,
  CARNIVORE_MUTATION_ID,
  dietSuppressionLabel,
  dietVerdict,
  HERBIVORE_MUTATION_ID,
  isDietMutation,
} from '@/lib/diet-mutations';
import { getBuffModifiers, getConsumables } from '@/data/buffs';

function mod(id: string, value = 3): Modifier {
  return {
    id,
    source: { kind: 'consumable', formId: '0xF00D', edid: 'TestFood', name: 'Test Food' },
    bucket: 'specialEndurance',
    op: 'ADD',
    conditions: [],
    value,
  };
}

function food(overrides: Partial<GeneratedBuff> = {}): GeneratedBuff {
  return {
    id: 'TestFood',
    formId: '0xF00D',
    name: 'Test Food',
    kind: 'consumable',
    category: 'food',
    modifiers: [mod('0xF00D:0')],
    foodScalableModifierIds: ['0xF00D:0'],
    ingredientKeywords: ['IngredientTypeMeat', 'MealTypeCooked'],
    notes: [],
    ...overrides,
  };
}

describe('isDietMutation', () => {
  it('is true for Carnivore and Herbivore, false for other mutations', () => {
    expect(isDietMutation(CARNIVORE_MUTATION_ID)).toBe(true);
    expect(isDietMutation(HERBIVORE_MUTATION_ID)).toBe(true);
    expect(isDietMutation('Mutation_SpeedDemon')).toBe(false);
  });
});

describe('dietVerdict (ESM perk-condition keyword sets)', () => {
  it('Carnivore doubles meat, zeroes vegetable', () => {
    expect(dietVerdict(food(), [CARNIVORE_MUTATION_ID])).toBe('doubled');
    expect(dietVerdict(food({ ingredientKeywords: ['IngredientTypeVegetable'] }), [CARNIVORE_MUTATION_ID])).toBe('zeroed');
  });

  it('Herbivore doubles vegetable/herb/fruit, zeroes meat', () => {
    for (const kw of ['IngredientTypeVegetable', 'IngredientTypeHerb', 'IngredientTypeFruit']) {
      expect(dietVerdict(food({ ingredientKeywords: [kw] }), [HERBIVORE_MUTATION_ID])).toBe('doubled');
    }
    expect(dietVerdict(food(), [HERBIVORE_MUTATION_ID])).toBe('zeroed');
  });

  it('the asymmetry is real: Carnivore leaves herb/fruit dishes untouched (only Vegetable is zeroed)', () => {
    expect(dietVerdict(food({ ingredientKeywords: ['IngredientTypeFruit'] }), [CARNIVORE_MUTATION_ID])).toBe(null);
    expect(dietVerdict(food({ ingredientKeywords: ['IngredientTypeHerb'] }), [CARNIVORE_MUTATION_ID])).toBe(null);
  });

  it('no diet mutation, no ingredient keywords, or no scalable modifiers → untouched', () => {
    expect(dietVerdict(food(), [])).toBe(null);
    expect(dietVerdict(food({ ingredientKeywords: [] }), [CARNIVORE_MUTATION_ID])).toBe(null);
    // Rudy's Pozole shape: meat-tagged but its modifiers lack the
    // SURV_EffectTypeFood* effect keywords.
    expect(dietVerdict(food({ foodScalableModifierIds: undefined }), [CARNIVORE_MUTATION_ID])).toBe(null);
  });

  it('meat+vegetable dish: zeroing wins for either mutation (entry points compose 2×0)', () => {
    const mixed = food({ ingredientKeywords: ['IngredientTypeMeat', 'IngredientTypeVegetable'] });
    expect(dietVerdict(mixed, [CARNIVORE_MUTATION_ID])).toBe('zeroed');
    expect(dietVerdict(mixed, [HERBIVORE_MUTATION_ID])).toBe('zeroed');
  });
});

describe('dietSuppressionLabel', () => {
  it('names the mutation that zeroes scalable food', () => {
    expect(dietSuppressionLabel(food(), [HERBIVORE_MUTATION_ID])).toBe('Herbivore');
    expect(dietSuppressionLabel(food({ ingredientKeywords: ['IngredientTypeVegetable'] }), [CARNIVORE_MUTATION_ID])).toBe(
      'Carnivore'
    );
    expect(dietSuppressionLabel(food(), [CARNIVORE_MUTATION_ID])).toBe(null);
    expect(dietSuppressionLabel(food(), [])).toBe(null);
  });
});

describe('applyDietScaling', () => {
  it('doubled: emits ×2.0 / ×2.5 Strange-in-Numbers-conditioned variants', () => {
    const result = applyDietScaling(food(), [CARNIVORE_MUTATION_ID]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ value: 6, conditions: [{ kind: 'strangeInNumbers', value: false }] });
    expect(result[1]).toMatchObject({ value: 7.5, conditions: [{ kind: 'strangeInNumbers', value: true }] });
    expect(result[0].id).not.toBe(result[1].id);
  });

  it('zeroed: scalable modifiers are dropped', () => {
    expect(applyDietScaling(food(), [HERBIVORE_MUTATION_ID])).toEqual([]);
  });

  it('non-scalable modifiers pass through untouched in a doubled buff (pozole exemption)', () => {
    const buff = food({
      modifiers: [mod('0xF00D:0'), mod('0xF00D:1', 1)],
      foodScalableModifierIds: ['0xF00D:0'],
    });
    const result = applyDietScaling(buff, [CARNIVORE_MUTATION_ID]);
    // scalable → 2 SIN variants; exempt one unchanged.
    expect(result).toHaveLength(3);
    expect(result.find(m => m.id === '0xF00D:1')).toMatchObject({ value: 1, conditions: [] });
  });

  it('curve-valued modifiers scale via curveScale', () => {
    const curveMod: Modifier = {
      id: '0xF00D:0',
      source: { kind: 'consumable', formId: '0xF00D', edid: 'TestFood', name: 'Test Food' },
      bucket: 'specialEndurance',
      op: 'ADD',
      conditions: [],
      curve: { input: 'healthFraction', points: [{ x: 0, y: 1 }, { x: 1, y: 0 }] },
      curveScale: 0.01,
    };
    const buff = food({ modifiers: [curveMod] });
    const result = applyDietScaling(buff, [CARNIVORE_MUTATION_ID]);
    expect(result[0]).toMatchObject({ curveScale: 0.02 });
    expect(result[1]).toMatchObject({ curveScale: 0.025 });
  });
});

describe('real extracted data (pins the 2026-07-13 ESM audit)', () => {
  const byId = new Map(getConsumables('live').map(b => [b.id, b]));

  it('Aged Mirelurk Queen Steak (meat): +3 END doubles under Carnivore', () => {
    const steak = byId.get('MirelurkQueenMeatTasty');
    expect(steak).toBeDefined();
    expect(dietVerdict(steak!, [CARNIVORE_MUTATION_ID])).toBe('doubled');
    const mods = getBuffModifiers('live', [CARNIVORE_MUTATION_ID], ['MirelurkQueenMeatTasty']);
    const endMods = mods.filter(m => m.bucket === 'specialEndurance');
    expect(endMods.map(m => ('value' in m ? m.value : null)).sort()).toEqual([6, 7.5]);
  });

  it("Rudy's Pozole: meat-tagged but its plain Fortify effects lack the food-scale keywords → exempt", () => {
    const pozole = byId.get('Moon_Rudy_Pozole');
    expect(pozole).toBeDefined();
    expect(pozole!.foodScalableModifierIds).toBeUndefined();
    expect(dietVerdict(pozole!, [CARNIVORE_MUTATION_ID])).toBe(null);
  });

  it('Carrot Soup (vegetable): zeroed under Carnivore, doubled under Herbivore', () => {
    const soup = byId.get('CarrotVegetableCookedSoup');
    expect(soup).toBeDefined();
    expect(dietVerdict(soup!, [CARNIVORE_MUTATION_ID])).toBe('zeroed');
    expect(dietVerdict(soup!, [HERBIVORE_MUTATION_ID])).toBe('doubled');
    expect(getBuffModifiers('live', [CARNIVORE_MUTATION_ID], ['CarrotVegetableCookedSoup'])).toEqual([]);
  });

  it('Wasteland Fish Sandwich (meat): zeroed under Herbivore, with an explicit suppression label', () => {
    const sandwich = byId.get('SeasonalFish_Meal_SummerWastelandFishSandwich');
    expect(sandwich).toBeDefined();
    expect(dietVerdict(sandwich!, [HERBIVORE_MUTATION_ID])).toBe('zeroed');
    expect(dietSuppressionLabel(sandwich!, [HERBIVORE_MUTATION_ID])).toBe('Herbivore');
    const mods = getBuffModifiers('live', [HERBIVORE_MUTATION_ID], ['SeasonalFish_Meal_SummerWastelandFishSandwich']);
    expect(mods.some(m => m.bucket === 'moveSpeedBonus')).toBe(false);
  });

  it('no damage-relevant food carries both meat and vegetable tags (composition rule stays theoretical)', () => {
    for (const buff of byId.values()) {
      const kw = new Set(buff.ingredientKeywords ?? []);
      expect(kw.has('IngredientTypeMeat') && kw.has('IngredientTypeVegetable'), buff.id).toBe(false);
    }
  });
});
