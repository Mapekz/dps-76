import { weaponCharges } from '@/lib/charge';
import { foldRegisteredBucket } from './resolve';
import type { ScenarioInput } from './scenarios';
import { bootstrapStackCaps, buildVatsContext, isMeleeWeapon } from './scenarios';

/** HasCompletedChallenge gate on The Pipe's fourth Licensed Plumber rung. */
export const PIPE_WEAPON_CRAFTING_CHALLENGE_ID =
  'Challenge_Lifetime_CraftScrap_Weapon_Tiers_Ranged_Pistols_Pipe';

/** Kingfisher's six independent Local Legend fishing challenges (fixed order for count-slider evaluation). */
export const KINGFISHER_LOCAL_LEGEND_CHALLENGE_IDS = [
  'Challenge_Lifetime_Fishing_LocalLegend_01',
  'Challenge_Lifetime_Fishing_LocalLegend_02',
  'Challenge_Lifetime_Fishing_LocalLegend_03',
  'Burn_Challenge_Lifetime_Fishing_LocalLegend_04',
  'Challenge_Lifetime_Fishing_SeasonalFish_Fall_LocalLegend',
  'Challenge_Lifetime_Fishing_SeasonalFish_Summer_LocalLegend',
] as const;

export const KINGFISHER_LOCAL_LEGEND_CHALLENGE_SET = new Set<string>(
  KINGFISHER_LOCAL_LEGEND_CHALLENGE_IDS,
);

/**
 * UI existence gates and display-only folds — not scenario damage results.
 * See ADR-0011: callers that only need DPS (suggestions sweep) must not invoke this.
 */
export interface BuildAffordances {
  /**
   * True when any equipped source reads the kill-streak counter (Adrenaline,
   * Crowd Control, Sole Survivor; Lawbringer, Adrenal, Thrill-Seeker's) — the
   * UI's kill-streak slider disables without one.
   */
  hasKillStreakSources: boolean;
  /**
   * True when any equipped source reads the `concentratedFire` stack counter
   * (Concentrated Fire's per-VATS-shot `dbm` bonus) — the UI's Concentrated
   * Fire stacks slider disables without one.
   */
  hasConcentratedFireSources: boolean;
  /**
   * True when any equipped source gates on The Pipe's pipe-weapon crafting
   * lifetime challenge — shows the completion toggle in Conditions.
   */
  hasPipeCraftingChallengeSource: boolean;
  /**
   * True when any equipped source gates on Kingfisher's Local Legend fishing
   * challenges — shows the 0–6 count slider in Conditions.
   */
  hasKingfisherLocalLegendSource: boolean;
  /**
   * True when the effective weapon carries a nonzero `reloadSkipChanceBash`
   * (Battle-Loader's) — gates the UI's bash-time slider.
   */
  hasBattleLoadersSource: boolean;
  /**
   * The equipped weapon's charge parameters — null when the effective weapon
   * doesn't charge (hides the slider).
   */
  charging: {
    fullPowerSeconds: number;
    fullPowerDamageMult: number;
    minimumChargeTime: number;
  } | null;
  /**
   * The equipped weapon's effective range fields — null for melee weapons or
   * weapons with no usable range span (maxRange ≤ 0).
   */
  range: { minRange: number; maxRange: number; outOfRangeMult: number } | null;
  /**
   * Display-only aggregate of every equipped `vatsHitChance`-bucket modifier's
   * decimal value — NEVER consumed by any damage/sustain/AP term.
   */
  vatsHitChanceBonus: number;
  /**
   * Display-only Concentrated Fire hit-chance MULTIPLIER — folded AS-IS (1 =
   * neutral). NEVER consumed by any damage/sustain/AP term.
   */
  vatsHitChanceMult: number;
}

export function describeAffordances(input: ScenarioInput): BuildAffordances {
  const caps = bootstrapStackCaps(input);
  const vatsCtx = buildVatsContext(input, caps.onslaught, caps.bulletStorm);

  const hasKillStreakSources = input.modifiers.some(
    (m) =>
      m.curve?.input === 'killStreak' ||
      m.conditions.some(
        (c) => c.kind === 'killStreakCount' || (c.kind === 'stacks' && c.counter === 'adrenaline'),
      ),
  );

  const hasConcentratedFireSources = input.modifiers.some((m) =>
    m.conditions.some((c) => c.kind === 'stacks' && c.counter === 'concentratedFire'),
  );

  const hasPipeCraftingChallengeSource = input.modifiers.some((m) =>
    m.conditions.some(
      (c) =>
        c.kind === 'lifetimeChallengeCompleted' &&
        c.challengeId === PIPE_WEAPON_CRAFTING_CHALLENGE_ID,
    ),
  );

  const hasKingfisherLocalLegendSource = input.modifiers.some((m) =>
    m.conditions.some(
      (c) =>
        c.kind === 'lifetimeChallengeCompleted' &&
        KINGFISHER_LOCAL_LEGEND_CHALLENGE_SET.has(c.challengeId),
    ),
  );

  const hasBattleLoadersSource = (input.weapon.reloadSkipChanceBash ?? 0) > 0;

  const charging = weaponCharges(input.weapon)
    ? {
        fullPowerSeconds: input.weapon.fullPowerSeconds ?? 0,
        fullPowerDamageMult: input.weapon.fullPowerDamageMult ?? 0,
        minimumChargeTime: input.weapon.minimumChargeTime ?? 0,
      }
    : null;

  const range =
    !isMeleeWeapon(input.weapon) && (input.weapon.maxRange ?? 0) > 0
      ? {
          minRange: input.weapon.minRange ?? 0,
          maxRange: input.weapon.maxRange ?? 0,
          outOfRangeMult: input.weapon.outOfRangeDamageMult ?? 1.0,
        }
      : null;

  const vatsHitChanceBonus = foldRegisteredBucket(input.modifiers, 'vatsHitChance', vatsCtx);
  const vatsHitChanceMult = foldRegisteredBucket(input.modifiers, 'vatsHitChanceMult', vatsCtx);

  return {
    hasKillStreakSources,
    hasConcentratedFireSources,
    hasPipeCraftingChallengeSource,
    hasKingfisherLocalLegendSource,
    hasBattleLoadersSource,
    charging,
    range,
    vatsHitChanceBonus,
    vatsHitChanceMult,
  };
}

/** Whether the Onslaught stack slider counts as active — manual pin only (auto is `-1`). */
export function isOnslaughtStacksActive(stored: number, reverse: boolean): boolean {
  return stored !== -1 && !reverse;
}

/** Whether the Bullet Storm stack slider counts as active — manual pin only (auto is `-1`). */
export function isBulletStormStacksActive(stored: number): boolean {
  return stored !== -1;
}
