import type { GeneratedBuff } from '@/types/generated';
import type { Modifier } from '@/types/modifiers';

/**
 * Class Freak's mutation-penalty reduction (docs/assumptions.md "Mutation
 * penalties & Class Freak").
 *
 * ESM-proven mechanic, same shape as Carnivore's/Herbivore's food scaling
 * (src/lib/diet-mutations.ts): each Class Freak rank's own PERK record
 * (ClassFreak01/02/03 — 0x00391F0E/0x00391F11/0x00391F12) carries one
 * "Mod Spell Magnitude" entry point (function Multiply Value, Float
 * 0.75/0.5/0.25) gated on EPAlchemyEffectHasKeyword(
 * AbilityTypeMutation_NegativeEffect 0x00391F0F) — "the negative effects of
 * your mutations are reduced by 25%" per rank. Each rank additionally gates
 * HasPerk(next rank)=0, so exactly one factor applies at a time.
 *
 * Effect-level gate: only modifiers whose source MGEF carries that keyword
 * (plus the Detrimental flag) scale — captured at extraction as
 * `GeneratedBuff.penaltyModifierIds` (extract-buffs.ts, mirrors
 * `foodScalableModifierIds`).
 *
 * NOT covered here: penalties baked as per-tier HasPerk(ClassFreak0N) rows on
 * granted PERKs (Grounded's energy-damage tiers) — those extract directly as
 * `classFreakRank`-conditioned modifiers and need no app-side expansion.
 */

/** Penalty magnitude factor by Class Freak rank (index = rank 0–3). */
export const CLASS_FREAK_TIER_FACTORS = [1, 0.75, 0.5, 0.25] as const;

/** Scale one modifier's magnitude (plain value or curveScale) by `factor`. */
function scaled(m: Modifier, factor: number, idSuffix: string): Modifier {
  if (m.curve) return { ...m, id: `${m.id}${idSuffix}`, curveScale: m.curveScale * factor };
  return { ...m, id: `${m.id}${idSuffix}`, value: m.value * factor };
}

/**
 * A mutation's engine modifiers with Class Freak scaling applied: each
 * penalty-tagged modifier expands into 4 rank-conditioned variants (the
 * engine picks one via the `classFreakRank` condition, exactly like the
 * strangeInNumbers variants mutations already carry). Non-penalty modifiers
 * (and non-mutation buffs) pass through untouched.
 */
export function applyClassFreakPenaltyScaling(buff: GeneratedBuff): Modifier[] {
  if (!buff.penaltyModifierIds?.length) return buff.modifiers;

  const penalties = new Set(buff.penaltyModifierIds);
  return buff.modifiers.flatMap((m) => {
    if (!penalties.has(m.id)) return [m];
    return CLASS_FREAK_TIER_FACTORS.map((factor, rank) => ({
      ...scaled(m, factor, `:cf${rank}`),
      conditions: [...m.conditions, { kind: 'classFreakRank' as const, min: rank, max: rank }],
    }));
  });
}
