import type { PlayerConfig, EnemyConfig, GameMode, Weapon } from '@/types';
import type { PlayerConditionContext } from '@/types/player';
import type { Modifier } from '@/types/modifiers';
import { getDistanceConstants, getSpecialClamp, getWeapons } from '@/data';
import { getDataset } from '@/data/dataset';
import { resolveTargetLevel } from '@/lib/enemy-defenses';
import {
  deriveAddictionCount,
  derivePlayerStats,
  type DerivedPlayerStats,
} from '@/lib/player-stats';
import type { ScenarioInput } from '@/lib/engine/scenarios';
import { createArrayInterner, type MemoScope } from '@/lib/loadout-memo';
import {
  baseSpecialOf,
  buildEffectiveWeaponFor,
  deriveConditionsFor,
  derivedPlayerStatsFor,
  enemyDefensesFor,
  enemyTypeIdsFor,
  equippedOmodsFor,
  loadoutModifiersFor,
  loadoutAurasFor,
  nonWeaponStatModifiersFor,
  playerAgg,
  resolvedTargetFor,
  suppressedAddictionsFor,
  targetNpcFor,
  weaponRelevantModifiersFor,
} from '@/lib/loadout-memo-wrappers';

/** Interns `assemble()`'s final modifier list — see `loadout-memo-wrappers.ts`'s sibling doc-comments for the pattern. */
const internModifiers = createArrayInterner<Modifier>();

/** Effective weapon (OMODs applied) + the full modifier list — shared by resolveLoadout and resolveStats. */
function assemble(
  scope: MemoScope | undefined,
  playerConfig: PlayerConfig,
  enemyConfig: EnemyConfig,
  mode: GameMode,
): {
  weapon: Weapon | undefined;
  modifiers: Modifier[];
  conditions: PlayerConditionContext;
  enemyTypeIds: readonly string[];
} {
  const baseWeapon = playerConfig.weapon
    ? getWeapons(mode)[playerConfig.weapon.weaponId]
    : undefined;

  const enemyTypeIds = enemyTypeIdsFor(scope, mode, enemyConfig.conditions.targetRace);

  // Derived gates resolved ONCE over the stored conditions: strangeInNumbers
  // (SiN card + teammate) and classFreakRank (equipped ClassFreak rank) both
  // gate modifiers folded here (Speed Demon's reload, mutation penalty
  // tiers) and downstream (SPECIAL folds, the engine) — every consumer must
  // see the same derived values, never the stored synthetic-test defaults.
  const conditions = deriveConditionsFor(scope, mode, playerConfig);

  // Perk/legendary-perk/buff modifiers, gathered BEFORE the effective weapon
  // is built so their weapon-stat buckets (reloadSpeed, fireRateSpeed, …)
  // fold into it alongside OMOD stats — Guerrilla Expert's reload is inert if
  // this runs after buildEffectiveWeapon (docs/assumptions.md "Onslaught",
  // Guerrilla Expert's reload-speed bullet).
  const loadoutModifiers = loadoutModifiersFor(scope, mode, playerConfig, conditions);

  // Apply equipped OMODs (standard slots + legendary effects) to the weapon.
  let weapon: Weapon | undefined;
  let omodModifiers: Modifier[] = [];
  if (baseWeapon && playerConfig.weapon) {
    const equippedOmods = equippedOmodsFor(scope, mode, baseWeapon, playerConfig.weapon);
    const built = buildEffectiveWeaponFor(
      scope,
      baseWeapon,
      equippedOmods,
      playerConfig.itemLevel,
      conditions,
      enemyConfig.conditions,
      weaponRelevantModifiersFor(scope, loadoutModifiers),
      enemyTypeIds,
    );
    weapon = built.weapon;
    omodModifiers = built.modifiers;
  }

  const modifiers = [
    // Weapon-intrinsic modifiers (Weapon.modifiers — the WEAP's own
    // Contact-delivery Enchantment chase, e.g. Cremator's built-in fire
    // DoT). Sourced `kind: 'weapon'`; today only feeds `dotDamage` (folded
    // as the intrinsic base by paper-damage.ts's `computeDotDps`), which
    // isn't a WEAPON_STAT_BUCKETS bucket, so no effective-weapon folding is
    // needed before it joins the modifier list.
    ...(baseWeapon?.modifiers ?? []),
    ...omodModifiers,
    // Weapon-stat buckets were consumed by the effective-weapon fold above —
    // dropping them mirrors what buildEffectiveWeapon does to OMOD modifiers
    // and keeps them from double-counting if a damage term ever folds them.
    ...nonWeaponStatModifiersFor(scope, loadoutModifiers),
  ];

  return {
    weapon,
    // Interned elementwise (same trick as `weaponRelevantModifiersFor`):
    // `baseWeapon.modifiers` is static per weapon, `omodModifiers` is
    // `buildEffectiveWeapon`'s own (often cache-hit, see above) `.modifiers`
    // field, and `nonWeaponStatModifiersFor` is already interned — so
    // whenever every piece is unchanged, this collapses to the exact
    // previous `modifiers` reference despite the fresh `[...]` allocation.
    // That stable reference is what lets `evaluateSuggestions` skip
    // `computeScenarios` entirely for a damage-irrelevant candidate.
    modifiers: internModifiers(scope, modifiers),
    conditions,
    enemyTypeIds,
  };
}

