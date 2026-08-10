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
  /** Launcher EXPL payload or Explosive-legendary twin — exempt from sneak/body-part mults. */
  isExplosion: boolean;
}

/** Full derivation of one paper-damage hit. Null sections did not apply. */
export interface HitTrace {
  components: ComponentTrace[];
  /** STR melee term added inside the dbm parenthesis (0 for guns). */
  strTerm: number;
  crit: { base: BucketTrace; bonus: BucketTrace; bonusScale: BucketTrace } | null;
  sneak: { base: BucketTrace; bonus: BucketTrace } | null;
  powerAttack: BucketTrace | null;
  /** Each active whole-damage ×(1 + value) factor (TOFTT, Follow Through). */
  wholeDamage: TraceContribution[];
  /** Weakpoint bonus fold — only when the hit lands on a weakpoint. */
  weakpointBonus: BucketTrace | null;
  bodyPartMult: number;
  /** Charging-weapon damage ramp (src/lib/charge.ts) — null for weapons that don't charge. */
  charge: {
    chargeTimeSec: number;
    fullPowerSeconds: number;
    fullPowerDamageMult: number;
    mult: number;
  } | null;
}

export interface CritMeterTrace {
  fill: BucketTrace | null;
  consumption: BucketTrace | null;
}

/** Passive AP regen derivation (VATS only) — race base × flat/percent bonus contributions. */
export interface ApRegenTrace {
  agility: number;
  isInPowerArmor: boolean;
  /** GMST fAVDActionPointsBase — flat AP pool floor (resolved, mode-aware). */
  poolBase: number;
  /** GMST fAVDActionPointsMult — AP pool gained per point of AGI (resolved, mode-aware). */
  poolPerAgility: number;
  /** RACE Properties base of AV ActionPointsRate (% of max AP/sec) — human 6.0, PA 3.0. */
  raceBasePct: number;
  /** `apRegenFlat` contributions (ADD, AV points — Company Tea's +10). */
  flat: BucketTrace;
  /** `apRegen` contributions (MUL_ADD, decimal — Action Boy/Girl, hydration, Lone Wanderer). */
  percent: BucketTrace;
  /** `apMax` contributions (ADD, flat AP points — food fortifies, Scaly Skin's penalty). */
  maxAp: BucketTrace;
  /**
   * Reload-window regen credit (plain formula numbers, not a bucket fold):
   * passive regen ticks during the reload after `regenDelaySec`
   * (AP_REGEN_DELAY_SEC — GMST fDamagedAPRegenDelay), cycle-averaged into
   * apGainPerSec as `reloadRegenPerSec`. All 0 on no-magazine weapons.
   */
  reloadSec: number;
  magDumpSec: number;
  regenDelaySec: number;
  reloadRegenPerSec: number;
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
    charge: null,
  };
}

/** Pop the trace a fold just pushed onto a collect sink. */
export function lastTrace(collect: BucketTrace[]): BucketTrace {
  const t = collect[collect.length - 1];
  if (!t) throw new Error('lastTrace: no trace was collected');
  return t;
}

/** Like `lastTrace`, but also asserts the sink itself was collected (tracing was on). */
export function requireTrace(collect: BucketTrace[] | undefined): BucketTrace {
  if (!collect) throw new Error('requireTrace: tracing was not enabled');
  return lastTrace(collect);
}
