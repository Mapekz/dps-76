import type { Condition, DamageType, ModifierSource, ValueCurve } from '@/types/modifiers';

/**
 * Procs are a parallel damage stream, not a `Bucket` (see ADR-0020 for why):
 * separately-cast SPELs (Electrician's reload-cycle explosion, Circuit
 * Breaker's last-round discharge, Fracturer's on-cripple detonation) with
 * their own damage components and cadence model, no dbm/crit/sneak
 * interaction. Exactly parallel to `Weapon`'s existing DoT handling
 * (`ScenarioResult.dotDps`) — see `ScenarioResult.procDps`.
 */
export type ProcTrigger =
  /** Electrician's — one cast per reload-animation-state cycle (ENCH GetActorGunState fan-out). */
  | { kind: 'reloadCycle' }
  /** Circuit Breaker — deterministic, once per magazine (GetLoadedAmmoCount < 1, the same shape as the `lastRound` Condition). */
  | { kind: 'lastRound' }
  /** Fracturer's — Entry Point 201 "Apply Spell On Actor When Limb Crippled"; cadence is an exogenous rate knob (ADR-0009), cooldown-capped. */
  | { kind: 'onCripple'; cooldownSec: number };

export interface ProcComponent {
  damageType: DamageType;
  /** itemLevel-keyed, mirrors WeaponComponent's curvePoints shape but carries its own axis tag. */
  curve?: ValueCurve;
  /** Flat fallback when no curve exists. */
  value?: number;
  /** Display/assumptions only — folded as a flat single-target add, not a real AoE model. */
  isAoe?: boolean;
}

export interface ProcSource {
  /** `${formid}:proc:${n}` — stable id, mirrors Modifier.id's multi-effect-source convention. */
  id: string;
  source: ModifierSource;
  trigger: ProcTrigger;
  components: ProcComponent[];
  /** Gate checks only — NOT folded via foldOps like a Modifier's conditions. */
  conditions: Condition[];
}
