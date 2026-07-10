import type { PlayerConfig, EnemyConfig, GameMode } from '@/types';
import { getWeapons } from '@/data';
import { getLoadoutModifiers } from '@/data/perk-modifiers';
import { getOmodById } from '@/data/omods';
import { getBuffModifiers } from '@/data/buffs';
import { buildEffectiveWeapon } from '@/lib/engine/effective-weapon';
import type { ScenarioInput } from '@/lib/engine/scenarios';

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
  const baseWeapon = playerConfig.weapon ? getWeapons(mode)[playerConfig.weapon.weaponId] : undefined;
  if (!baseWeapon) return null;

  // Apply equipped OMODs (standard slots + legendary effects) to the weapon.
  const equippedOmodIds = [
    ...Object.values(playerConfig.weapon?.mods ?? {}),
    ...(playerConfig.weapon?.legendaryEffects ?? []),
  ].filter((id): id is string => !!id);
  const equippedOmods = equippedOmodIds
    .map(id => getOmodById(mode, id))
    .filter(o => o !== undefined);
  const { weapon, modifiers: omodModifiers } = buildEffectiveWeapon(baseWeapon, equippedOmods);

  const modifiers = [
    ...omodModifiers,
    ...getLoadoutModifiers(mode, playerConfig.perks),
    ...getLoadoutModifiers(mode, playerConfig.legendaryPerks),
    ...getBuffModifiers(mode, playerConfig.mutations, playerConfig.consumables),
  ];

  return {
    mode,
    weapon,
    itemLevel: playerConfig.itemLevel,
    modifiers,
    player: playerConfig.conditions,
    enemy: enemyConfig.conditions,
    weakpointMult: playerConfig.weakpointMult,
    // critRate omitted → computed from the crit meter (LCK, Crit Savvy,
    // Limit Breaking, weapon crit charge bonus).
  };
}
