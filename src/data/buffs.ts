import type { GameMode } from '@/types';
import type { GeneratedAddiction, GeneratedBuff } from '@/types/generated';
import type { Modifier } from '@/types/modifiers';
import { applyDietScaling } from '@/lib/diet-mutations';
import { applyClassFreakPenaltyScaling } from '@/lib/class-freak-mutations';
import { getDataset } from './dataset';
import { forceVisibleConsumableIds, hiddenConsumableIds } from './overrides/corrections';

// Reads the merged mutation/consumable lists from the dataset chokepoint
// (buff-value overrides already applied).

export function getMutations(mode: GameMode): GeneratedBuff[] {
  return getDataset(mode).mutations;
}

/**
 * Visible consumables: obtainability + hand corrections, same filter idiom as
 * live/weapons.ts's weapon filter (`obtainable !== false || forceVisible`,
 * minus `hidden`). Hidden/unobtainable records stay in the dataset itself
 * (getBuffModifiers reads it unfiltered) so a stale build that already
 * selected one keeps computing — only the pickers stop offering them.
 */
export function getConsumables(mode: GameMode): GeneratedBuff[] {
  return getDataset(mode).consumables.filter(
    b => (b.obtainable !== false || forceVisibleConsumableIds.has(b.id)) && !hiddenConsumableIds.has(b.id)
  );
}

/**
 * The mode-wide addiction catalog. Already obtainable-only at the source
 * (extract-buffs.ts step 6 groups from obtainable categorized records; an
 * unobtainable chem's addiction — e.g. Jet — never enters the catalog).
 */
export function getAddictions(mode: GameMode): GeneratedAddiction[] {
  return getDataset(mode).addictions;
}

/**
 * Addiction ids suppressed by the player's currently-active consumables.
 * Category-agnostic (grill-session decision, 2026-07-13): an active chem,
 * alcohol, food, or drink all suppress their own addiction equally — the
 * check is purely "is this addiction's causing consumable id active", not
 * "is the active item a chem". See docs/assumptions.md "Consumable stacking
 * & addictions" and src/lib/player-stats.ts `deriveAddictionCount`.
 */
export function getSuppressedAddictions(mode: GameMode, consumableIds: string[]): Set<string> {
  const active = new Set(consumableIds);
  const suppressed = new Set<string>();
  for (const buff of getConsumables(mode)) {
    if (buff.addiction && active.has(buff.id)) suppressed.add(buff.addiction.id);
  }
  return suppressed;
}

/** Engine modifiers for the selected mutation/consumable ids. */
export function getBuffModifiers(mode: GameMode, mutationIds: string[], consumableIds: string[]): Modifier[] {
  const dataset = getDataset(mode);
  const modifiers: Modifier[] = [];
  for (const buff of dataset.mutations) {
    // Penalty-tagged modifiers expand into 4 Class-Freak-rank variants
    // (×1/×0.75/×0.5/×0.25) — src/lib/class-freak-mutations.ts.
    if (mutationIds.includes(buff.id)) modifiers.push(...applyClassFreakPenaltyScaling(buff));
  }
  for (const buff of dataset.consumables) {
    // Carnivore's/Herbivore's transform selected foods' scalable modifiers
    // (×2 / ×2.5-with-SIN / dropped) — src/lib/diet-mutations.ts.
    if (consumableIds.includes(buff.id)) modifiers.push(...applyDietScaling(buff, mutationIds));
  }
  return modifiers;
}

/**
 * Withdrawal penalty modifiers for the player's COUNTED addictions — the
 * selected list minus families suppressed by an active consumable (the same
 * derivation Junkie's addictionCount uses: `deriveAddictionCount` +
 * `getSuppressedAddictions`). No conditions needed: suppression is decided
 * here at assembly time, not at fold time.
 */
export function getAddictionModifiers(mode: GameMode, countedAddictionIds: readonly string[]): Modifier[] {
  if (countedAddictionIds.length === 0) return [];
  const counted = new Set(countedAddictionIds);
  return getDataset(mode)
    .addictions.filter(a => counted.has(a.id))
    .flatMap(a => a.modifiers ?? []);
}
