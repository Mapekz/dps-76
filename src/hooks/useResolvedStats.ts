import * as React from 'react';
import type { EnemyConfig, GameMode, PlayerConfig } from '@/types';
import { resolveStats } from '@/lib/loadout';

/** Memoized `resolveStats` — shared by StatSummary and ConditionsSection, which both derive the same stat headline from the same build. */
export function useResolvedStats(player: PlayerConfig, enemy: EnemyConfig, mode: GameMode) {
  return React.useMemo(() => resolveStats(player, enemy, mode), [player, enemy, mode]);
}
