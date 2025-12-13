import type { Perk } from '@/types';

// PTS data - mirrors live for now, update when PTS changes
export const perksPTS: Record<string, Perk> = {
  sg: { id: 'sg', name: 'Blocker', maxRank: 3, category: 'strength', statModifiers: { meleeDamageReduction: [15, 30, 45] } },
  ej: { id: 'ej', name: 'Ironclad', maxRank: 5, category: 'endurance', statModifiers: { damageResist: [10, 20, 30, 40, 50], energyResist: [10, 20, 30, 40, 50] } },
  p5: { id: 'p5', name: 'Refractor', maxRank: 5, category: 'perception', statModifiers: { energyResist: [8, 16, 24, 32, 40] } },
  eh: { id: 'eh', name: 'Fireproof', maxRank: 3, category: 'endurance', statModifiers: { explosionDamageReduction: [15, 30, 45], fireDamageReduction: [15, 30, 45] } },
  eu: { id: 'eu', name: 'Radicool', maxRank: 1, category: 'endurance', statModifiers: { strengthPerRad: [1] } },
  cm: { id: 'cm', name: 'Suppressor', maxRank: 3, category: 'charisma', statModifiers: { enemyDamageReduction: [8, 16, 20] } },
  am: { id: 'am', name: 'Evasive', maxRank: 3, category: 'agility', statModifiers: { damageResistPerAgi: [1, 2, 3], energyResistPerAgi: [1, 2, 3] } },
  a1: { id: 'a1', name: 'Dodgy', maxRank: 3, category: 'agility', statModifiers: { dodgeChance: [10, 20, 30] } },
  la: { id: 'la', name: 'Serendipity', maxRank: 3, category: 'luck', statModifiers: { avoidDamageChanceBelowHealth: [15, 30, 45] } },
  lg: { id: 'lg', name: 'Ricochet', maxRank: 3, category: 'luck', statModifiers: { deflectChance: [6, 12, 18] } },
};
