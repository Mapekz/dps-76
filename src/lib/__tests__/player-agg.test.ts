import { describe, expect, it } from 'bun:test';
import { playerAgg } from '@/lib/loadout-memo-wrappers';
import { createMemoScope } from '@/lib/loadout-memo';
import type { DerivedPlayerStats } from '@/lib/player-stats';
import { createDefaultPlayerConfig } from '@/types';

const derived = {
  special: {
    strength: 1,
    perception: 2,
    endurance: 3,
    charisma: 4,
    intelligence: 5,
    agility: 6,
    luck: 7,
  },
  maxHealth: 100,
  lockpickSkill: 8,
  hackingSkill: 9,
  burningLegendaryCount: 10,
  frozenLegendaryCount: 11,
  toxicLegendaryCount: 12,
  damageResistGain: 13,
  stimpakHealMult: 14,
  stimpakHealMagMult: 15,
  stimpakHealDurationMult: 16,
} satisfies DerivedPlayerStats;

describe('playerAgg', () => {
  const raw = createDefaultPlayerConfig().conditions;
  const conditions = { ...raw, strangeInNumbers: false };

  it('copies each derived stat onto its own player field', () => {
    const player = playerAgg(undefined, conditions, derived, [], raw, 0);
    expect(player).toMatchObject({
      ...derived.special,
      maxHealth: 100,
      lockpickSkill: 8,
      hackingSkill: 9,
      burningLegendaryCount: 10,
      frozenLegendaryCount: 11,
      toxicLegendaryCount: 12,
      playerDamageResist: 13,
      stimpakHealMult: 14,
      stimpakHealMagMult: 15,
      stimpakHealDurationMult: 16,
    });
  });

  it('reuses the player reference while the derived-stats reference is unchanged', () => {
    const scope = createMemoScope();
    const mutations: string[] = [];
    const first = playerAgg(scope, conditions, derived, mutations, raw, 0);
    expect(playerAgg(scope, conditions, derived, mutations, raw, 0)).toBe(first);
    expect(playerAgg(scope, conditions, { ...derived }, mutations, raw, 0)).not.toBe(first);
  });
});
