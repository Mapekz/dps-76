import type { Bucket, DamageType, ModOp, ModifierSource } from '@/types/modifiers';

/**
 * Attribution trace — the "why is this number what it is" data behind a hit.
 *
 * Tracing is strictly opt-in: every fold takes an optional collect sink, and
 * when it is absent the hot path does no extra work (the suggestion engine
 * calls computeScenarios hundreds of times per config change and never
 * traces). When tracing is on, the traced computation IS the displayed
 * number — the engine never computes a separate "explained" variant that
 * could drift from the real one.
 */

/** One modifier's contribution to a bucket fold, tagged with its source. */
export interface TraceContribution {
  source: ModifierSource;
  op: ModOp;
  /** Condition-scaled effective value that entered the fold. */
  value: number;
}

/** One foldBucket call: base → SET/MUL_ADD/ADD contributions → result. */
export interface BucketTrace {
  bucket: Bucket;
  base: number;
  result: number;
  /** Winning SET (last one), or null if no SET applied. */
  set: TraceContribution | null;
  /** SETs that lost to a later SET — surfaced so the UI can flag conflicts. */
  overriddenSets: TraceContribution[];
  mulAdd: TraceContribution[];
  add: TraceContribution[];
}

/** Per damage component: the baseDamage scaling fold and the dbm fold. */
export interface ComponentTrace {
  damageType: DamageType;
  baseDamage: BucketTrace;
  dbm: BucketTrace;
}

/** Full derivation of one paper-damage hit. Null sections did not apply. */
export interface HitTrace {
  components: ComponentTrace[];
  /** STR melee term added inside the dbm parenthesis (0 for guns). */
  strTerm: number;
  crit: { base: BucketTrace; bonus: BucketTrace } | null;
  sneak: { base: BucketTrace; bonus: BucketTrace } | null;
  powerAttack: BucketTrace | null;
  /** Each active whole-damage ×(1 + value) factor (TOFTT, Follow Through). */
  wholeDamage: TraceContribution[];
  /** Weakpoint bonus fold — only when the hit lands on a weakpoint. */
  weakpointBonus: BucketTrace | null;
  bodyPartMult: number;
}

export interface CritMeterTrace {
  fill: BucketTrace | null;
  consumption: BucketTrace | null;
}

export function createHitTrace(): HitTrace {
  return {
    components: [],
    strTerm: 0,
    crit: null,
    sneak: null,
    powerAttack: null,
    wholeDamage: [],
    weakpointBonus: null,
    bodyPartMult: 1,
  };
}

/** Pop the trace a fold just pushed onto a collect sink. */
export function lastTrace(collect: BucketTrace[]): BucketTrace {
  const t = collect[collect.length - 1];
  if (!t) throw new Error('lastTrace: no trace was collected');
  return t;
}
