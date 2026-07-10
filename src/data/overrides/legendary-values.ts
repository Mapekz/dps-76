import type { Modifier, ModifierFragment } from '@/types/modifiers';

/**
 * Hand-authored modifiers for legendary weapon effects whose ESM magnitudes
 * are script-computed (Magnitude 0.0, Script archetype) and therefore not
 * extractable. Keyed by OMOD edid; when present, these REPLACE the extracted
 * modifiers for that omod.
 *
 * Policy (2026-07 data-quality overhaul): wiki-sourced values are BANNED here.
 * An entry needs either an ESM-derived value (with the record trail in its
 * comment) or an in-game measurement. Effects the ESM can't express stay
 * inert and get badged via corrections.ts omodBadgeOverrides instead:
 * - Two Shot: override DELETED — the extracted ENCH values (dbm +0.75,
 *   projectileCount +1) now flow through; golden case pending measurement.
 * - Furious: override DELETED — its real mechanic is Onslaught stacking
 *   (deferred rework); inert + badged 'pendingMechanic' until then.
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
  // Instigating: +100% against full-health targets. Script-archetype ENCH
  // (ench_LegendaryWeapon_DamageFirstBlood) — the ESM carries no magnitude;
  // +100% is the effect's own description text and matches in-game behavior.
  mod_Legendary_Weapon1_DamageFirstBlood: [
    leg('mod_Legendary_Weapon1_DamageFirstBlood', 'Instigating', {
      bucket: 'dbm', op: 'ADD', value: 1.0,
      conditions: [{ kind: 'enemyFullHealth' }],
    }),
  ],
};
