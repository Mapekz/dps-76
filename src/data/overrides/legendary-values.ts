import type { Modifier } from '@/types/modifiers';

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
 *   projectileCount +1) now flow through; golden case confirmed 180.25.
 * - Furious: override DELETED — its real mechanic is Onslaught stacking
 *   (deferred rework); inert + badged 'pendingMechanic' until then.
 * - Instigating: override DELETED (2026-07-10) — the granted-perk chase now
 *   extracts the real values from PERK Legendary_Weapon_DamageFirstBlood:
 *   dbm +0.5 at enemy HP ≥ 60%. The old +100%-at-full-health override came
 *   from description text and is stale post-rework.
 *
 * dataset.ts consumes it — see there for the merge mechanics.
 */

// NOTE: Bloodied, Junkie's, and Aristocrat's are NOT overridden — their real
// value curves extract from the ENCH effects (Curve Table + input Actor
// Value), e.g. Bloodied is (5% HP → +130) … (100% HP → 0).

export const legendaryValueOverrides: Readonly<Record<string, Modifier[]>> = {
  // Conductor's (Stage B, AP economy): "Critical Hits Restore 10 Health &
  // Action Points instantly and 100 more over 5 seconds" = 110 AP per VATS
  // crit. Script-computed — the entry point isn't extractor-modeled (verified
  // chain in the 20260702 dump: OMOD mod_Legendary_Weapon4_Conductors
  // 0x007ACB0B → ENCH 0x007ACB05 → PERK Legendary_Weapon_Conductors → PERK
  // Legendary_Weapon_ConductorsPlayerPerk "Apply Combat Hit Spell" gated
  // GetLastHitCritical()=1 → SPEL Legendary_Weapon_ConductorsPlayerRestoreSpell
  // 0x007ACB0D, whose AP-restore magnitudes (10 instant + 100/5s) don't route
  // through the STAT_* plumbing). No on-kill component exists on this effect
  // (verified — out of scope per plan, waits on enemy TTK). Unconditional:
  // ap-economy.ts already scales its contribution by crit cadence
  // (apPerCrit × shotsPerSec/shotsPerCrit), so no `crit` gate belongs here.
  mod_Legendary_Weapon4_Conductors: [
    {
      id: 'mod_Legendary_Weapon4_Conductors:override:0',
      source: {
        kind: 'omod',
        formId: '0x007ACB0B',
        edid: 'mod_Legendary_Weapon4_Conductors',
        name: "Conductor's",
      },
      bucket: 'apPerCrit',
      op: 'ADD',
      value: 110,
      conditions: [],
    },
  ],
};
