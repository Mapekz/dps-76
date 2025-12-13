import * as React from 'react';
import type { PlayerConfig, EnemyConfig, DamageStats, GameMode } from '@/types';
import { calculateDamage } from '@/lib/damage-formulas';

export function useDamageCalc(playerConfig: PlayerConfig, enemyConfig: EnemyConfig, mode: GameMode): { playerToEnemy: DamageStats; enemyToPlayer: DamageStats } {
  return React.useMemo(() => calculateDamage(playerConfig, enemyConfig, mode), [playerConfig, enemyConfig, mode]);
}
