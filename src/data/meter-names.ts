/** In-game meter state names — SURV_NewHungerThreshold_Msg_* / SURV_NewThirstThreshold_Msg_* (tier 4 = fullest). */
export const FOOD_TIER_NAMES = ['Hungry', 'Partially Fed', 'Fed', 'Well Fed', 'Fully Fed'] as const;
export const DRINK_TIER_NAMES = [
  'Thirsty',
  'Partially Hydrated',
  'Hydrated',
  'Well Hydrated',
  'Fully Hydrated',
] as const;

/**
 * GHL_SURV_FeralThreshold_Msg_* names banded over the 0–8 GHL_FeralTier AV
 * (5 states over 9 tiers — the exact cutoffs are an inference, tier 8 =
 * "Wonderful" is proven; docs/assumptions.md "Feral meter").
 */
export function feralStateName(tier: number): string {
  if (tier >= 8) return 'Wonderful';
  if (tier >= 6) return 'Normal';
  if (tier >= 4) return 'Odd';
  if (tier >= 2) return 'Losing it';
  return 'Feral';
}
