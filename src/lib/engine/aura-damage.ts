import { interpolateCurve } from '@/lib/curve-tables';
import type { DamageType } from '@/types/modifiers';
import { auraHasEngineEffect, type AuraSource } from '@/types/auras';
import { conditionsActive, type ResolveContext } from './resolve';

/**
 * Steady-state aura damage add (ADR-0023) — a parallel stream to
 * `computeProcDps`/`computeDotDps`, NOT folded into `sustainedDps`.
 * Continuous tick-based auras (PA Tesla Coils, Miasma, Plague Walker)
 * bypass dbm/crit/sneak entirely. In-combat gates are extracted but the
 * engine assumes sustained combat (docs/assumptions.md "Aura damage streams").
 *
 * DPS per source = magnitudePerTick / tickSec (curve-resolved at itemLevel).
 * `magnitudePending` sources contribute 0 DPS but remain in the stream list
 * for display with an unmeasured badge. Sources with unresolved gate
 * conditions stay in the stream list as inert (0 DPS) — same convention as
 * `modifierHasEngineEffect` on modifiers.
 */
export function computeAuraDps(
  auras: readonly AuraSource[],
  itemLevel: number,
  ctx: ResolveContext,
): number {
  return collectAuraStreams(auras, itemLevel, ctx).reduce((sum, s) => sum + s.dps, 0);
}

export interface AuraStream {
  dps: number;
  damageType: DamageType;
  unresisted?: true;
  magnitudePending?: true;
  /** Present-but-inert: unresolved gate conditions block folding today. */
  inert?: true;
  sourceId: string;
}

export function collectAuraStreams(
  auras: readonly AuraSource[],
  itemLevel: number,
  ctx: ResolveContext,
): AuraStream[] {
  const clampedLevel = Math.max(1, Math.min(itemLevel, 50));
  const streams: AuraStream[] = [];
  for (const aura of auras) {
    const shared = {
      damageType: aura.damageType,
      sourceId: aura.id,
      ...(aura.unresisted ? { unresisted: true as const } : {}),
    };
    if (aura.magnitudePending) {
      streams.push({
        dps: 0,
        magnitudePending: true,
        ...shared,
      });
      continue;
    }
    if (!auraHasEngineEffect(aura)) {
      streams.push({ dps: 0, inert: true, ...shared });
      continue;
    }
    if (!conditionsActive(aura.conditions, ctx)) continue;
    const tickSec = aura.tickSec;
    if (tickSec <= 0) continue;
    let magnitude: number;
    if (aura.curve) {
      magnitude = interpolateCurve(aura.curve.points, clampedLevel) * (aura.curveScale ?? 1);
    } else {
      magnitude = aura.magnitudePerTick ?? 0;
    }
    if (magnitude === 0) continue;
    streams.push({
      dps: magnitude / tickSec,
      ...shared,
    });
  }
  return streams;
}

/** True when any equipped aura has a pending (unmeasured) magnitude. */
export function hasPendingAuras(auras: readonly AuraSource[]): boolean {
  return auras.some((a) => a.magnitudePending);
}
