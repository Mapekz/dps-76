import type { Modifier } from '@/types/modifiers';

/**
 * Baseline player-state modifiers granted by hidden survival abilities — not
 * perks, consumables, or gear, so no extraction pipeline carries them.
 *
 * Hydration AP regen (2026-07-15 esm-walk): SPEL SURV_Thirst_Ability
 * 0x00054DF3 grants MGEF SURV_ThirstWellHydrated_FortifyActionPointRegen
 * (Peak Value Modifier on AV ActionPointsRateMult) at +35% while fully
 * hydrated (SURV_Thirst < WellHydrated threshold 720) with NO perk required,
 * non-ghoul only (GetIsPlayerGhoul()=0 on every row). Rejuvenated raises the
 * tier to 45/60% — modeled as +10/+25 deltas in
 * overrides/perk-overrides.ts on top of this baseline. Lower hydration
 * tiers (25/15/15%) are not modeled: the `hydrated` toggle is
 * all-or-nothing (docs/assumptions.md "Hydration AP regen").
 *
 * Emitted unconditionally here; the `hydrated` / `playerIsGhoul` conditions
 * gate it in resolve.ts against the player-state inputs.
 */
export function getPlayerBaselineModifiers(): Modifier[] {
  return [
    {
      id: 'baseline:hydration-ap-regen',
      source: {
        kind: 'perk',
        formId: '0x00054DF3',
        edid: 'SURV_Thirst_Ability',
        name: 'Fully Hydrated',
      },
      bucket: 'apRegen',
      op: 'ADD',
      value: 0.35,
      conditions: [
        { kind: 'hydrated', value: true },
        { kind: 'playerIsGhoul', value: false },
      ],
    },
  ];
}
