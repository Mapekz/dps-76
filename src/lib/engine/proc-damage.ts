import { interpolateCurve } from '@/lib/curve-tables';
import type { DamageType } from '@/types/modifiers';
import type { ProcSource, ProcTrigger } from '@/types/procs';
import { conditionsActive, type ResolveContext } from './resolve';
import type { SustainTiming } from './sustain';

/**
 * Steady-state proc-triggered damage add (issue #42, PROC_DAMAGE_PLAN.md
 * commit 7) — a parallel stream to `computeDotDps`'s dotDps, NOT folded into
 * `sustainedDps` (see ADR-0020). Procs bypass dbm/crit/sneak entirely: each
 * is a separately-cast SPEL (Electrician's reload-cycle explosion, Circuit
 * Breaker's last-round discharge, Fracturer's on-cripple detonation), not a
 * per-hit component of the weapon's own paper-damage formula. See
 * docs/assumptions.md "Proc-triggered damage" for the unproven parts (cadence
 * model, AoE folding, what's deliberately unmapped).
 *
 * Cadence per trigger kind:
 * - `reloadCycle` / `lastRound`: fires once per magazine cycle —
 *   `1/(magDumpSec+reloadSec)`, 0 when the denominator is 0 (melee/no
 *   magazine — nothing to cycle).
 * - `onCripple`: an exogenous rate knob (ADR-0009, no crippling-frequency
 *   model exists) — `cripplesPerMin` is a manual UI input
 *   (`PlayerInput.procCripplesPerMin`), capped by the granting SPEL's own
 *   cooldown: `min(cripplesPerMin/60, 1/cooldownSec)`.
 */
export function computeProcDps(
  procs: readonly ProcSource[],
  itemLevel: number,
  ctx: ResolveContext,
  sustain: Pick<SustainTiming, 'magDumpSec' | 'reloadSec'>,
  cripplesPerMin: number,
): number {
  return collectProcStreams(procs, itemLevel, ctx, sustain, cripplesPerMin).reduce(
    (sum, s) => sum + s.damagePerCast * s.cadencePerSec,
    0,
  );
}

/** One proc-component cast, still at per-cast magnitude (the analog of a per-hit component). */
export interface ProcStream {
  damagePerCast: number;
  cadencePerSec: number;
  damageType: DamageType;
  unresisted?: true;
}

/**
 * Per-component proc streams for resist mitigation. Each component is
 * mitigated at its per-cast magnitude (the analog of a per-hit component)
 * then × cadence, matching how `applyMitigation` runs on a hit then
 * `effective.sustainedDps` scales by the retained fraction. `unresisted`
 * is provenance for the bypass in `mitigateDamageAmount`.
 */
export function collectProcStreams(
  procs: readonly ProcSource[],
  itemLevel: number,
  ctx: ResolveContext,
  sustain: Pick<SustainTiming, 'magDumpSec' | 'reloadSec'>,
  cripplesPerMin: number,
): ProcStream[] {
  // Same [1,50] clamp componentBase (paper-damage.ts) applies before
  // interpolating a weapon component's own curve.
  const clampedLevel = Math.max(1, Math.min(itemLevel, 50));
  const streams: ProcStream[] = [];
  for (const proc of procs) {
    if (!conditionsActive(proc.conditions, ctx)) continue;

    const cadence = procCadencePerSec(proc.trigger, sustain, cripplesPerMin);
    if (cadence <= 0) continue;

    for (const c of proc.components) {
      const damagePerCast = c.curve
        ? interpolateCurve(c.curve.points, clampedLevel)
        : (c.value ?? 0);
      if (damagePerCast === 0) continue;
      streams.push({
        damagePerCast,
        cadencePerSec: cadence,
        damageType: c.damageType,
        ...(c.unresisted ? { unresisted: true as const } : {}),
      });
    }
  }
  return streams;
}

function procCadencePerSec(
  trigger: ProcTrigger,
  sustain: Pick<SustainTiming, 'magDumpSec' | 'reloadSec'>,
  cripplesPerMin: number,
): number {
  switch (trigger.kind) {
    case 'reloadCycle':
    case 'lastRound': {
      const cycleSec = sustain.magDumpSec + sustain.reloadSec;
      return cycleSec > 0 ? 1 / cycleSec : 0;
    }
    case 'onCripple':
      return trigger.cooldownSec > 0 ? Math.min(cripplesPerMin / 60, 1 / trigger.cooldownSec) : 0;
  }
}
