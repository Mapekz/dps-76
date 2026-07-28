import type { PlayerConfig, EnemyConfig, GameMode, PlayerConditions, Weapon } from '@/types';
import type { Bucket, Modifier } from '@/types/modifiers';
import {
  getActionPointConstants,
  getBulletStormConstants,
  getDistanceConstants,
  getMitigationConstants,
  getSpecialClamp,
  getVatsCritConstants,
  getWeapons,
} from '@/data';
import { getEquippedPerkFamilyRanks, getLoadoutModifiers } from '@/data/perk-modifiers';
import { getArmorEffectModifiers, getArmorEffectWornPieceCounts } from '@/data/armor-modifiers';
import { getDefaultOmods, getOmodById } from '@/data/omods';
import { getAddictionModifiers, getBuffModifiers, getSuppressedAddictions } from '@/data/buffs';
import { consumablesById } from '@/lib/consumable-rules';
import { getManualUptimeModifiers } from '@/data/manual-uptime';
import { getPlayerBaselineModifiers } from '@/data/player-baseline';
import { getTargetDebuffModifiers } from '@/data/target-debuffs';
import { getPublicTeamModifiers } from '@/data/public-teams';
import {
  buildEffectiveWeapon,
  SUSTAIN_CHANCE_BUCKETS,
  WEAPON_STAT_BUCKETS,
} from '@/lib/engine/effective-weapon';
import { legendaryBonusOf } from '@/data/perk-budget';
import { resolveTargetBodyPart, getEnemyTypeIds } from '@/data/bodyparts';
import { getNpc } from '@/data/npcs';
import { getEnemyDefenses, resolveTargetLevel } from '@/lib/enemy-defenses';
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

const EFFECTIVE_WEAPON_BOOTSTRAP_BUCKETS: ReadonlySet<Bucket> = new Set([
  // Folded by buildEffectiveWeapon into ResolveContext.moveSpeedBonus so
  // Fast Fighter's reload-speed curve can see Speed Demon / fish sandwich.
  // Onslaught bootstrap buckets must stay in ScenarioInput.modifiers:
  // computeScenarios folds and exposes them there.
  'moveSpeedBonus',
]);

/**
 * Base SPECIAL fed to the stat folds: the user-defined allocation stored in
 * conditions + Legendary SPECIAL card bonuses (+1/+2/+3/+5 by rank, on top of
 * base — they raise the stat as well as the perk-point budget).
 */
function baseSpecialOf(playerConfig: PlayerConfig): Record<SpecialKey, number> {
  const legendaryBonus = legendaryBonusOf(playerConfig.legendaryPerks);
  return Object.fromEntries(
    SPECIAL_KEYS.map((key) => [key, playerConfig.conditions[key] + legendaryBonus[key]]),
  ) as Record<SpecialKey, number>;
}

