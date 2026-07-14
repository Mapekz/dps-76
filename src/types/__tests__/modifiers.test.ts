import { describe, it, expect } from 'vitest';
import { BUCKET_REGISTRY, WEAPON_STAT_BUCKETS, INERT_ENGINE_BUCKETS, type Bucket } from '@/types/modifiers';

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
  'projectileCount',
  'ammoCapacity',
  'reloadSpeed',
  'vatsApCost',
  'apRegen',
  'apPerCrit',
  'onslaughtMaxStacks',
  'addDamageComponent',
  'armorPen',
  'dotDamage',
  'maxHealth',
  'specialStrength',
  'specialPerception',
  'specialEndurance',
  'specialCharisma',
  'specialIntelligence',
  'specialAgility',
  'specialLuck',
];

describe('BUCKET_REGISTRY', () => {
  it('has exactly one entry per Bucket — no missing, no stale keys', () => {
    expect(Object.keys(BUCKET_REGISTRY).sort()).toEqual([...ALL_BUCKETS].sort());
  });

  it('derives WEAPON_STAT_BUCKETS as exactly the weaponStat-regime buckets', () => {
    expect([...WEAPON_STAT_BUCKETS].sort()).toEqual(
      ['fireRateSpeed', 'isAutomatic', 'animDurationSec', 'projectileCount', 'ammoCapacity', 'reloadSpeed', 'vatsApCost'].sort()
    );
  });

  it('derives INERT_ENGINE_BUCKETS as exactly the no-engine-effect buckets', () => {
    // Every specialX bucket (playerStat regime) has a real downstream effect:
    // Endurance/Charisma/Intelligence/Agility feed max HP, a curve input, or
    // the VATS AP pool; Perception has no paper-damage consumer but its
    // folded value is what StatSummary renders. limbDamage/bashDamage/
    // addDamageComponent/armorPen have no fold consumer at all.
    expect([...INERT_ENGINE_BUCKETS].sort()).toEqual(
      ['limbDamage', 'bashDamage', 'addDamageComponent', 'armorPen'].sort()
    );
  });
});
