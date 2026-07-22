import { describe, it, expect } from 'vitest';
import {
  BUCKET_REGISTRY,
  SUSTAIN_CHANCE_BUCKETS,
  WEAPON_STAT_BUCKETS,
  INERT_ENGINE_BUCKETS,
  hasAnyEngineEffect,
  modifierHasEngineEffect,
  type Bucket,
  type Modifier,
} from '@/types/modifiers';

/**
 * Every Bucket union member listed here — kept in sync by hand since a TS
 * union has no runtime enumeration. `BUCKET_REGISTRY`'s own
 * `Record<Bucket, BucketRegimeEntry>` annotation already gives a STRUCTURAL
 * exhaustiveness guarantee at compile time (a missing or extra key is a type
 * error) — this test is the CONTENT check: it pins which buckets the two
 * derived sets actually land in, so a future misclassification (like the
 * specialEndurance/Charisma/Intelligence/Agility drift this registry
 * replaced — see omods.ts's history) fails a test instead of silently
 * shipping. Add a bucket here whenever one is added to the union.
 */
const ALL_BUCKETS: Bucket[] = [
  'baseDamage',
  'dbm',
  'critDmgBase',
  'critDmgBonus',
  'critDmgBonusScale',
  'sneakBase',
  'sneakBonus',
  'powerAttackBonus',
  'weakpointBonus',
  'wholeDamage',
  'limbDamage',
  'bashDamage',
  'explosivePayload',
  'critFill',
  'critConsumption',
  'fireRateSpeed',
  'isAutomatic',
  'animDurationSec',
  'animDelaySec',
  'projectileCount',
  'ammoCapacity',
  'reloadSpeed',
  'reloadSkipChance',
  'reloadSkipChanceBash',
  'ammoFreeChance',
  'vatsApCost',
  'chargeFullPowerSec',
  'chargeFullPowerDamageMult',
  'weaponMinRange',
  'weaponMaxRange',
  'weaponOutOfRangeMult',
  'apRegen',
  'apRegenFlat',
  'apMax',
  'apCritHot',
  'apPerCrit',
  'onslaughtMaxStacks',
  'onslaughtReverse',
  'bulletStormMaxStacks',
  'bulletStormMinStacks',
  'bulletStormRetention',
  'bulletStormOnKill',
  'bulletStormSpinUp',
  'deflectChance',
  'moveSpeedBonus',
  'addDamageComponent',
  'armorPen',
  'armorPenFlat',
  'vatsHitChance',
  'vatsHitChanceMult',
  'dotDamage',
  'maxHealth',
  'specialStrength',
  'specialPerception',
  'specialEndurance',
  'specialCharisma',
  'specialIntelligence',
  'specialAgility',
  'specialLuck',
  'damageResistGain',
  'energyResistGain',
];

describe('BUCKET_REGISTRY', () => {
  it('has exactly one entry per Bucket — no missing, no stale keys', () => {
    expect(Object.keys(BUCKET_REGISTRY).sort()).toEqual([...ALL_BUCKETS].sort());
  });

  it('records only the two non-default bootstrap fold conventions', () => {
    const entriesWithConventions = Object.entries(BUCKET_REGISTRY)
      .filter(([, entry]) => entry.foldBase !== undefined || entry.deBased !== undefined)
      .map(([bucket, entry]) => [bucket, { foldBase: entry.foldBase, deBased: entry.deBased }]);

    expect(entriesWithConventions).toEqual([
      ['vatsHitChance', { foldBase: 1, deBased: true }],
      ['vatsHitChanceMult', { foldBase: 1, deBased: false }],
    ]);
  });

  it('derives WEAPON_STAT_BUCKETS as exactly the weaponStat-regime buckets', () => {
    expect([...WEAPON_STAT_BUCKETS].sort()).toEqual(
      [
        'fireRateSpeed', 'isAutomatic', 'animDurationSec', 'animDelaySec', 'projectileCount', 'ammoCapacity', 'reloadSpeed',
        'vatsApCost', 'chargeFullPowerSec', 'chargeFullPowerDamageMult',
        'weaponMinRange', 'weaponMaxRange', 'weaponOutOfRangeMult',
      ].sort()
    );
  });

  it('derives SUSTAIN_CHANCE_BUCKETS as exactly the sustainChance-regime buckets', () => {
    expect([...SUSTAIN_CHANCE_BUCKETS].sort()).toEqual(['reloadSkipChance', 'reloadSkipChanceBash', 'ammoFreeChance'].sort());
  });

  it('derives INERT_ENGINE_BUCKETS as exactly the no-engine-effect buckets', () => {
    // Every specialX bucket (playerStat regime) has a real downstream effect:
    // Endurance/Charisma/Intelligence/Agility feed max HP, a curve input, or
    // the VATS AP pool; Perception has no paper-damage consumer but its
    // folded value is what StatSummary renders. limbDamage/bashDamage/
    // addDamageComponent have no fold consumer at all.
    // weaponMinRange/weaponMaxRange/weaponOutOfRangeMult are no longer inert
    // (Phase 1 engine half — effective-weapon.ts folds them, scenarios.ts
    // threads rangeFalloffMult into paper-damage.ts). armorPen/armorPenFlat
    // are no longer inert either (Phase 2 — mitigation.ts consumes both).
    // damageResistGain/energyResistGain (2026-07-21, Scaly Skin's positive
    // side): wearer-side resist mitigation isn't modeled — same inert status
    // as limbDamage/bashDamage.
    expect([...INERT_ENGINE_BUCKETS].sort()).toEqual(
      [
        'limbDamage', 'bashDamage', 'addDamageComponent',
        'bulletStormOnKill', 'bulletStormSpinUp', 'deflectChance',
        'damageResistGain', 'energyResistGain',
      ].sort()
    );
  });
});

