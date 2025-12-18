import type { Enemy, EnemyMutation } from '@/types';

export const enemies: Record<string, Enemy> = {
  super_mutant: { id: 'super_mutant', name: 'Super Mutant', level: 100, health: 850, damageResist: 100, energyResist: 100 },
};

export const enemyMutations: Record<string, EnemyMutation> = {
  none: { id: 'none', name: 'None', statModifiers: {} },
};

export const legendaryRankModifiers = {
  0: { healthMultiplier: 1.0, damageMultiplier: 1.0 },
  1: { healthMultiplier: 1.25, damageMultiplier: 1.1 },
  2: { healthMultiplier: 1.5, damageMultiplier: 1.2 },
  3: { healthMultiplier: 2.0, damageMultiplier: 1.3 },
} as const;
