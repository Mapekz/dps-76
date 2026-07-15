import type { PlayerConfig, EnemyConfig, GameMode, PlayerConditions, Weapon } from '@/types';
import type { Modifier } from '@/types/modifiers';
import { getWeapons } from '@/data';
import { getEquippedPerkFamilyRanks, getLoadoutModifiers } from '@/data/perk-modifiers';
import { getDefaultOmods, getOmodById } from '@/data/omods';
import { getAddictionModifiers, getBuffModifiers, getSuppressedAddictions } from '@/data/buffs';
import { getManualUptimeModifiers } from '@/data/manual-uptime';
import { getPlayerBaselineModifiers } from '@/data/player-baseline';
import { getTargetDebuffModifiers } from '@/data/target-debuffs';
import { getPublicTeamModifiers } from '@/data/public-teams';
import { buildEffectiveWeapon, WEAPON_STAT_BUCKETS } from '@/lib/engine/effective-weapon';
import { legendaryBonusOf } from '@/data/perk-budget';
import { getBodyPartMult, getEnemyTypeIds } from '@/data/bodyparts';
import {
  deriveAddictionCount,
  deriveClassFreakRank,
  deriveHungerThirstTier,
  derivePlayerStats,
  deriveStrangeInNumbers,
  SPECIAL_KEYS,
  type DerivedPlayerStats,
  type SpecialKey,
} from '@/lib/player-stats';
import type { ScenarioInput } from '@/lib/engine/scenarios';

/**
 * Base SPECIAL fed to the stat folds: the user-defined allocation stored in
 * conditions + Legendary SPECIAL card bonuses (+1/+2/+3/+5 by rank, on top of
 * base — they raise the stat as well as the perk-point budget).
 */
function baseSpecialOf(playerConfig: PlayerConfig): Record<SpecialKey, number> {
  const legendaryBonus = legendaryBonusOf(playerConfig.legendaryPerks);
  return Object.fromEntries(
    SPECIAL_KEYS.map(key => [key, playerConfig.conditions[key] + legendaryBonus[key]])
  ) as Record<SpecialKey, number>;
}

/** Effective weapon (OMODs applied) + the full modifier list — shared by resolveLoadout and resolveStats. */
function assemble(
  playerConfig: PlayerConfig,
  enemyConfig: EnemyConfig,
  mode: GameMode
): { weapon: Weapon | undefined; modifiers: Modifier[]; conditions: PlayerConditions; enemyTypeIds: readonly string[] } {
  const baseWeapon = playerConfig.weapon ? getWeapons(mode)[playerConfig.weapon.weaponId] : undefined;

  // Enemy-type identity of the selected target (race edid + ActorType*
  // keywords) — resolved ONCE from bodyparts data and threaded to every
  // ResolveContext, so enemyType/enemyTypeAny gates (Assassin's, Zealot's,
  // Prime receivers, Paranormal Mod) see the same match set everywhere.
  const enemyTypeIds = getEnemyTypeIds(mode, enemyConfig.conditions.targetRace);

  // Derived gates resolved ONCE over the stored conditions: strangeInNumbers
  // (SiN card + teammate) and classFreakRank (equipped ClassFreak rank) both
  // gate modifiers folded here (Speed Demon's reload, mutation penalty
  // tiers) and downstream (SPECIAL folds, the engine) — every consumer must
  // see the same derived values, never the stored synthetic-test defaults.
  const conditions: PlayerConditions = {
    ...playerConfig.conditions,
    strangeInNumbers: deriveStrangeInNumbers(playerConfig.perks, playerConfig.conditions),
    classFreakRank: deriveClassFreakRank(playerConfig.perks),
    // Family → highest owned rank across both loadouts — the perkFamilyRank
    // condition's input (cross-family HasPerk gates, e.g. Lock and Load →
    // Bullet Storm's reload speed).
    equippedPerkRanks: getEquippedPerkFamilyRanks(mode, [...playerConfig.perks, ...playerConfig.legendaryPerks]),
  };

  // Withdrawal penalties for counted addictions — selected minus suppressed
  // (an active consumable suppresses its own family's withdrawal, the same
  // rule Junkie's addictionCount uses; docs/assumptions.md "Consumable
  // stacking & addictions").
  const suppressed = getSuppressedAddictions(mode, playerConfig.consumables);
  const countedAddictions = playerConfig.addictions.filter(id => !suppressed.has(id));

  // Perk/legendary-perk/buff modifiers, gathered BEFORE the effective weapon
  // is built so their weapon-stat buckets (reloadSpeed, fireRateSpeed, …)
  // fold into it alongside OMOD stats — Guerrilla Expert's reload was inert
  // when this ran after buildEffectiveWeapon (measurement-backlog §1).
  const loadoutModifiers = [
    ...getLoadoutModifiers(mode, playerConfig.perks),
    ...getLoadoutModifiers(mode, playerConfig.legendaryPerks),
    ...getBuffModifiers(mode, playerConfig.mutations, playerConfig.consumables),
    ...getAddictionModifiers(mode, countedAddictions),
  ];

  // Follow Through / Taking One for the Team manual uptime sliders — see
  // @/data/manual-uptime for the equipped-card predicate + modifier shape
  // (shared with ConditionsSection.tsx so the slider and the fold can't drift).
  loadoutModifiers.push(...getManualUptimeModifiers(playerConfig.legendaryPerks, conditions));
  loadoutModifiers.push(...getPublicTeamModifiers(conditions.publicTeamType, conditions.teammateCount));
  // Hidden survival-ability baselines (hydration AP regen) — gated by the
  // hydrated/playerIsGhoul conditions at resolve time, so pushed unconditionally.
  loadoutModifiers.push(...getPlayerBaselineModifiers());
  // Target-side debuffs (Tenderizer stacks) — driven by the Target panel's
  // stack inputs, not the player's own cards, so pushed unconditionally too.
  loadoutModifiers.push(...getTargetDebuffModifiers());

  // Apply equipped OMODs (standard slots + legendary effects) to the weapon.
  let weapon: Weapon | undefined;
  let omodModifiers: Modifier[] = [];
  if (baseWeapon) {
    const chosenMods = playerConfig.weapon?.mods ?? {};
    const equippedOmodIds = [...Object.values(chosenMods), ...(playerConfig.weapon?.legendaryEffects ?? [])].filter(
      (id): id is string => !!id
    );
    const equippedOmods = [
      ...equippedOmodIds.map(id => getOmodById(mode, id)).filter(o => o !== undefined),
      // Undecided slots carry the weapon's real standard parts (no weapon
      // instance has an empty slot) — getDefaultOmods skips decided slots,
      // so an explicitly chosen mod is never double-counted.
      ...getDefaultOmods(mode, baseWeapon, chosenMods),
    ];
    const built = buildEffectiveWeapon(
      baseWeapon,
      equippedOmods,
      playerConfig.itemLevel,
      conditions,
      enemyConfig.conditions,
      loadoutModifiers,
      enemyTypeIds
    );
    weapon = built.weapon;
    omodModifiers = built.modifiers;
  }

  return {
    weapon,
    modifiers: [
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
      ...loadoutModifiers.filter(m => !WEAPON_STAT_BUCKETS.has(m.bucket)),
    ],
    conditions,
    enemyTypeIds,
  };
}

