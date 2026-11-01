import type { GameMode, PerkLoadout } from '@/types';
import { getPerks, getSpecialClamp } from '@/data';
import {
  getLegendarySlotCurve,
  getSpecialLevelRewardCurve,
  interpolateCurve,
} from '@/lib/curve-tables';
import { PerkId } from '@/data/perk-ids';
import { Special } from '@/data/special';
import {
  derivePerkBudget,
  legendarySpecialBonus,
  perkCardCostAtRank,
  PLAYER_LEVEL,
  SPECIAL_KEYS,
  type PerkBudget,
  type SpecialKey,
} from '@/lib/player-stats';

/**
 * SPECIAL allocation pool (user-confirmed 2026-07-12; ESM-derived 2026-07-21):
 * one starting point per stat at the AVIFs' Minimum Value, plus the
 * `SPECIAL_LevelRewardCurve` value at `playerLevel`. The player allocates
 * 1–15 per stat from this pool, 56 points at level 50 and beyond. Legendary
 * SPECIAL cards add on top of that and grant matching perk points, still
 * capped at 15 per stat; other SPECIAL boosts grant none. Slotting past a
 * stat's budget is blocked in-app, and imported builds that violate it are
 * flagged instead.
 */
export function specialAllocationPool(mode: GameMode, playerLevel = PLAYER_LEVEL): number {
  return (
    SPECIAL_KEYS.length * getSpecialClamp(mode).min +
    interpolateCurve(getSpecialLevelRewardCurve(mode), playerLevel)
  );
}

/**
 * Legendary card slots unlocked at `playerLevel`. The curve maps slot number
 * to its unlock level (50/75/100/150/200/300), so this counts points at or
 * below the level instead of interpolating.
 */
export function legendarySlotsAtLevel(mode: GameMode, playerLevel = PLAYER_LEVEL): number {
  return getLegendarySlotCurve(mode).filter((p) => p.y <= playerLevel).length;
}

/**
 * Bridges perk loadouts to the SPECIAL/perk-point budget rules
 * (src/lib/player-stats.ts). Used by the reducer (auto-derives the stored
 * base SPECIAL, blocks illegal slotting) and the perk editor UI.
 */

const SPECIAL_TO_KEY: Record<Special, SpecialKey> = {
  [Special.Strength]: 'strength',
  [Special.Perception]: 'perception',
  [Special.Endurance]: 'endurance',
  [Special.Charisma]: 'charisma',
  [Special.Intelligence]: 'intelligence',
  [Special.Agility]: 'agility',
  [Special.Luck]: 'luck',
};

/** The seven Legendary SPECIAL cards — the ONLY perks that add perk points. */
export const LEGENDARY_SPECIAL_PERKS: Readonly<Record<string, SpecialKey>> = {
  [PerkId.LegendaryStrength]: 'strength',
  [PerkId.LegendaryPerception]: 'perception',
  [PerkId.LegendaryEndurance]: 'endurance',
  [PerkId.LegendaryCharisma]: 'charisma',
  [PerkId.LegendaryIntelligence]: 'intelligence',
  [PerkId.LegendaryAgility]: 'agility',
  [PerkId.LegendaryLuck]: 'luck',
};

/** Legendary SPECIAL card stat/perk-point bonuses from a legendary loadout. */
export function legendaryBonusOf(legendaryPerks: PerkLoadout[]): Record<SpecialKey, number> {
  const legendaryBonus = Object.fromEntries(SPECIAL_KEYS.map((k) => [k, 0])) as Record<
    SpecialKey,
    number
  >;
  for (const { perkId, rank } of legendaryPerks) {
    const stat = LEGENDARY_SPECIAL_PERKS[perkId];
    if (stat) legendaryBonus[stat] += legendarySpecialBonus(rank);
  }
  return legendaryBonus;
}

export function computePerkBudget(
  mode: GameMode,
  perks: PerkLoadout[],
  legendaryPerks: PerkLoadout[],
  allocation: Record<SpecialKey, number>,
): PerkBudget {
  const registry = getPerks(mode);

  const cards: Array<{ special: SpecialKey; cost: number }> = [];
  for (const { perkId, rank } of perks) {
    const perk = registry[perkId as keyof typeof registry];
    // No `special` = a legendary card (mis-filed here by an old build) — costs nothing.
    if (perk?.special)
      cards.push({ special: SPECIAL_TO_KEY[perk.special], cost: perkCardCostAtRank(perk, rank) });
  }

  const budget = derivePerkBudget(
    cards,
    legendaryBonusOf(legendaryPerks),
    allocation,
    specialAllocationPool(mode),
  );
  const legendarySlotsOver = legendaryPerks.length > legendarySlotsAtLevel(mode);
  return { ...budget, overBudget: budget.overBudget || legendarySlotsOver };
}

/** The SPECIAL a (regular) perk card slots into, or null when unknown/legendary. */
export function perkSpecialKey(mode: GameMode, perkId: string): SpecialKey | null {
  const perk = getPerks(mode)[perkId as keyof ReturnType<typeof getPerks>];
  return perk?.special ? SPECIAL_TO_KEY[perk.special] : null;
}

/**
 * Perk-point cost DELTA for moving `perkId` from `fromRank` to `toRank`
 * (0 = unequipped). Used to gate slotting/rank-ups against the SPECIAL
 * budget — the budget's `cardPoints` reflects the cost of a card's CURRENT
 * rank only (not a cumulative sum across ranks), so the delta of an add or
 * a rank-up is `cost(toRank) − cost(fromRank)`.
 */
export function perkCardCostDelta(
  mode: GameMode,
  perkId: string,
  fromRank: number,
  toRank: number,
): number {
  const perk = getPerks(mode)[perkId as keyof ReturnType<typeof getPerks>];
  if (!perk) return 0; // unknown perk: don't block (import edge cases)
  return perkCardCostAtRank(perk, toRank) - perkCardCostAtRank(perk, fromRank);
}
