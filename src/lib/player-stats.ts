import type { EnemyConditions, PlayerConditions, Weapon } from '@/types';
import { createDefaultEnemyConditions } from '@/types';
import type { Bucket, Modifier } from '@/types/modifiers';
import { foldBucket, foldOps, type ResolveContext } from '@/lib/engine/resolve';

/**
 * Derived player stats: effective SPECIAL (base + buff-bucket folds) and max
 * HP. Shared by `resolveLoadout` (feeds the engine) and the Build column's
 * stat summary (displays the same numbers) — one derivation, two consumers.
 */

export const SPECIAL_KEYS = [
  'strength',
  'perception',
  'endurance',
  'charisma',
  'intelligence',
  'agility',
  'luck',
] as const;
export type SpecialKey = (typeof SPECIAL_KEYS)[number];

export const SPECIAL_BUCKETS: Record<SpecialKey, Bucket> = {
  strength: 'specialStrength',
  perception: 'specialPerception',
  endurance: 'specialEndurance',
  charisma: 'specialCharisma',
  intelligence: 'specialIntelligence',
  agility: 'specialAgility',
  luck: 'specialLuck',
};

/**
 * Max HP = 245 + 5×END + Σ maxHealth-bucket modifiers (Lifegiver...).
 * The base formula is user-supplied convention, not ESM-proven
 * (docs/assumptions.md "Max HP").
 */
export const BASE_MAX_HP = 245;
export const MAX_HP_PER_ENDURANCE = 5;

/**
 * Stand-in weapon so stat folds can run before any weapon is equipped (the
 * stat summary renders on an empty build). Weapon-gated stat modifiers
 * simply don't match it.
 */
const NO_WEAPON: Weapon = {
  id: '__no_weapon__',
  name: 'None',
  components: [],
  damageType: 'ballistic',
  weaponClass: 'unarmed',
  isAutomatic: false,
  isPhysical: true,
};

/**
 * SPECIAL buff fold: flat unconditional ADDs only, matching the engine's
 * historical behavior — no cap; real stacking/exclusivity rules come with the
 * consumables overhaul (docs/assumptions.md).
 */
export function foldSpecialStat(modifiers: Modifier[], bucket: Bucket, base: number): number {
  return foldOps(
    modifiers
      .filter((m): m is Modifier & { value: number } => m.bucket === bucket && !m.curve && m.conditions.length === 0)
      .map(m => ({ op: m.op, value: m.value })),
    base
  );
}

/**
 * SPECIAL allocation rules (user-confirmed 2026-07-12):
 * - The player DEFINES base allocation per stat: 1–15, from a pool of 7 base
 *   points (1/stat) + 49 level-ups = 56 total.
 * - Legendary SPECIAL perk cards add +1/+2/+3/+5 by rank ON TOP of base (the
 *   stat can exceed 15) AND grant that many extra perk points — but the
 *   perk-point budget still hard-caps at 15 per stat. Other SPECIAL boosts
 *   (consumables, gear) never grant perk points.
 * - Card slotting past a stat's budget (min(15, base + legendary bonus)) is
 *   blocked in-app; imported builds that violate it are flagged instead.
 */
export const SPECIAL_ALLOCATION_POOL = 56;
export const SPECIAL_POINTS_CAP = 15;
/** Legendary SPECIAL card bonus by rank (index = rank − 1) — per the cards' own descriptions. */
export const LEGENDARY_SPECIAL_BONUS_BY_RANK = [1, 2, 3, 5] as const;

export function legendarySpecialBonus(rank: number): number {
  return LEGENDARY_SPECIAL_BONUS_BY_RANK[Math.max(1, Math.min(4, rank)) - 1];
}

export interface PerkBudget {
  /** Σ slotted card ranks per stat (card cost = rank). */
  cardPoints: Record<SpecialKey, number>;
  /** +1/+2/+3/+5 from slotted Legendary SPECIAL cards. */
  legendaryBonus: Record<SpecialKey, number>;
  /** The user-defined base allocation (1–15 each; Σ ≤ 56 when legal). */
  allocation: Record<SpecialKey, number>;
  /** Perk-point budget per stat: min(15, allocation + legendaryBonus). */
  budgetPerStat: Record<SpecialKey, number>;
  /** allocation + legendaryBonus — the stat value before gear/consumable buffs. */
  baseSpecial: Record<SpecialKey, number>;
  /** Σ allocation (legal builds keep this ≤ 56). */
  totalAllocated: number;
  /** True when the build violates a cap (imports are flagged, not blocked). */
  overBudget: boolean;
}

export function derivePerkBudget(
  cards: Array<{ special: SpecialKey; rank: number }>,
  legendaryBonus: Record<SpecialKey, number>,
  allocation: Record<SpecialKey, number>
): PerkBudget {
  const cardPoints = Object.fromEntries(SPECIAL_KEYS.map(k => [k, 0])) as Record<SpecialKey, number>;
  for (const card of cards) cardPoints[card.special] += Math.max(1, card.rank);

  const budgetPerStat = Object.fromEntries(
    SPECIAL_KEYS.map(k => [k, Math.min(SPECIAL_POINTS_CAP, allocation[k] + legendaryBonus[k])])
  ) as Record<SpecialKey, number>;
  const baseSpecial = Object.fromEntries(
    SPECIAL_KEYS.map(k => [k, allocation[k] + legendaryBonus[k]])
  ) as Record<SpecialKey, number>;
  const totalAllocated = SPECIAL_KEYS.reduce((sum, k) => sum + allocation[k], 0);
  const overBudget =
    totalAllocated > SPECIAL_ALLOCATION_POOL || SPECIAL_KEYS.some(k => cardPoints[k] > budgetPerStat[k]);

  return { cardPoints, legendaryBonus, allocation, budgetPerStat, baseSpecial, totalAllocated, overBudget };
}

/** Can `delta` more card points be slotted into `stat` within its budget? */
export function canSlotCardPoints(budget: PerkBudget, stat: SpecialKey, delta = 1): boolean {
  return budget.cardPoints[stat] + delta <= budget.budgetPerStat[stat];
}

export interface DerivedPlayerStats {
  /** Effective SPECIAL: base (allocation + legendary SPECIAL perks) + buff folds. */
  special: Record<SpecialKey, number>;
  /** 245 + 5×effective END + maxHealth-bucket folds (Lifegiver &c.), rounded. */
  maxHealth: number;
}

export function derivePlayerStats(
  modifiers: Modifier[],
  baseSpecial: Record<SpecialKey, number>,
  player: PlayerConditions,
  enemy?: EnemyConditions,
  weapon?: Weapon,
  itemLevel?: number
): DerivedPlayerStats {
  const special = Object.fromEntries(
    SPECIAL_KEYS.map(key => [key, foldSpecialStat(modifiers, SPECIAL_BUCKETS[key], baseSpecial[key])])
  ) as Record<SpecialKey, number>;

  // The maxHealth fold resolves real curves/conditions (Lifegiver's curve X
  // is the buff-folded END), so it runs through foldBucket with a context.
  const ctx: ResolveContext = {
    weapon: weapon ?? NO_WEAPON,
    player: { ...player, ...special },
    enemy: enemy ?? createDefaultEnemyConditions(),
    scenario: { isVats: false, isSneaking: false, isPowerAttack: false, isCrit: false },
    itemLevel: itemLevel ?? 50,
    onslaughtMaxStacks: 0,
  };
  const maxHealth = Math.round(
    foldBucket(modifiers, 'maxHealth', BASE_MAX_HP + MAX_HP_PER_ENDURANCE * special.endurance, ctx)
  );

  return { special, maxHealth };
}