const SOURCE = { kind: 'omod', formId: '0x0', edid: 'test', name: 'Test' } as const;

/** Minimal plain-value Modifier fixture — only the fields modifierHasEngineEffect reads. */
function plainMod(bucket: Bucket, conditions: Modifier['conditions'] = []): Modifier {
  return { id: 'test', source: SOURCE, bucket, op: 'ADD', value: 1, conditions };
}

/** Minimal curve-driven Modifier fixture, for the playerDamageResist-input case. */
function curveMod(bucket: Bucket, input: Modifier['curve'] extends undefined ? never : NonNullable<Modifier['curve']>['input']): Modifier {
  return {
    id: 'test',
    source: SOURCE,
    bucket,
    op: 'ADD',
    conditions: [],
    curve: { input, points: [{ x: 0, y: 0 }] },
    curveScale: 1,
  };
}

describe('modifierHasEngineEffect / hasAnyEngineEffect', () => {
  it('is false for a bucket the engine never folds (INERT_ENGINE_BUCKETS)', () => {
    expect(modifierHasEngineEffect(plainMod('limbDamage'))).toBe(false);
  });

  it('is true for armorPen/armorPenFlat now that mitigation.ts folds them (Phase 2)', () => {
    expect(modifierHasEngineEffect(plainMod('armorPen'))).toBe(true);
    expect(modifierHasEngineEffect(plainMod('armorPenFlat'))).toBe(true);
  });

  it('is true for a playerDamageResist-scaled curve (Berserker\'s wielder-DR wiring, renamed from enemyDamageResist)', () => {
    expect(modifierHasEngineEffect(curveMod('dbm', 'playerDamageResist'))).toBe(true);
  });

  it('is true for vatsHitChance — display regime still counts as "moves a number" (Phase 4, V.A.T.S. Enhanced &c.)', () => {
    expect(modifierHasEngineEffect(plainMod('vatsHitChance'))).toBe(true);
  });

  it('is true for vatsHitChanceMult — display regime, Concentrated Fire\'s EP109 multiplier (USER-RESOLVED 2026-07-19)', () => {
    expect(modifierHasEngineEffect(plainMod('vatsHitChanceMult'))).toBe(true);
  });

  it('is false when the modifier carries an unresolved condition', () => {
    expect(modifierHasEngineEffect(plainMod('dbm', [{ kind: 'unresolved', raw: 'GetRandomPercent()=20' }]))).toBe(false);
  });

  it('is true for an ordinary effective bucket with no gating issues', () => {
    expect(modifierHasEngineEffect(plainMod('dbm'))).toBe(true);
  });

  it('hasAnyEngineEffect is false for an empty list and true if any modifier is effective', () => {
    expect(hasAnyEngineEffect([])).toBe(false);
    expect(hasAnyEngineEffect([plainMod('limbDamage'), plainMod('dbm')])).toBe(true);
  });
});
