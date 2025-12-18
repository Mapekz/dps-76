import type { Enemy, EnemyMutation } from '@/types';

export const enemies: Record<string, Enemy> = {
  super_mutant: { id: 'super_mutant', name: 'Super Mutant', level: 100, health: 850, damageResist: 100, energyResist: 100, baseDamage: 75, damageType: 'ballistic' },
  super_mutant_behemoth: { id: 'super_mutant_behemoth', name: 'Super Mutant Behemoth', level: 100, health: 4500, damageResist: 250, energyResist: 250, baseDamage: 200, damageType: 'melee' },
  scorched: { id: 'scorched', name: 'Scorched', level: 100, health: 300, damageResist: 50, energyResist: 50, baseDamage: 50, damageType: 'ballistic' },
  scorchbeast: { id: 'scorchbeast', name: 'Scorchbeast', level: 100, health: 3500, damageResist: 200, energyResist: 200, baseDamage: 150, damageType: 'energy' },
  scorchbeast_queen: { id: 'scorchbeast_queen', name: 'Scorchbeast Queen', level: 100, health: 32000, damageResist: 300, energyResist: 300, baseDamage: 250, damageType: 'energy' },
  ghoul_feral: { id: 'ghoul_feral', name: 'Feral Ghoul', level: 100, health: 400, damageResist: 75, energyResist: 75, baseDamage: 60, damageType: 'melee' },
  ghoul_glowing: { id: 'ghoul_glowing', name: 'Glowing One', level: 100, health: 800, damageResist: 125, energyResist: 125, baseDamage: 100, damageType: 'radiation' },
  deathclaw: { id: 'deathclaw', name: 'Deathclaw', level: 100, health: 2000, damageResist: 200, energyResist: 150, baseDamage: 175, damageType: 'melee' },
  mirelurk_queen: { id: 'mirelurk_queen', name: 'Mirelurk Queen', level: 100, health: 4000, damageResist: 300, energyResist: 200, baseDamage: 200, damageType: 'poison' },
  assaultron: { id: 'assaultron', name: 'Assaultron', level: 100, health: 1200, damageResist: 150, energyResist: 200, baseDamage: 125, damageType: 'energy' },
  sentry_bot: { id: 'sentry_bot', name: 'Sentry Bot', level: 100, health: 2500, damageResist: 250, energyResist: 250, baseDamage: 150, damageType: 'ballistic' },
  wendigo: { id: 'wendigo', name: 'Wendigo', level: 100, health: 1500, damageResist: 175, energyResist: 175, baseDamage: 150, damageType: 'melee' },
  ultracite_titan: { id: 'ultracite_titan', name: 'Ultracite Titan', level: 100, health: 45000, damageResist: 350, energyResist: 350, baseDamage: 300, damageType: 'radiation' },
};

export const enemyMutations: Record<string, EnemyMutation> = {
  none: { id: 'none', name: 'None', statModifiers: {} },
  volatile: { id: 'volatile', name: 'Volatile', statModifiers: { explosionOnDeath: 100 } },
  freezing: { id: 'freezing', name: 'Freezing', statModifiers: { cryoDamageBonus: 25 } },
  acidic: { id: 'acidic', name: 'Acidic', statModifiers: { poisonDamageBonus: 25 } },
  pyromaniac: { id: 'pyromaniac', name: 'Pyromaniac', statModifiers: { fireDamageBonus: 25 } },
};

export const legendaryRankModifiers = {
  0: { healthMultiplier: 1.0, damageMultiplier: 1.0 },
  1: { healthMultiplier: 1.25, damageMultiplier: 1.1 },
  2: { healthMultiplier: 1.5, damageMultiplier: 1.2 },
  3: { healthMultiplier: 2.0, damageMultiplier: 1.3 },
} as const;
