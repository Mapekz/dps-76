import type { PlayerConfig, EnemyConfig, GameMode } from '@/types';
import type { Bucket, Modifier } from '@/types/modifiers';
import { getWeapons } from '@/data';
import { getLoadoutModifiers } from '@/data/perk-modifiers';
import { getOmodById } from '@/data/omods';
import { getBuffModifiers } from '@/data/buffs';
import { buildEffectiveWeapon } from '@/lib/engine/effective-weapon';
import { foldOps } from '@/lib/engine/resolve';
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
  const { weapon, modifiers: omodModifiers } = buildEffectiveWeapon(baseWeapon, equippedOmods, playerConfig.itemLevel);

  const modifiers = [
    ...omodModifiers,
    ...getLoadoutModifiers(mode, playerConfig.perks),
    ...getLoadoutModifiers(mode, playerConfig.legendaryPerks),
    ...getBuffModifiers(mode, playerConfig.mutations, playerConfig.consumables),
  ];

  // SPECIAL-bucket modifiers (Buffout +2 STR, Bufftats...) fold into the
  // engine-consumed SPECIAL stats: STR feeds the melee term, LCK the crit
  // meter. Other SPECIAL buckets stay stored-inert until perk-SPECIAL scaling
  // lands. Flat unconditional ADDs only; no cap — real stacking/exclusivity
  // rules come with the consumables overhaul (docs/assumptions.md).
  const foldSpecial = (bucket: Bucket, base: number) =>
    foldOps(
      modifiers
        .filter((m): m is Modifier & { value: number } => m.bucket === bucket && !m.curve && m.conditions.length === 0)
        .map(m => ({ op: m.op, value: m.value })),
      base
    );
  const player = {
    ...playerConfig.conditions,
    strength: foldSpecial('specialStrength', playerConfig.conditions.strength),
    luck: foldSpecial('specialLuck', playerConfig.conditions.luck),
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
