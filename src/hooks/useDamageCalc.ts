import * as React from 'react';
import type { PlayerConfig, EnemyConfig, DamageStats, GameMode } from '@/types';
import { createDefaultDamageStats } from '@/types';
import { getWeapons } from '@/data';
import { getLoadoutModifiers } from '@/data/perk-modifiers';
import { getOmodById } from '@/data/omods';
import { getBuffModifiers } from '@/data/buffs';
import { buildEffectiveWeapon } from '@/lib/engine/effective-weapon';
import { computeScenarios, type ScenarioSet } from '@/lib/engine/scenarios';

export interface DamageCalcResult {
  playerToEnemy: DamageStats;
  enemyToPlayer: DamageStats;
  /** Full scenario breakdown (Manual / VATS / VATS+Sneak); null without a weapon. */
  scenarios: ScenarioSet | null;
}

/**
 * Computes damage via the paper-damage engine (src/lib/engine/).
 * `playerToEnemy` keeps the legacy DamageStats shape for the current stats
 * column (manual-aim numbers); the full ScenarioSet is exposed for the
 * three-column display.
 */
export function useDamageCalc(playerConfig: PlayerConfig, enemyConfig: EnemyConfig, mode: GameMode): DamageCalcResult {
  return React.useMemo(() => {
    const baseWeapon = playerConfig.weapon ? getWeapons(mode)[playerConfig.weapon.weaponId] : undefined;
    if (!baseWeapon) {
      return { playerToEnemy: createDefaultDamageStats(), enemyToPlayer: createDefaultDamageStats(), scenarios: null };
    }

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

    const scenarios = computeScenarios({
      mode,
      weapon,
      itemLevel: playerConfig.itemLevel,
      modifiers,
      player: playerConfig.conditions,
      enemy: enemyConfig.conditions,
      weakpointMult: playerConfig.weakpointMult,
      // critRate omitted → computed from the crit meter (LCK, Crit Savvy,
      // Limit Breaking, weapon crit charge bonus).
    });

    const playerToEnemy: DamageStats = {
      normalPerHit: scenarios.manualAim.perHit.total,
      normalDps: scenarios.manualAim.sustainedDps,
      weakpointPerHit: scenarios.manualAim.weakpointPerHit.total,
      weakpointDps: scenarios.manualAim.weakpointDps,
      fireRate: scenarios.manualAim.fireRate,
    };

    // Enemy → Player stays dormant (paper damage v1).
    return { playerToEnemy, enemyToPlayer: createDefaultDamageStats(), scenarios };
  }, [playerConfig, enemyConfig, mode]);
}
