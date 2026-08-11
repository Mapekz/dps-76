import { describe, expect, it } from 'bun:test';
import {
  createDefaultEnemyConditions,
  createDefaultPlayerConditions,
  type PlayerConditions,
} from '@/types';
import {
  DERIVED_PLAYER_CONDITION_KEYS,
  ENEMY_KNOB_REGISTRY,
  PLAYER_KNOB_REGISTRY,
} from '@/types/knob-registry';

describe('KNOB_REGISTRY', () => {
  it('has exactly one player row per PlayerConditions key', () => {
    expect(Object.keys(PLAYER_KNOB_REGISTRY).length).toBe(58);
    for (const key of Object.keys(createDefaultPlayerConditions())) {
      expect(PLAYER_KNOB_REGISTRY).toHaveProperty(key);
    }
    expect(PLAYER_KNOB_REGISTRY).toHaveProperty('mutationCount');
    expect(PLAYER_KNOB_REGISTRY).toHaveProperty('wornPieceCounts');
  });

  it('has exactly one enemy row per EnemyConditions key', () => {
    expect(Object.keys(ENEMY_KNOB_REGISTRY).sort()).toEqual(
      Object.keys(createDefaultEnemyConditions()).sort(),
    );
  });

  it('DERIVED_PLAYER_CONDITION_KEYS matches every derived player row', () => {
    const fromRegistry = [...DERIVED_PLAYER_CONDITION_KEYS].sort();
    const expected = (Object.keys(PLAYER_KNOB_REGISTRY) as Array<keyof PlayerConditions>)
      .filter((key) => PLAYER_KNOB_REGISTRY[key]!.origin === 'derived')
      .sort();
    expect(fromRegistry).toEqual(expected);
  });

  it('DERIVED_PLAYER_CONDITION_KEYS stays aligned with the legacy codec set', () => {
    const legacyCodecDerived: (keyof PlayerConditions)[] = [
      'addictionCount',
      'hackingSkill',
      'hungerThirstTier',
      'lockpickSkill',
      'maxHealth',
      'mutationCount',
      'stimpakHealDurationMult',
      'stimpakHealMagMult',
      'stimpakHealMult',
      'strangeInNumbers',
    ];
    expect([...DERIVED_PLAYER_CONDITION_KEYS].sort()).toEqual(legacyCodecDerived.sort());
  });
});