/** Effective weapon (OMODs applied) + the full modifier list — shared by resolveLoadout and resolveStats. */
function assemble(
  playerConfig: PlayerConfig,
  enemyConfig: EnemyConfig,
  mode: GameMode,
): {
  weapon: Weapon | undefined;
  modifiers: Modifier[];
  conditions: PlayerConditions;
  enemyTypeIds: readonly string[];
} {
  const baseWeapon = playerConfig.weapon
    ? getWeapons(mode)[playerConfig.weapon.weaponId]
    : undefined;

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
    underAlcoholEffect: playerConfig.consumables.some(
      (id) => consumablesById(mode).get(id)?.category === 'alcohol',
    ),
    // Family → highest owned rank across both loadouts — the perkFamilyRank
    // condition's input (cross-family HasPerk gates, e.g. Lock and Load →
    // Bullet Storm's reload speed).
    equippedPerkRanks: getEquippedPerkFamilyRanks(mode, [
      ...playerConfig.perks,
      ...playerConfig.legendaryPerks,
    ]),
    // Armor checklist selections are the single source of truth
    // (docs/assumptions.md "Armor") — derived here, never set by the
    // UI directly, for the self-scaling effects' wornPieceCount conditions
    // (Battle-Loader's, Limit-Breaking Armor).
    wornPieceCounts: getArmorEffectWornPieceCounts(mode, playerConfig.armorEffects),
  };

  // Withdrawal penalties for counted addictions — selected minus suppressed
  // (an active consumable suppresses its own family's withdrawal, the same
  // rule Junkie's addictionCount uses; docs/assumptions.md "Consumable
  // stacking & addictions").
  const suppressed = getSuppressedAddictions(mode, playerConfig.consumables);
  const countedAddictions = playerConfig.addictions.filter((id) => !suppressed.has(id));

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

  // Follow Through / Taking One for the Team manual damage-multiplier toggles
  // — driven by the Target panel's inputs, not the player's own cards
  // (@/data/manual-uptime), so pushed unconditionally like Tenderizer below.
  loadoutModifiers.push(...getManualUptimeModifiers(conditions));
  loadoutModifiers.push(
    ...getPublicTeamModifiers(conditions.publicTeamType, conditions.teammateCount),
  );
  // Hidden survival-ability baselines (hydration AP regen) — gated by the
  // hydrated/playerIsGhoul conditions at resolve time, so pushed unconditionally.
  loadoutModifiers.push(...getPlayerBaselineModifiers());
  // Target-side debuffs (Tenderizer stacks, Taking One for the Team's flat DR
  // debuff) — driven by the Target panel's inputs, not the player's own
  // cards, so pushed unconditionally too.
  loadoutModifiers.push(...getTargetDebuffModifiers(conditions));
  // Armor checklist selections (Unyielding, 2★ SPECIAL, Battle-
  // Loader's, ...) — pushed BEFORE buildEffectiveWeapon like every other
  // source above so their weapon-stat/sustain-chance buckets (Battle-
  // Loader's reloadSkipChanceBash, Propelling's moveSpeedBonus) get folded
  // the same way OMOD/perk modifiers do.
  loadoutModifiers.push(...getArmorEffectModifiers(mode, playerConfig.armorEffects));

  // Apply equipped OMODs (standard slots + legendary effects) to the weapon.
  let weapon: Weapon | undefined;
  let omodModifiers: Modifier[] = [];
  if (baseWeapon) {
    const chosenMods = playerConfig.weapon?.mods ?? {};
    const equippedOmodIds = [
      ...Object.values(chosenMods),
      ...(playerConfig.weapon?.legendaryEffects ?? []),
    ].filter((id): id is string => !!id);
    const equippedOmods = [
      ...equippedOmodIds.map((id) => getOmodById(mode, id)).filter((o) => o !== undefined),
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
      enemyTypeIds,
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
      ...loadoutModifiers.filter(
        (m) =>
          !WEAPON_STAT_BUCKETS.has(m.bucket) &&
          !SUSTAIN_CHANCE_BUCKETS.has(m.bucket) &&
          !EFFECTIVE_WEAPON_BOOTSTRAP_BUCKETS.has(m.bucket),
      ),
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
export function resolveStats(
  playerConfig: PlayerConfig,
  enemyConfig: EnemyConfig,
  mode: GameMode,
): DerivedPlayerStats {
  const { weapon, modifiers, conditions, enemyTypeIds } = assemble(playerConfig, enemyConfig, mode);
  return derivePlayerStats(
    modifiers,
    baseSpecialOf(playerConfig),
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
 * Returns null when the config has no equipped weapon (nothing to compute).
 */
export function resolveLoadout(
  playerConfig: PlayerConfig,
  enemyConfig: EnemyConfig,
  mode: GameMode,
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
    enemyTypeIds,
    getSpecialClamp(mode),
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
    addictionCount: deriveAddictionCount(
      playerConfig.addictions,
      getSuppressedAddictions(mode, playerConfig.consumables),
    ),
  };

  // Body-part mult + location axis: the Target section's race + part pick
  // resolves through BPTD data; without one the custom multiplier applies
  // and the location axis falls back to the engine's legacy mult-derived
  // category (resolveTargetBodyPart — single source of truth, also used by
  // the aim-point UI readouts).
  const { targetRace, targetBodyPart, targetLevel, epicRank } = enemyConfig.conditions;
  const resolvedTarget = resolveTargetBodyPart(
    mode,
    targetRace,
    targetBodyPart,
    playerConfig.weakpointMult,
  );

  // Enemy defenses (Phase 2 — Enemy defenses): resolves the same npc row the
  // body-part picker already joins via `targetRace`, at the stored (or
  // default-to-max) level. `getEnemyDefenses` returns null without a race
  // selected or a race with no npc data, which threads through as `undefined`
  // on ScenarioInput — scenarios.ts's `effective` field just stays absent.
  // `epicRank` is the Target section's ★ toggle (ignored by getEnemyDefenses
  // for races with a forced rank, and for non-epicAllowed races).
  const targetNpc = targetRace ? getNpc(mode, targetRace) : undefined;
  const resolvedLevel = resolveTargetLevel(targetNpc, targetLevel);
  const enemyDefenses = getEnemyDefenses(mode, targetRace, resolvedLevel, epicRank) ?? undefined;

  return {
    mode,
    weapon,
    itemLevel: playerConfig.itemLevel,
    modifiers,
    player,
    enemy: enemyConfig.conditions,
    enemyTypeIds,
    weakpointMult: resolvedTarget.mult,
    targetIsTorso: resolvedTarget.isTorso,
    // critRate omitted → computed from the crit meter (LCK, Crit Savvy,
    // Limit Breaking, weapon crit charge bonus).
    chargeTimeSec: playerConfig.chargeTimeSec,
    enemyDefenses,
    mitigationConstants: getMitigationConstants(mode),
    engineConstants: {
      vatsCrit: getVatsCritConstants(mode),
      actionPoints: getActionPointConstants(mode),
      bulletStorm: getBulletStormConstants(mode),
      distance: getDistanceConstants(mode),
    },
  };
}
