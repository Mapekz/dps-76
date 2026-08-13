import type { EnemyConditions, Perk, PerkLoadout, Weapon } from '@/types';
import { createDefaultEnemyConditions } from '@/types';
import type { PlayerConditionContext, PlayerInput } from '@/types/player';
import type { Bucket, Modifier } from '@/types/modifiers';
import {
  foldBucket,
  foldRegisteredBucket,
  foldBucketProduct,
  type ResolveContext,
} from '@/lib/engine/resolve';
import { interpolateCurve } from '@/lib/curve-tables';
import levelRewardCurveFile from '@/data/live/curvetables/player/special/levelrewardcurve.json';
import legendarySlotCurveFile from '@/data/live/curvetables/player/perks/legendaryperkslotcount.json';
import constantsFile from '@/data/live/generated/constants.json';

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
 * The player level every level-indexed curve is evaluated at. Hardcoded to
 * the endgame value for now (300 — past every unlock threshold in either
 * curve below); a future player-level selector only has to replace reads of
 * this constant with a UI-threaded variable. Same "size against the endgame"
 * convention as the enemy level-slider default (docs/assumptions.md "Resist
 * mitigation", level-slider bullet).
 */
export const PLAYER_LEVEL = 300;

/**
 * `SPECIAL_LevelRewardCurve` (CURV 0x004F473F, reached via DFOB
 * `SpecialPointCurve_DO` 0x004F4740 — `extract-curvetables.ts`
 * `CURVE_TABLE_SINGLETONS`): X = player level, Y = cumulative level-up
 * SPECIAL points, (1,0)…(50,49); the shared curve-clamp convention flattens
 * X > 50 at 49.
 */
const SPECIAL_LEVEL_REWARD_CURVE = levelRewardCurveFile.curve;

/**
 * SPECIAL allocation rules (user-confirmed 2026-07-12; pool ESM-derived
 * 2026-07-21):
 * - The player DEFINES base allocation per stat: 1–15, from a pool of
 *   `specialAllocationPool(PLAYER_LEVEL)` = 56 points — 7 starting points
 *   (one per stat, the SPECIAL AVIFs' own Minimum Value, extracted into
 *   `constants.json.special.min`) + the `SPECIAL_LevelRewardCurve` value at
 *   the player level (49 at level ≥ 50).
 * - Legendary SPECIAL perk cards add +1/+2/+3/+5 by rank ON TOP of base (the
 *   stat can exceed 15) AND grant that many extra perk points — but the
 *   perk-point budget still hard-caps at 15 per stat. Other SPECIAL boosts
 *   (consumables, gear) never grant perk points.
 * - Card slotting past a stat's budget (min(15, base + legendary bonus)) is
 *   blocked in-app; imported builds that violate it are flagged instead.
 */
export function specialAllocationPool(playerLevel: number): number {
  return (
    SPECIAL_KEYS.length * constantsFile.special.min +
    interpolateCurve(SPECIAL_LEVEL_REWARD_CURVE, playerLevel)
  );
}

export const SPECIAL_ALLOCATION_POOL = specialAllocationPool(PLAYER_LEVEL);

/**
 * `LegendaryPerkSlotCount` (CURV 0x005B67A0, reached via DFOB
 * `LegendaryPerkSlotCurve_DO` 0x005B67A1 — `extract-curvetables.ts`
 * `CURVE_TABLE_SINGLETONS`): X = slot number, Y = the player level that
 * unlocks it — (1,50)(2,75)(3,100)(4,150)(5,200)(6,300). Slots-at-level is
 * therefore a count of points with y ≤ level (an inverse lookup, not an
 * interpolation). Consumed by `build-reducer.ts`'s `LEGENDARY_PERK_SLOTS`
 * (evaluated at `PLAYER_LEVEL`).
 */
const LEGENDARY_SLOT_UNLOCK_CURVE = legendarySlotCurveFile.curve;

export function legendarySlotsAtLevel(playerLevel: number): number {
  return LEGENDARY_SLOT_UNLOCK_CURVE.filter((p) => p.y <= playerLevel).length;
}
export const SPECIAL_POINTS_CAP = 15;
/**
 * Fallback clamp on the effective (post-buff) SPECIAL stat, per the SPECIAL
 * AVIFs' own Minimum/Maximum Value fields (all 7 declare 1.0 / 100.0). The
 * live values are ESM-extracted (`extract-constants.ts` → `constants.json`,
 * read via `getSpecialClamp` in `@/data`) and threaded into
 * `derivePlayerStats`'s `clamp` param by every real caller; these constants
 * are only the default for callers that don't pass one (tests, stray
 * 3-arg calls) and the extractor's own dump-too-old fallback.
 */
export const SPECIAL_EFFECTIVE_MIN = 1;
export const SPECIAL_EFFECTIVE_MAX = 100;
/** Legendary SPECIAL card bonus by rank (index = rank − 1) — per the cards' own descriptions. */
export const LEGENDARY_SPECIAL_BONUS_BY_RANK = [1, 2, 3, 5] as const;

export function legendarySpecialBonus(rank: number): number {
  return LEGENDARY_SPECIAL_BONUS_BY_RANK[Math.max(1, Math.min(4, rank)) - 1];
}

export interface PerkBudget {
  /** Σ slotted card costs per stat (real per-rank PCRD cost, not rank). */
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

/**
 * Perk-point cost of a card at `rank` (0 = unequipped → 0). `costs[]` is
 * index 0 = rank 1, from the PCRD's "Card Rank Cost" (perk-cards.ts). Falls
 * back to `rank` when costs data is missing (shouldn't happen post-derivation
 * — see perk-cards.test.ts's drift check).
 */
export function perkCardCostAtRank(perk: Pick<Perk, 'costs'> | undefined, rank: number): number {
  if (!perk || rank <= 0) return 0;
  return perk.costs[rank - 1] ?? rank;
}

export function derivePerkBudget(
  cards: Array<{ special: SpecialKey; cost: number }>,
  legendaryBonus: Record<SpecialKey, number>,
  allocation: Record<SpecialKey, number>,
): PerkBudget {
  const cardPoints = Object.fromEntries(SPECIAL_KEYS.map((k) => [k, 0])) as Record<
    SpecialKey,
    number
  >;
  for (const card of cards) cardPoints[card.special] += card.cost;

  const budgetPerStat = Object.fromEntries(
    SPECIAL_KEYS.map((k) => [k, Math.min(SPECIAL_POINTS_CAP, allocation[k] + legendaryBonus[k])]),
  ) as Record<SpecialKey, number>;
  const baseSpecial = Object.fromEntries(
    SPECIAL_KEYS.map((k) => [k, allocation[k] + legendaryBonus[k]]),
  ) as Record<SpecialKey, number>;
  const totalAllocated = SPECIAL_KEYS.reduce((sum, k) => sum + allocation[k], 0);
  const overBudget =
    totalAllocated > SPECIAL_ALLOCATION_POOL ||
    SPECIAL_KEYS.some((k) => cardPoints[k] > budgetPerStat[k]);

  return {
    cardPoints,
    legendaryBonus,
    allocation,
    budgetPerStat,
    baseSpecial,
    totalAllocated,
    overBudget,
  };
}

/** Can `delta` more card points be slotted into `stat` within its budget? */
export function canSlotCardPoints(budget: PerkBudget, stat: SpecialKey, delta = 1): boolean {
  return budget.cardPoints[stat] + delta <= budget.budgetPerStat[stat];
}

/**
 * Strange in Numbers is a derived gate, not stored state: the card must be
 * equipped AND at least one teammate present (the +25% mutation boost needs a
 * mutated teammate — teammate mutation status isn't modeled, so any teammate
 * counts; docs/assumptions.md "Strange in Numbers"). Shared by resolveLoadout
 * (feeds the engine) and the Mutations header badge.
 */
export function deriveStrangeInNumbers(perks: PerkLoadout[], conditions: PlayerInput): boolean {
  return perks.some((p) => p.perkId === 'StrangeInNumbers') && (conditions.teammateCount ?? 0) >= 1;
}

/**
 * Class Freak rank (0 = not equipped, 1–3): mutation penalties scale
 * ×1/×0.75/×0.5/×0.25 (src/lib/class-freak-mutations.ts) and Grounded's
 * energy-damage tiers gate on it. Derived from the perk loadout, not stored
 * state — mirrors `deriveStrangeInNumbers`. Shared by resolveLoadout /
 * resolveStats (feeds the engine + stat folds) and the Mutations header badge.
 */
export function deriveClassFreakRank(perks: PerkLoadout[]): number {
  return perks.find((p) => p.perkId === 'ClassFreak')?.rank ?? 0;
}

/** HungerThirstTier (0–8) = food meter tier + drink meter tier (0–4 each) — docs/assumptions.md. */
export function deriveHungerThirstTier(conditions: PlayerInput): number {
  return (
    Math.max(0, Math.min(4, conditions.foodTier ?? 0)) +
    Math.max(0, Math.min(4, conditions.drinkTier ?? 0))
  );
}

/**
 * Junkie's addictionCount curve input: selected addictions minus those
 * SUPPRESSED by a currently-active addictive consumable (category-agnostic —
 * `getSuppressedAddictions`, src/data/buffs.ts). Docs/assumptions.md
 * "Consumable stacking & addictions".
 */
export function deriveAddictionCount(
  addictions: string[],
  suppressed: ReadonlySet<string>,
): number {
  return addictions.filter((id) => !suppressed.has(id)).length;
}

export interface DerivedPlayerStats {
  /** Effective SPECIAL: base (allocation + legendary SPECIAL perks) + buff folds. */
  special: Record<SpecialKey, number>;
  /** 245 + 5×effective END + maxHealth-bucket folds (Lifegiver &c.), rounded. */
  maxHealth: number;
  /** Folded lockpickSkill bucket (Picklock ranks, Master Infiltrator, Safecracker's) — base 0, no formula term unlike maxHealth. */
  lockpickSkill: number;
  /** Folded hackingSkill bucket (Hacker ranks, Master Infiltrator, Safecracker's) — base 0, no formula term; no consumer yet. */
  hackingSkill: number;
  /** Folded damageResistGain bucket (Barbarian STR→DR) — base is the manual playerDamageResist knob, not 0; feeds Iron Fist's curve input. */
  damageResistGain: number;
  /** Folded stimpakHealMult bucket (First Aid, Medicine Bobblehead) — base 0, percent points; feeds Medical Malpractice scaledBy. */
  stimpakHealMult: number;
  /** Product-folded stimpakHealMagMult bucket (Field Surgeon, Doctor's 3★) — base 1, multiplicative; no consumer yet. */
  stimpakHealMagMult: number;
  /** Product-folded stimpakHealDurationMult bucket (Field Surgeon) — base 1, multiplicative; no consumer yet. */
  stimpakHealDurationMult: number;
}

export function derivePlayerStats(
  modifiers: Modifier[],
  baseSpecial: Record<SpecialKey, number>,
  player: PlayerConditionContext,
  enemy?: EnemyConditions,
  weapon?: Weapon,
  itemLevel?: number,
  // Enemy-type identifiers of the selected target (see ResolveContext). No
  // SPECIAL/maxHealth-bucket modifier is enemy-type-gated today; threaded for
  // root-context consistency (same trade-off as onslaughtMaxStacks: 0 below).
  enemyTypeIds: readonly string[] = [],
  // ESM-extracted SPECIAL clamp (`getSpecialClamp`) — real callers pass the
  // dataset's live value; defaults to the hardcoded fallback for callers that
  // don't have a `mode` in scope (tests).
  clamp: { min: number; max: number } = { min: SPECIAL_EFFECTIVE_MIN, max: SPECIAL_EFFECTIVE_MAX },
): DerivedPlayerStats {
  const scenario = { isVats: false, isSneaking: false, isPowerAttack: false, isCrit: false };
  const enemyCtx = enemy ?? createDefaultEnemyConditions();

  // SPECIAL folds are condition-aware (mutation penalties carry classFreakRank
  // tiers, Herd Mentality's bonuses/penalties carry team gates, mutation
  // bonuses carry strangeInNumbers variants) — the caller passes DERIVED
  // gates (strangeInNumbers, classFreakRank) in `player`, so this early
  // context needs no SPECIAL values beyond the raw allocation it starts from.
  const earlyCtx: ResolveContext = {
    weapon: weapon ?? NO_WEAPON,
    player,
    enemy: enemyCtx,
    scenario,
    itemLevel: itemLevel ?? 50,
    enemyTypeIds,
    onslaughtMaxStacks: 0,
  };
  const special = Object.fromEntries(
    SPECIAL_KEYS.map((key) => {
      const folded = foldBucket(modifiers, SPECIAL_BUCKETS[key], baseSpecial[key], earlyCtx);
      return [key, Math.max(clamp.min, Math.min(clamp.max, folded))];
    }),
  ) as Record<SpecialKey, number>;

  // The maxHealth fold resolves real curves/conditions (Lifegiver's curve X
  // is the buff-folded END), so it runs through foldBucket with the folded
  // SPECIAL in context. `earlyCtx.player` is still a bare
  // `PlayerConditionContext` (no derived fields) — `PLAYER_STATE_READERS`
  // falls back for each one; see `ResolveContextPlayer` in types/player.ts.
  const ctx: ResolveContext = { ...earlyCtx, player: { ...earlyCtx.player, ...special } };
  const maxHealth = Math.round(
    foldBucket(modifiers, 'maxHealth', BASE_MAX_HP + MAX_HP_PER_ENDURANCE * special.endurance, ctx),
  );
  const lockpickSkill = foldRegisteredBucket(modifiers, 'lockpickSkill', ctx);
  const hackingSkill = foldRegisteredBucket(modifiers, 'hackingSkill', ctx);
  const damageResistGain = foldBucket(
    modifiers,
    'damageResistGain',
    player.playerDamageResist ?? 0,
    ctx,
  );
  const stimpakHealMult = foldRegisteredBucket(modifiers, 'stimpakHealMult', ctx);
  const stimpakHealMagMult = foldBucketProduct(modifiers, 'stimpakHealMagMult', ctx);
  const stimpakHealDurationMult = foldBucketProduct(modifiers, 'stimpakHealDurationMult', ctx);

  return {
    special,
    maxHealth,
    lockpickSkill,
    hackingSkill,
    damageResistGain,
    stimpakHealMult,
    stimpakHealMagMult,
    stimpakHealDurationMult,
  };
}
