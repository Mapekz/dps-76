import type { PlayerConfig, EnemyConfig, GameMode, Weapon } from '@/types';
import type { Modifier } from '@/types/modifiers';
import { getWeapons } from '@/data';
import { getLoadoutModifiers } from '@/data/perk-modifiers';
import { getOmodById } from '@/data/omods';
import { getBuffModifiers } from '@/data/buffs';
import { buildEffectiveWeapon } from '@/lib/engine/effective-weapon';
import { legendaryBonusOf } from '@/data/perk-budget';
import { derivePlayerStats, SPECIAL_KEYS, type DerivedPlayerStats, type SpecialKey } from '@/lib/player-stats';
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
): { weapon: Weapon | undefined; modifiers: Modifier[] } {
  const baseWeapon = playerConfig.weapon ? getWeapons(mode)[playerConfig.weapon.weaponId] : undefined;

  // Apply equipped OMODs (standard slots + legendary effects) to the weapon.
  let weapon: Weapon | undefined;
  let omodModifiers: Modifier[] = [];
  if (baseWeapon) {
    const equippedOmodIds = [
      ...Object.values(playerConfig.weapon?.mods ?? {}),
      ...(playerConfig.weapon?.legendaryEffects ?? []),
    ].filter((id): id is string => !!id);
    const equippedOmods = equippedOmodIds.map(id => getOmodById(mode, id)).filter(o => o !== undefined);
    const built = buildEffectiveWeapon(
      baseWeapon,
      equippedOmods,
      playerConfig.itemLevel,
      playerConfig.conditions,
      enemyConfig.conditions
    );
    weapon = built.weapon;
    omodModifiers = built.modifiers;
  }

  return {
    weapon,
    modifiers: [
      ...omodModifiers,
      ...getLoadoutModifiers(mode, playerConfig.perks),
      ...getLoadoutModifiers(mode, playerConfig.legendaryPerks),
      ...getBuffModifiers(mode, playerConfig.mutations, playerConfig.consumables),
    ],
  };
}

/**
 * Derived stats (effective SPECIAL + max HP) for the Build column's stat
 * summary — same assembly and derivation as `resolveLoadout`, but works
 * without an equipped weapon (weapon-gated stat modifiers just don't match).
 */
export function resolveStats(playerConfig: PlayerConfig, enemyConfig: EnemyConfig, mode: GameMode): DerivedPlayerStats {
  const { weapon, modifiers } = assemble(playerConfig, enemyConfig, mode);
  return derivePlayerStats(
    modifiers,
    baseSpecialOf(playerConfig),
    playerConfig.conditions,
    enemyConfig.conditions,
    weapon,
    playerConfig.itemLevel
  );
}

/**
 * Resolves a player build ("loadout") into engine-ready input: the effective
 * weapon plus the full modifier list assembled from every damage source.
 *
 * This is the one sanctioned bridge from the data layer (`@/data`) to the
 * damage engine (`@/lib/engine`, which stays data-adapter-free). Both the
 * `useDamageCalc` hook and the golden-case harness go through here, so the
 * assembly — which OMOD ids get collected, in what order, from which config
 * fields — lives in exactly one testable place.
 *
 * Returns null when the config has no equipped weapon (nothing to compute).
 */
export function resolveLoadout(
  playerConfig: PlayerConfig,
  enemyConfig: EnemyConfig,
  mode: GameMode
): ScenarioInput | null {
  const { weapon, modifiers } = assemble(playerConfig, enemyConfig, mode);
  if (!weapon) return null;

  // Effective SPECIAL (base + SPECIAL-bucket buffs: Buffout +2 STR...) and
  // derived max HP (245 + 5×END + maxHealth bucket: Lifegiver...) — shared
  // derivation with the Build column's stat summary (src/lib/player-stats.ts).
  // STR feeds the melee term, LCK the crit meter, END the HP formula,
  // maxHealth the healthCurrent curve input (Juggernaut's).
  const { special, maxHealth } = derivePlayerStats(
    modifiers,
    baseSpecialOf(playerConfig),
    playerConfig.conditions,
    enemyConfig.conditions,
    weapon,
    playerConfig.itemLevel
  );
  const player = {
    ...playerConfig.conditions,
    ...special,
    maxHealth,
    // Mutant's curve input: the selected mutation list IS the mutation count.
    mutationCount: playerConfig.conditions.mutationCount ?? playerConfig.mutations.length,
  };

  return {
    mode,
    weapon,
    itemLevel: playerConfig.itemLevel,
    modifiers,
    player,
    enemy: enemyConfig.conditions,
    weakpointMult: playerConfig.weakpointMult,
    // critRate omitted → computed from the crit meter (LCK, Crit Savvy,
    // Limit Breaking, weapon crit charge bonus).
  };
}
