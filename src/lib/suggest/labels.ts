/**
 * Shared label-condensation helpers for suggestion candidates
 * (2026-08 density pass — dense list, so every spelled-out category word
 * that isn't load-bearing gets dropped). Standalone (no imports from
 * variants.ts/combos.ts) so both can depend on it without a cycle.
 */

/** "<name>" at rank 1, "<name> <rank>" above — no "rank"/"Equip" words. */
export function perkLabel(name: string, rank: number): string {
  return rank === 1 ? name : `${name} ${rank}`;
}

/** `perkLabel` plus a condensed perk-point cost suffix (single-perk suggestions only — combos track cost separately, uncaptioned). */
export function perkLabelWithCost(name: string, rank: number, extraCost: number): string {
  return `${perkLabel(name, rank)} +${extraCost}pt`;
}

/** Weapon legendary-effect slot — repeated stars for the slot rank, no "Legendary" word or colon. */
export function legendaryEffectLabel(name: string, slotIndex0: number): string {
  return `${'*'.repeat(slotIndex0 + 1)} ${name}`;
}

/** Regular OMOD slot — generic "Mod:", except the Unique slot (the base weapon-variant selector, not really a "mod"), which keeps its own name. */
export function modLabel(slotLabel: string, name: string): string {
  return slotLabel === 'Unique' ? `Unique: ${name}` : `Mod: ${name}`;
}