/**
 * Derived stats (effective SPECIAL + max HP) for the Build column's stat
 * summary — same assembly and derivation as `resolveLoadout`, but works
 * without an equipped weapon (weapon-gated stat modifiers just don't match).
 */
export function resolveStats(
  playerConfig: PlayerConfig,
  enemyConfig: EnemyConfig,
  mode: GameMode,
): DerivedPlayerStats {
  const { weapon, modifiers, conditions, enemyTypeIds } = assemble(
    undefined,
    playerConfig,
    enemyConfig,
    mode,
  );
  return derivePlayerStats(
    modifiers,
    baseSpecialOf(playerConfig.legendaryPerks, playerConfig.conditions),
    conditions,
    enemyConfig.conditions,
    weapon,
    playerConfig.itemLevel,
    enemyTypeIds,
    getSpecialClamp(mode),
  );
}

/**
 * Resolves a player build ("loadout") into engine-ready input: the effective
 * weapon plus the full modifier list assembled from every damage source.
 *
 * This is the one sanctioned bridge from the data layer (`@/data`) to the
 * damage engine (`@/lib/engine`, which stays data-adapter-free). Both the
 * `useScenarioResults` hook and the golden-case harness go through here, so
 * the assembly — which OMOD ids get collected, in what order, from which
 * config fields — lives in exactly one testable place.
 *
 * `scope` is an OPT-IN cache for the suggestions sweep
 * (src/lib/suggest/evaluate.ts's `evaluateSuggestions`, which calls this
 * ~600+ times per config change for one baseline + one BuildAction each):
 * every other caller omits it and gets the identical unmemoized computation
 * this always did (see src/lib/loadout-memo.ts's doc-comment). The
 * memoized sub-steps themselves live in `loadout-memo-wrappers.ts`, imported
 * above — this file stays pure domain composition: which sources get
 * gathered, in what order, from which config fields.
 *
 * Returns null when the config has no equipped weapon (nothing to compute).
 */
export function resolveLoadout(
  playerConfig: PlayerConfig,
  enemyConfig: EnemyConfig,
  mode: GameMode,
  scope?: MemoScope,
): ScenarioInput | null {
  const { weapon, modifiers, conditions, enemyTypeIds } = assemble(
    scope,
    playerConfig,
    enemyConfig,
    mode,
  );
  if (!weapon) return null;

  const auras = loadoutAurasFor(scope, mode, playerConfig.armorEffects, playerConfig.mutations);

  const {
    special,
    maxHealth,
    lockpickSkill,
    hackingSkill,
    damageResistGain,
    stimpakHealMult,
    stimpakHealMagMult,
    stimpakHealDurationMult,
  } = derivedPlayerStatsFor(
    scope,
    mode,
    modifiers,
    playerConfig.legendaryPerks,
    playerConfig.conditions,
    conditions,
    weapon,
    playerConfig.itemLevel,
    enemyConfig.conditions,
    enemyTypeIds,
  );

  // Junkie's curve input: selected addictions minus ones suppressed by an
  // active addictive consumable (any category — docs/assumptions.md
  // "Consumable stacking & addictions"). Unconditional override: the
  // stored conditions value only feeds synthetic engine tests.
  const addictionCount = deriveAddictionCount(
    playerConfig.addictions,
    suppressedAddictionsFor(scope, mode, playerConfig.consumables),
  );
  const player = playerAgg(
    scope,
    conditions,
    special,
    maxHealth,
    lockpickSkill,
    hackingSkill,
    damageResistGain,
    stimpakHealMult,
    stimpakHealMagMult,
    stimpakHealDurationMult,
    playerConfig.mutations,
    playerConfig.conditions,
    addictionCount,
  );

  const { targetRace, targetBodyPart, targetLevel, epicRank } = enemyConfig.conditions;
  const resolvedTarget = resolvedTargetFor(
    scope,
    mode,
    targetRace,
    targetBodyPart,
    playerConfig.weakpointMult,
  );

  const targetNpc = targetNpcFor(scope, mode, targetRace);
  const resolvedLevel = resolveTargetLevel(targetNpc, targetLevel);
  const enemyDefenses =
    enemyDefensesFor(scope, mode, targetRace, resolvedLevel, epicRank) ?? undefined;

  return {
    mode,
    weapon,
    itemLevel: playerConfig.itemLevel,
    modifiers,
    auras,
    player,
    enemy: enemyConfig.conditions,
    enemyTypeIds,
    weakpointMult: resolvedTarget.mult,
    targetIsTorso: resolvedTarget.isTorso,
    // critRate omitted → computed from the crit meter (LCK, Crit Savvy,
    // Limit Breaking, weapon crit charge bonus).
    chargeTimeSec: playerConfig.chargeTimeSec,
    enemyDefenses,
    // ESM-extracted GMST scalars for the resist-mitigation formula — see GeneratedConstants.
    mitigationConstants: getDataset(mode).constants.mitigation,
    engineConstants: {
      // ESM-extracted `fVATSCriticalChargeBase` GMST — see GeneratedConstants.
      vatsCrit: getDataset(mode).constants.vatsCrit,
      // ESM-extracted AP pool/regen-delay GMSTs + RACE regen-rate scalars — see GeneratedConstants.
      actionPoints: getDataset(mode).constants.actionPoints,
      // ESM-extracted `uAmmoSpenderAmmoUsePerStack` GMST — see GeneratedConstants.
      bulletStorm: getDataset(mode).constants.bulletStorm,
      distance: getDistanceConstants(mode),
    },
  };
}
