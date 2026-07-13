import type { GeneratedBuff } from '@/types/generated';
import type { Modifier } from '@/types/modifiers';

/**
 * Carnivore's / Herbivore's food scaling (dps-todos/carnivore-herbivore.md).
 *
 * ESM-proven mechanic (Mutation_Carnivore / Mutation_Herbivore SPELs grant
 * Script-MGEF perks whose "Mod Spell Magnitude" entry points multiply food
 * effect magnitudes):
 *
 * - Carnivore (Mutation_EatAllTheMeat_Perk): ×2.0 on spells with
 *   IngredientTypeMeat — ×2.5 when Strange in Numbers applies
 *   (Mutation_Check_UseSuperVersion, the same SIN gate as every mutation).
 *   Mutation_EatNoVeggies_Perk: ×0 on spells with IngredientTypeVegetable.
 * - Herbivore (Mutation_EatAllTheVeggies_Perk): ×2.0/×2.5 on spells with
 *   IngredientTypeVegetable OR IngredientTypeHerb OR IngredientTypeFruit.
 *   Mutation_EatNoMeat_Perk: ×0 on spells with IngredientTypeMeat.
 *
 * The asymmetry is real: Carnivore only ZEROES Vegetable-tagged food — a
 * pure Herb/Fruit dish keeps its (undoubled) benefit under Carnivore.
 *
 * Effect-level gate: only modifiers whose source MGEF carries a
 * SURV_EffectTypeFood{Buff,Hunger,Healing} keyword scale — captured at
 * extraction as `GeneratedBuff.foodScalableModifierIds` (the one live
 * exception is Rudy's Pozole's plain FortifyCharisma/FortifyLuck effects).
 *
 * A food tagged BOTH meat and vegetable would compose ×2 × ×0 = 0 for either
 * mutation (entry-point multiplies compose); no such record exists in the
 * damage-relevant roster today. Carnivore + Herbivore together is impossible
 * in-game — the build reducer enforces the exclusivity.
 */

export const CARNIVORE_MUTATION_ID = 'Mutation_Carnivore';
export const HERBIVORE_MUTATION_ID = 'Mutation_Herbivore';

const MEAT_KEYWORD = 'IngredientTypeMeat';
const HERBIVORE_KEYWORDS = ['IngredientTypeVegetable', 'IngredientTypeHerb', 'IngredientTypeFruit'];
const CARNIVORE_ZEROED_KEYWORD = 'IngredientTypeVegetable';

export type DietVerdict = 'doubled' | 'zeroed' | null;

/** How the active diet mutation (if any) treats this consumable's scalable effects. */
export function dietVerdict(buff: GeneratedBuff, mutationIds: readonly string[]): DietVerdict {
  if (!buff.foodScalableModifierIds?.length) return null;
  const kw = new Set(buff.ingredientKeywords ?? []);
  const carnivore = mutationIds.includes(CARNIVORE_MUTATION_ID);
  const herbivore = mutationIds.includes(HERBIVORE_MUTATION_ID);
  // Zeroing wins over doubling (entry points compose multiplicatively: 2×0).
  if ((carnivore && kw.has(CARNIVORE_ZEROED_KEYWORD)) || (herbivore && kw.has(MEAT_KEYWORD))) return 'zeroed';
  if ((carnivore && kw.has(MEAT_KEYWORD)) || (herbivore && HERBIVORE_KEYWORDS.some(k => kw.has(k)))) {
    return 'doubled';
  }
  return null;
}

/** Scale one modifier's magnitude (plain value or curveScale) by `factor`. */
function scaled(m: Modifier, factor: number, idSuffix: string): Modifier {
  if (m.curve) return { ...m, id: `${m.id}${idSuffix}`, curveScale: m.curveScale * factor };
  return { ...m, id: `${m.id}${idSuffix}`, value: m.value * factor };
}

/**
 * A consumable's engine modifiers under the selected mutations. Doubled
 * buffs emit two Strange-in-Numbers-conditioned variants (×2.0 / ×2.5) per
 * scalable modifier — the engine picks one via the existing
 * `strangeInNumbers` condition, exactly like mutation effects themselves.
 * Zeroed scalable modifiers are dropped. Non-scalable modifiers (and
 * non-food buffs) pass through untouched.
 */
export function applyDietScaling(buff: GeneratedBuff, mutationIds: readonly string[]): Modifier[] {
  const verdict = dietVerdict(buff, mutationIds);
  if (verdict === null) return buff.modifiers;

  const scalable = new Set(buff.foodScalableModifierIds);
  return buff.modifiers.flatMap(m => {
    if (!scalable.has(m.id)) return [m];
    if (verdict === 'zeroed') return [];
    return [
      { ...scaled(m, 2.0, ':diet'), conditions: [...m.conditions, { kind: 'strangeInNumbers' as const, value: false }] },
      { ...scaled(m, 2.5, ':dietSin'), conditions: [...m.conditions, { kind: 'strangeInNumbers' as const, value: true }] },
    ];
  });
}
