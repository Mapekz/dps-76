import type { Condition, DamageType, ModifierSource, ValueCurve } from '@/types/modifiers';

/**
 * Continuous damage auras are a parallel stream, not a `Bucket` (see ADR-0023
 * for why): PA Tesla Coils, Miasma, and Plague Walker each tick on their own
 * cadence, bypass dbm/crit/sneak, and are NOT folded into per-shot or
 * sustained weapon DPS — exactly parallel to `ProcSource`/`procDps` and
 * `dotDps` (ADR-0020).
 */
export interface AuraSource {
  /** `${formid}:aura:${n}` — stable id, mirrors Modifier.id's convention. */
  id: string;
  source: ModifierSource;
  damageType: DamageType;
  /**
   * Per-tick magnitude before resist mitigation. Absent when
   * `magnitudePending` — script-set at runtime (Miasma) with no ESM number.
   */
  magnitudePerTick?: number;
  curve?: ValueCurve;
  /** Multiplies curve-interpolated Y (Tesla Coils' flat ×5 curve table). */
  curveScale?: number;
  /** Script-set magnitude — surface the source with an unmeasured badge, no DPS. */
  magnitudePending?: true;
  /** Seconds between ticks (ESM Effect Item Data Duration). */
  tickSec: number;
  /** ENCH/SPEL effect Area when present — display/assumptions only. */
  area?: number;
  /** Gate checks only — NOT folded via foldOps like a Modifier's conditions. */
  conditions: Condition[];
  /** See `Modifier.unresisted` / proc-component twin. */
  unresisted?: true;
}

/** True when an aura has a resolved magnitude shape the engine can fold (mirrors `modifierHasEngineEffect`). */
export function auraHasEngineEffect(aura: AuraSource): boolean {
  if (aura.magnitudePending) return true;
  return !aura.conditions.some((c) => c.kind === 'unresolved');
}