/**
 * Derived stats (effective SPECIAL + max HP) for the Build column's stat
 * summary — same assembly and derivation as `resolveLoadout`, but works
 * without an equipped weapon (weapon-gated stat modifiers just don't match).
 */
export function resolveStats(playerConfig: PlayerConfig, enemyConfig: EnemyConfig, mode: GameMode): DerivedPlayerStats {
  const { weapon, modifiers, conditions, enemyTypeIds } = assemble(playerConfig, enemyConfig, mode);
  return derivePlayerStats(
    modifiers,
    baseSpecialOf(playerConfig),
    conditions,
    enemyConfig.conditions,
    weapon,
    playerConfig.itemLevel,
    enemyTypeIds
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
 * Returns null when the config has no equipped weapon (nothing to compute).
 */
export function resolveLoadout(
  playerConfig: PlayerConfig,
  enemyConfig: EnemyConfig,
  mode: GameMode
): ScenarioInput | null {
  const { weapon, modifiers, conditions, enemyTypeIds } = assemble(playerConfig, enemyConfig, mode);
  if (!weapon) return null;

  // Effective SPECIAL (base + SPECIAL-bucket buffs: Buffout +2 STR...) and
  // derived max HP (245 + 5×END + maxHealth bucket: Lifegiver...) — shared
  // derivation with the Build column's stat summary (src/lib/player-stats.ts).
  // STR feeds the melee term, LCK the crit meter, END the HP formula,
  // maxHealth the healthCurrent curve input (Juggernaut's). `conditions`
  // carries the derived strangeInNumbers/classFreakRank gates the
  // condition-aware SPECIAL folds read.
  const { special, maxHealth } = derivePlayerStats(
    modifiers,
    baseSpecialOf(playerConfig),
    conditions,
    enemyConfig.conditions,
    weapon,
    playerConfig.itemLevel,
    enemyTypeIds
  );
  const player = {
    // Derived-gate view of the stored conditions (strangeInNumbers,
    // classFreakRank — see assemble()).
    ...conditions,
    ...special,
    maxHealth,
    // Mutant's curve input: the selected mutation list IS the mutation count.
    mutationCount: playerConfig.conditions.mutationCount ?? playerConfig.mutations.length,
    // Ghoul Glow meter: clamp to the derived max HP (max Glow = max HP) so a
    // stored value from a since-shrunk build never reads above the cap.
    glow: Math.min(playerConfig.conditions.glow ?? 0, maxHealth),
    // Gourmand's curve input: the two meter tiers sum to the HungerThirstTier AV.
    hungerThirstTier: deriveHungerThirstTier(playerConfig.conditions),
    // Junkie's curve input: selected addictions minus ones suppressed by an
    // active addictive consumable (any category — docs/assumptions.md
    // "Consumable stacking & addictions"). Unconditional override: the
    // stored conditions value only feeds synthetic engine tests.
    addictionCount: deriveAddictionCount(playerConfig.addictions, getSuppressedAddictions(mode, playerConfig.consumables)),
  };

  // Body-part mult: the Target section's race + part pick resolves through
  // BPTD data; without one the custom multiplier applies.
  const { targetRace, targetBodyPart } = enemyConfig.conditions;
  const pickedMult = targetRace && targetBodyPart ? getBodyPartMult(mode, targetRace, targetBodyPart) : undefined;

  return {
    mode,
    weapon,
    itemLevel: playerConfig.itemLevel,
    modifiers,
    player,
    enemy: enemyConfig.conditions,
    enemyTypeIds,
    weakpointMult: pickedMult ?? playerConfig.weakpointMult,
    // critRate omitted → computed from the crit meter (LCK, Crit Savvy,
    // Limit Breaking, weapon crit charge bonus).
    chargeTimeSec: playerConfig.chargeTimeSec,
  };
}
