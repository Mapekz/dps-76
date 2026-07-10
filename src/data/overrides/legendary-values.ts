import type { Modifier, ModifierFragment } from '@/types/modifiers';

/**
 * Hand-authored modifiers for legendary weapon effects whose ESM magnitudes
 * are script-computed (Magnitude 0.0, Script archetype) and therefore not
 * extractable. Keyed by OMOD edid; when present, these REPLACE the extracted
 * modifiers for that omod.
 *
 * Values are community/wiki numbers pending in-game golden validation
 * (docs/assumptions.md). Sources: fallout.wiki legendary effect pages, 2026.
 */

function leg(edid: string, name: string, rest: ModifierFragment, index = 0): Modifier {
  return {
    id: `override:${edid}:${index}`,
    source: { kind: 'legendaryEffect', formId: edid, edid, name },
    ...rest,
  };
}

// NOTE: Bloodied, Junkie's, and Aristocrat's are NOT overridden — their real
// value curves extract from the ENCH effects (Curve Table + input Actor
// Value), e.g. Bloodied is (5% HP → +130) … (100% HP → 0).

export const legendaryValueOverrides: Readonly<Record<string, Modifier[]>> = {
  // Furious: Script-archetype ENCH (no curve) — +5% per consecutive hit on
  // the same target, max 9 stacks (+45%). Wiki 2026, pending golden.
  mod_Legendary_Weapon1_DmgConsecutiveHits: [
    leg('mod_Legendary_Weapon1_DmgConsecutiveHits', 'Furious', {
      bucket: 'dbm', op: 'ADD', value: 0.05,
      conditions: [{ kind: 'stacks', counter: 'furious', max: 9 }],
    }),
  ],
  // Instigating: +100% against full-health targets.
  mod_Legendary_Weapon1_DamageFirstBlood: [
    leg('mod_Legendary_Weapon1_DamageFirstBlood', 'Instigating', {
      bucket: 'dbm', op: 'ADD', value: 1.0,
      conditions: [{ kind: 'enemyFullHealth' }],
    }),
  ],
  // Two Shot: extra projectile dealing 25% of base damage — approximated as
  // a flat +25% dbm (projectile-level modeling is a later enhancement).
  mod_Legendary_Weapon1_Guns_TwoShot: [
    leg('mod_Legendary_Weapon1_Guns_TwoShot', 'Two Shot', {
      bucket: 'dbm', op: 'ADD', value: 0.25, conditions: [],
    }),
  ],
};
