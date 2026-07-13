import type { GameMode } from '@/types';
import type { GeneratedAddiction, GeneratedBuff } from '@/types/generated';
import type { Modifier } from '@/types/modifiers';
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
    if (mutationIds.includes(buff.id)) modifiers.push(...buff.modifiers);
  }
  for (const buff of dataset.consumables) {
    if (consumableIds.includes(buff.id)) modifiers.push(...buff.modifiers);
  }
  return modifiers;
}
