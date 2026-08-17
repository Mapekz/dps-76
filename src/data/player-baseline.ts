import type { Condition, Modifier } from '@/types/modifiers';
import { DRINK_TIER_NAMES, FOOD_TIER_NAMES } from '@/data/meter-names';

/**
 * Baseline player-state modifiers granted by hidden survival abilities — not
 * perks, consumables, or gear, so no extraction pipeline carries them.
 *
 * Both ladders below were graduated, ESM-proven fixtures all along — the
 * 2026-07-15 hydration modeling treated it as an all-or-nothing toggle only
 * because the meter-tier breakdown hadn't been walked yet. Superseded
 * 2026-08-17: `PlayerInput.drinkTier`/`foodTier` (the Drink/Food meter
 * sliders — DRINK_TIER_NAMES/FOOD_TIER_NAMES) are each ladder's ONLY input,
 * no separate toggle. A future tiered bonus (a Rejuvenator's-style armor mod,
 * an Overeater's-style mod) is a new `tierLadderModifiers` call here or a new
 * modifier row elsewhere gated on the same `drinkTierExact`/`foodTierExact`
 * conditions — no bucket or system changes needed.
 *
 * Hydration AP regen: SPEL SURV_Thirst_Ability 0x00054DF3 grants MGEF
 * 0x003E98F1 SURV_ThirstWellHydrated_FortifyActionPointRegen (Peak Value
 * Modifier on AV ActionPointsRateMult) over 5 SURV_Thirst bands, NO perk
 * required, non-ghoul only (GetIsPlayerGhoul()=0 on every row):
 *   Thirst <  720 (tier 4, Fully Hydrated):    +35%
 *   Thirst  720–1439 (tier 3, Well Hydrated):  +25%
 *   Thirst 1440–2159 (tier 2, Hydrated):       +15%
 *   Thirst 2160–2879 (tier 1, Partially Hyd.): +15%
 *   Thirst ≥ 2880 (tier 0, Thirsty):            0% (no effect row)
 * Rejuvenated raises ONLY the top tier to 45/60% (its HasPerk conditions
 * appear solely on the tier-4 effect rows in the ESM) — modeled as +10/+25
 * deltas in overrides/perk-overrides.ts on top of this baseline's tier-4 row.
 *
 * Satiation max HP: SPEL SURV_Hunger_Ability 0x00026841 grants MGEF
 * 0x0004A0D2 AbFortifyHealth (Peak Value Modifier on AV Health) over 5
 * SURV_Hunger bands, same NO-perk/non-ghoul shape — the Hunger-side twin:
 *   Hunger <  1440 (tier 4, Fully Fed):        +35 HP
 *   Hunger  1440–2879 (tier 3, Well Fed):      +25 HP
 *   Hunger 2880–4319 (tier 2, Fed):            +15 HP
 *   Hunger 4320–5759 (tier 1, Partially Fed):  +15 HP
 *   Hunger ≥ 5760 (tier 0, Hungry):             0 HP (no effect row)
 * Rejuvenated raises the top tier to +45/+60 HP the same way — same +10/+25
 * deltas, gated on `foodTierExact: 4` in perk-overrides.ts.
 *
 * Both abilities also carry an AbFortifyStrength/AbFortifyEndurance SPECIAL
 * bonus and a disease-resistance bonus on the same tier bands
 * (SURV_FortifyDiseaseResistance_HungerThirst_Effect) — out of scope, same
 * as every other stat this app doesn't feed into a damage term.
 *
 * Emitted unconditionally here; `drinkTierExact`/`foodTierExact` and
 * `playerIsGhoul` gate each row in resolve.ts against the player-state
 * inputs.
 */
function tierLadderModifiers(spec: {
  idPrefix: string;
  bucket: Modifier['bucket'];
  formId: string;
  edid: string;
  tierNames: readonly string[];
  tierCondition: (tier: number) => Condition;
  /** Non-zero tiers only — the zero tier (Thirsty/Hungry) has no ESM effect row, so no modifier. */
  magnitudes: Record<number, number>;
}): Modifier[] {
  return Object.entries(spec.magnitudes).map(([tier, value]) => ({
    id: `${spec.idPrefix}:tier${tier}`,
    source: {
      kind: 'perk',
      formId: spec.formId,
      edid: spec.edid,
      name: spec.tierNames[Number(tier)],
    },
    bucket: spec.bucket,
    op: 'ADD',
    value,
    conditions: [spec.tierCondition(Number(tier)), { kind: 'playerIsGhoul', value: false }],
  }));
}

export function getPlayerBaselineModifiers(): Modifier[] {
  return [
    ...tierLadderModifiers({
      idPrefix: 'baseline:hydration-ap-regen',
      bucket: 'apRegen',
      formId: '0x00054DF3',
      edid: 'SURV_Thirst_Ability',
      tierNames: DRINK_TIER_NAMES,
      tierCondition: (tier) => ({ kind: 'drinkTierExact', tier }),
      magnitudes: { 1: 0.15, 2: 0.15, 3: 0.25, 4: 0.35 },
    }),
    ...tierLadderModifiers({
      idPrefix: 'baseline:satiation-max-health',
      bucket: 'maxHealth',
      formId: '0x00026841',
      edid: 'SURV_Hunger_Ability',
      tierNames: FOOD_TIER_NAMES,
      tierCondition: (tier) => ({ kind: 'foodTierExact', tier }),
      magnitudes: { 1: 15, 2: 15, 3: 25, 4: 35 },
    }),
  ];
}
