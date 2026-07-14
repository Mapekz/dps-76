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
 * Also used for a second, unrelated purpose (2026-07-14, Cremator's
 * Slow-Burner): an extraction-SHAPE fix, not a script-computed value. The
 * mechanism (REPLACE an omod's whole extracted `modifiers`) happens to be
 * exactly what an "OMOD REMs the base weapon's own ench and must therefore
 * REPLACE rather than ADD onto it" case needs — see the Slow-Burner entry's
 * own comment and docs/assumptions.md "Weapon-intrinsic DoT & OMOD
 * replacement" for why a plain ADD→SET flip is safe here.
 *
 * dataset.ts consumes it — see there for the merge mechanics.
 */

// NOTE: Bloodied, Junkie's, and Aristocrat's are NOT overridden — their real
// value curves extract from the ENCH effects (Curve Table + input Actor
// Value), e.g. Bloodied is (5% HP → +130) … (100% HP → 0).

export const legendaryValueOverrides: Readonly<Record<string, Modifier[]>> = {
  // Crippling (2★): pin to the real +50% limb damage (the extracted ENCH
  // curve, flat 50 across item levels ×0.01). The 2026-07-14 "Mod Weapon
  // Attack Damage" entry-point route also surfaced two ×0 (MUL_ADD −1) rows
  // from the shared LegendaryCommonWeaponPerk this ENCH grants — Medic's
  // ally-heal machinery ("weapons with HasLegendary_Weapon_HealAllies deal
  // no damage to the allies they heal", gated WornHasKeyword/HasKeyword
  // 0x001F109B across owner/weapon/target tabs). Ally-directed fire is
  // permanently out of scope for an enemy-DPS engine, and the weapon-tab gate
  // alone would wrongly zero ALL damage when Medic's + Crippling are equipped
  // together — so the override keeps only the limb curve.
  mod_Legendary_Weapon2_DmgLimbs: [
    {
      id: 'mod_Legendary_Weapon2_DmgLimbs:override:0',
      source: {
        kind: 'omod',
        formId: '0x004ED02C',
        edid: 'mod_Legendary_Weapon2_DmgLimbs',
        name: 'Crippling',
      },
      bucket: 'limbDamage',
      op: 'ADD',
      curve: {
        input: 'itemLevel',
        points: [
          { x: 1, y: 50 },
          { x: 100, y: 50 },
        ],
      },
      curveScale: 0.01,
      conditions: [],
    },
  ],
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
  // Slow-Burning Tank (Cremator's Slow-Burner receiver, 2026-07-14): its OMOD
  // record REMs the base Cremator's own fire-hit ench (0x00729BCD, walked by
  // extract-weapons.ts's WEAP.Enchantment chase into a weapon-intrinsic
  // tier-13/6s fire dotDamage ADD) and ADDs its own ench 0x00729BCC
  // (CrematorFXEnchFireHit_Double — tier-17/12s, verified via `esm get`).
  // Extraction correctly produces an ADD for the OMOD's own ench, but ADD
  // would STACK with the weapon-intrinsic base rather than replacing it (the
  // in-game REM) — computeDotDps (paper-damage.ts) folds a `kind: 'weapon'`
  // modifier as the intrinsic base every OTHER dotDamage modifier folds ON
  // TOP of, and a SET (not ADD) is the one op that overrides that base
  // instead of adding to it. This override flips ONLY that op; the extracted
  // curve/duration/conditions are otherwise correct and are reproduced here
  // verbatim (docs/assumptions.md "Weapon-intrinsic DoT & OMOD replacement").
  mod_Cremator_Reciever_SlowBurner: [
    {
      id: 'mod_Cremator_Reciever_SlowBurner:override:0',
      source: {
        kind: 'omod',
        formId: '0x00729BE8',
        edid: 'mod_Cremator_Reciever_SlowBurner',
        name: 'Slow-Burning Tank',
      },
      bucket: 'dotDamage',
      op: 'SET',
      curve: {
        input: 'itemLevel',
        points: [
          { x: 1, y: 16 },
          { x: 5, y: 18 },
          { x: 10, y: 20 },
          { x: 15, y: 23 },
          { x: 20, y: 26 },
          { x: 25, y: 29 },
          { x: 30, y: 33 },
          { x: 35, y: 37 },
          { x: 40, y: 42 },
          { x: 45, y: 47 },
          { x: 50, y: 53 },
        ],
      },
      curveScale: 1,
      conditions: [{ kind: 'damageTypeScope', types: ['fire'] }],
      durationSec: 12,
    },
  ],
  // Extra Flame Jets (Shishkebab, 2026-07-14 — found while validating the
  // Slow-Burner fix): REMs the base Shishkebab's own ench
  // (ShishkebabBleedFireDOT, 0x00785433 — walked by extract-weapons.ts's
  // WEAP.Enchantment chase into TWO weapon-intrinsic dotDamage ADDs: fire
  // tier-12-shaped/5s AND ballistic tier-?/10s) and ADDs its own
  // ShishkebabFireDOT_ExtraFlameJets (0x0078B583 — fire tier-12-shaped/5s,
  // gated by an unresolved `IsUsingAltCurveTable` condition the extractor
  // doesn't model — verified via `esm get`). Same replacement problem as
  // Slow-Burner (ADD would stack onto the weapon-intrinsic base instead of
  // replacing it), PLUS the REM also drops the base ballistic bleed
  // component entirely, which this OMOD's own ench never replaces — so the
  // override both flips the fire entry's op to SET (currently inert either
  // way, since `unresolved` conditions never evaluate true — resolve.ts's
  // `evalCondition` — but correct if that condition is ever mapped later)
  // AND adds a `dotDamage SET 0` on the orphaned ballistic component so
  // equipping this mod doesn't leave the intrinsic bleed running unopposed.
  // The other two (unrelated) extracted modifiers — baseDamage MUL_ADD −0.2
  // ballistic (DamageTypeValues) and baseDamage ADD (fire, DamageTypeValues
  // curve) — are reproduced verbatim.
  mod_melee_Shishkebab_ExtraFlameJets: [
    {
      id: 'mod_melee_Shishkebab_ExtraFlameJets:override:0',
      source: {
        kind: 'omod',
        formId: '0x0014EC64',
        edid: 'mod_melee_Shishkebab_ExtraFlameJets',
        name: 'Extra Flame Jets',
      },
      bucket: 'baseDamage',
      op: 'MUL_ADD',
      value: -0.2,
      conditions: [{ kind: 'damageTypeScope', types: ['ballistic'] }],
    },
    {
      id: 'mod_melee_Shishkebab_ExtraFlameJets:override:1',
      source: {
        kind: 'omod',
        formId: '0x0014EC64',
        edid: 'mod_melee_Shishkebab_ExtraFlameJets',
        name: 'Extra Flame Jets',
      },
      bucket: 'baseDamage',
      op: 'ADD',
      curve: {
        input: 'itemLevel',
        points: [
          { x: 1, y: 7 },
          { x: 5, y: 8 },
          { x: 10, y: 9 },
          { x: 15, y: 10 },
          { x: 20, y: 12 },
          { x: 25, y: 13 },
          { x: 30, y: 15 },
          { x: 35, y: 17 },
          { x: 40, y: 19 },
          { x: 45, y: 21 },
          { x: 50, y: 24 },
        ],
      },
      curveScale: 1,
      conditions: [{ kind: 'damageTypeScope', types: ['fire'] }],
    },
    {
      id: 'mod_melee_Shishkebab_ExtraFlameJets:override:2',
      source: {
        kind: 'omod',
        formId: '0x0014EC64',
        edid: 'mod_melee_Shishkebab_ExtraFlameJets',
        name: 'Extra Flame Jets',
      },
      bucket: 'dotDamage',
      op: 'SET',
      curve: {
        input: 'itemLevel',
        points: [
          { x: 1, y: 8 },
          { x: 5, y: 9 },
          { x: 10, y: 11 },
          { x: 15, y: 12 },
          { x: 20, y: 14 },
          { x: 25, y: 15 },
          { x: 30, y: 17 },
          { x: 35, y: 19 },
          { x: 40, y: 22 },
          { x: 45, y: 25 },
          { x: 50, y: 28 },
        ],
      },
      curveScale: 1,
      conditions: [
        { kind: 'unresolved', raw: 'IsUsingAltCurveTable()=1' },
        { kind: 'damageTypeScope', types: ['fire'] },
      ],
      durationSec: 5,
    },
    {
      id: 'mod_melee_Shishkebab_ExtraFlameJets:override:3',
      source: {
        kind: 'omod',
        formId: '0x0014EC64',
        edid: 'mod_melee_Shishkebab_ExtraFlameJets',
        name: 'Extra Flame Jets',
      },
      bucket: 'dotDamage',
      op: 'SET',
      value: 0,
      conditions: [{ kind: 'damageTypeScope', types: ['ballistic'] }],
    },
  ],
};
