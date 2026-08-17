import { describe, expect, it } from 'bun:test';
import { createDefaultEnemyConditions, type EnemyConditions, type ResolvedPlayer } from '@/types';
import { makeResolvedPlayer } from '@/lib/engine/__tests__/resolved-player-fixture';
import {
  DERIVED_PLAYER_CONDITION_KEYS,
  ENEMY_KNOB_REGISTRY,
  PLAYER_KNOB_REGISTRY,
} from '@/types/knob-registry';

describe('KNOB_REGISTRY', () => {
  it('has exactly one player row per ResolvedPlayer key', () => {
    expect(Object.keys(PLAYER_KNOB_REGISTRY).length).toBe(56);
    for (const key of Object.keys(makeResolvedPlayer())) {
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
    const expected = (Object.keys(PLAYER_KNOB_REGISTRY) as Array<keyof ResolvedPlayer>)
      .filter((key) => PLAYER_KNOB_REGISTRY[key]!.origin === 'derived')
      .sort();
    expect(fromRegistry).toEqual(expected);
  });

  it('DERIVED_PLAYER_CONDITION_KEYS stays aligned with the legacy codec set', () => {
    const legacyCodecDerived: (keyof ResolvedPlayer)[] = [
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

  it('assigns a unique wire ordinal to every registry row', () => {
    for (const registry of [PLAYER_KNOB_REGISTRY, ENEMY_KNOB_REGISTRY]) {
      const wires = Object.values(registry).map((row) => row.wire);
      expect(new Set(wires).size).toBe(wires.length);
      for (const row of Object.values(registry)) {
        expect(typeof row.wire).toBe('number');
      }
    }
  });

  it('player wire ordinals stay pinned', () => {
    const pinned: { key: keyof ResolvedPlayer; wire: number }[] = [
      { key: 'isSneaking', wire: 0 },
      { key: 'isAimingAtWeakpoint', wire: 1 },
      { key: 'armorWorn', wire: 2 },
      { key: 'isInPowerArmor', wire: 3 },
      { key: 'isSolo', wire: 4 },
      { key: 'isPowerAttacking', wire: 5 },
      { key: 'isAimingDownSights', wire: 7 },
      { key: 'isGhoul', wire: 8 },
      { key: 'healthPercent', wire: 9 },
      { key: 'bulletStormStacks', wire: 10 },
      { key: 'onslaughtStacks', wire: 11 },
      { key: 'targetsHit', wire: 12 },
      { key: 'killStreak', wire: 13 },
      { key: 'tenderizerStacks', wire: 14 },
      { key: 'concentratedFireStacks', wire: 15 },
      { key: 'completedChallengeIds', wire: 16 },
      { key: 'localLegendFishingChallengesCompleted', wire: 17 },
      { key: 'addictionCount', wire: 18 },
      { key: 'capsOnHand', wire: 19 },
      { key: 'maxHealth', wire: 20 },
      { key: 'lockpickSkill', wire: 21 },
      { key: 'hackingSkill', wire: 22 },
      { key: 'stimpakHealMult', wire: 23 },
      { key: 'stimpakHealMagMult', wire: 24 },
      { key: 'stimpakHealDurationMult', wire: 25 },
      { key: 'mutationCount', wire: 26 },
      { key: 'hungerThirstTier', wire: 27 },
      { key: 'foodTier', wire: 28 },
      { key: 'drinkTier', wire: 29 },
      { key: 'feralTier', wire: 30 },
      { key: 'glow', wire: 31 },
      { key: 'underAlcoholEffect', wire: 32 },
      { key: 'strangeInNumbers', wire: 33 },
      { key: 'classFreakRank', wire: 34 },
      { key: 'equippedPerkRanks', wire: 35 },
      { key: 'weaponConditionPct', wire: 36 },
      { key: 'hitRatePct', wire: 37 },
      { key: 'vatsHitRatePct', wire: 38 },
      { key: 'bodyPartHitRatePct', wire: 39 },
      { key: 'followThroughPct', wire: 40 },
      { key: 'takingOneForTheTeamPct', wire: 41 },
      { key: 'takingOneForTheTeamDrRank', wire: 42 },
      { key: 'playerDamageResist', wire: 43 },
      { key: 'playerRadResist', wire: 44 },
      { key: 'wornPieceCounts', wire: 45 },
      { key: 'battleLoadersBashSec', wire: 46 },
      { key: 'strength', wire: 47 },
      { key: 'perception', wire: 48 },
      { key: 'endurance', wire: 49 },
      { key: 'charisma', wire: 50 },
      { key: 'intelligence', wire: 51 },
      { key: 'agility', wire: 52 },
      { key: 'luck', wire: 53 },
      { key: 'junkItemCount', wire: 54 },
      { key: 'teammateCount', wire: 55 },
      { key: 'publicTeamType', wire: 56 },
      // wire 6 (isLastShot) and wire 57 (hydrated) retired — see
      // PLAYER_KNOB_REGISTRY's leading comment.
    ];
    const fromRegistry = (Object.keys(PLAYER_KNOB_REGISTRY) as Array<keyof ResolvedPlayer>).map(
      (key) => ({ key, wire: PLAYER_KNOB_REGISTRY[key]!.wire }),
    );
    expect(fromRegistry).toEqual(pinned);
  });

  it('enemy wire ordinals stay pinned', () => {
    const pinned: { key: keyof EnemyConditions; wire: number }[] = [
      { key: 'isCrippled', wire: 0 },
      { key: 'crippledLimbCount', wire: 1 },
      { key: 'statusEffectCount', wire: 2 },
      { key: 'isGlowing', wire: 3 },
      { key: 'isInsect', wire: 4 },
      { key: 'healthPercent', wire: 5 },
      { key: 'groupTargetCount', wire: 6 },
      { key: 'isBurning', wire: 7 },
      { key: 'isPoisoned', wire: 8 },
      { key: 'isBleeding', wire: 9 },
      { key: 'isFrozen', wire: 10 },
      { key: 'targetDistance', wire: 11 },
      { key: 'targetRace', wire: 12 },
      { key: 'targetBodyPart', wire: 13 },
      { key: 'targetLevel', wire: 14 },
      { key: 'epicRank', wire: 15 },
    ];
    const fromRegistry = (Object.keys(ENEMY_KNOB_REGISTRY) as Array<keyof EnemyConditions>).map(
      (key) => ({ key, wire: ENEMY_KNOB_REGISTRY[key]!.wire }),
    );
    expect(fromRegistry).toEqual(pinned);
  });
});
