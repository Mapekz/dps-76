import * as React from 'react';
import type { PlayerConfig, EnemyConfig, GameMode } from '@/types';
import { resolveLoadout } from '@/lib/loadout';
import { computeScenarios, type ScenarioSet } from '@/lib/engine/scenarios';

/**
 * Computes damage via the paper-damage engine (src/lib/engine/).
 * Assembly of the effective weapon + modifier list lives in `resolveLoadout`
 * (src/lib/loadout.ts) so it has a testable home outside React; this hook is a
 * thin memoized wrapper. Returns null until a weapon is equipped.
 */
export function useDamageCalc(
  playerConfig: PlayerConfig,
  enemyConfig: EnemyConfig,
  mode: GameMode
): { scenarios: ScenarioSet | null } {
  return React.useMemo(() => {
    const input = resolveLoadout(playerConfig, enemyConfig, mode);
    // The displayed result carries attribution traces (the breakdown panel);
    // speculative evals go through the suggestion engine without them.
    return { scenarios: input ? computeScenarios({ ...input, collectTrace: true }) : null };
  }, [playerConfig, enemyConfig, mode]);
}
