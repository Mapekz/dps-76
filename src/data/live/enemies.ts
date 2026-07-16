import type { Enemy, EnemyMutation } from '@/types';

// Placeholder enemy stats (health/DR/ER) pending ESM extraction — enemy
// modeling is dormant (no enemy-config UI is mounted yet — see
// dps-todos/phase-3-enemies.md).
// This is the canonical list for both modes; pts re-exports it.
export const enemies: Record<string, Enemy> = {
  super_mutant: { id: 'super_mutant', name: 'Super Mutant', level: 100, health: 850, damageResist: 100, energyResist: 100 },
  super_mutant_behemoth: { id: 'super_mutant_behemoth', name: 'Super Mutant Behemoth', level: 100, health: 4500, damageResist: 250, energyResist: 250 },
  scorched: { id: 'scorched', name: 'Scorched', level: 100, health: 300, damageResist: 50, energyResist: 50 },
  scorchbeast: { id: 'scorchbeast', name: 'Scorchbeast', level: 100, health: 3500, damageResist: 200, energyResist: 200 },
  scorchbeast_queen: { id: 'scorchbeast_queen', name: 'Scorchbeast Queen', level: 100, health: 32000, damageResist: 300, energyResist: 300 },
  ghoul_feral: { id: 'ghoul_feral', name: 'Feral Ghoul', level: 100, health: 400, damageResist: 75, energyResist: 75 },
  ghoul_glowing: { id: 'ghoul_glowing', name: 'Glowing One', level: 100, health: 800, damageResist: 125, energyResist: 125 },
  deathclaw: { id: 'deathclaw', name: 'Deathclaw', level: 100, health: 2000, damageResist: 200, energyResist: 150 },
  mirelurk_queen: { id: 'mirelurk_queen', name: 'Mirelurk Queen', level: 100, health: 4000, damageResist: 300, energyResist: 200 },
  assaultron: { id: 'assaultron', name: 'Assaultron', level: 100, health: 1200, damageResist: 150, energyResist: 200 },
  sentry_bot: { id: 'sentry_bot', name: 'Sentry Bot', level: 100, health: 2500, damageResist: 250, energyResist: 250 },
  wendigo: { id: 'wendigo', name: 'Wendigo', level: 100, health: 1500, damageResist: 175, energyResist: 175 },
  ultracite_titan: { id: 'ultracite_titan', name: 'Ultracite Titan', level: 100, health: 45000, damageResist: 350, energyResist: 350 },
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
