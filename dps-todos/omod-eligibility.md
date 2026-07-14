# TODO: COBJ-Anchored OMOD↔Weapon Eligibility

Created 2026-07-14 from the weapon-pane mod-selection bug sweep. **This is the
foundational fix** — most "mod X shows on weapon Y" pollution traces here.
Sibling docs: [omod-obtainability-chains.md](omod-obtainability-chains.md)
(shares the COBJ index — execute together or this one first),
[omod-slot-hygiene.md](omod-slot-hygiene.md), [omod-slot-naming.md](omod-slot-naming.md),
[omod-nondps-stats.md](omod-nondps-stats.md), [unique-cursed-mods.md](unique-cursed-mods.md).

## Problem

`isAttachable()` (`src/data/omods.ts:80-85`) offers an OMOD on a weapon when
`attachPointFormId ∈ weapon.attachParentSlots` AND
`targetKeywords ⊆ weapon.keywords`. Mods with **empty `targetKeywords`**
(quest/one-off mods like `MTNS05_mod_PipeSyringer_Barrel_Vox`,
`mod_10mmSMG_InternalSuppressor`) therefore match EVERY weapon sharing the
attach point. `omodWeaponRestrictions` in `overrides/corrections.ts` is a
per-mod whack-a-mole patch, not a system.

## Fix sketch

The game's real gate is craftability: **a COBJ is almost always required to
put an OMOD into a WEAP**. Build eligibility from the ESM instead of open
keyword matching:

1. Extraction: index COBJ records by created-object → for each OMOD capture
   its COBJ(s) — workbench keyword (`BNAM`), conditions/target restrictions
   (which weapon(s)/keywords the recipe applies to).
2. App-side eligibility = attachable (current check) AND at least one of:
   - a COBJ ties the mod to this weapon (directly or via required keyword),
   - the mod is in the weapon's `templateModFormIds` (stock/default/unique),
   - explicit rescue in `overrides/corrections.ts`.
3. Empty-`targetKeywords` mods with no COBJ link to the weapon ⇒ **not
   offered**. Retire most `omodWeaponRestrictions` entries once this lands.

Use `/esm-walk` to confirm the COBJ condition encoding (likely CTDA
`HasKeyword`/`GetIsObject` on the workbench target) before coding.

## Issue checklist (from tester sweep, 2026-07-14)

**DONE 2026-07-14** — landed as `isEligible` (`src/data/omods.ts`): attach
point gate, keyword-subset gate, and for EMPTY-targetKeywords mods a
template-membership / `omodWeaponRestrictions`-rescue gate. Key ground-truth
correction vs the sketch below: **COBJs carry no CTDA/BNAM naming a weapon**
(walked live), so "a COBJ ties the mod to this weapon" is not encodable —
template membership is the restrictive signal; `hasGrantingCobj` is emitted as
a diagnostic only. See docs/assumptions.md "OMOD eligibility & recipe chains".

- [x] Vox Syringe Barrel — empty targetKeywords; now offered only on
      MTNS05_PipeSyringer_Vox (its sole template seat). Pinned by test.
- [x] Internal suppressor — same mechanism; only the 10mm SMG templates it.
      Pinned by test.
- [x] Paddle ball fire/spiked mods — tester was RIGHT: cut content. Their
      plan books are `CUT_recipe_mod_PaddleBall_*` with zero referencers and
      obtainability was laundered through `CUT_DLC04_modcol_melee_Paddleball`;
      `CUT_` is now a junk-referencer prefix (obtainability.ts) and all three
      flipped obtainable:false. (Paddle ball isn't in the vetted roster
      anyway.)
- [x] AGL — misc slot gone (internal suppressor). Remaining bot mag/
      FeedThroat/grip/sight each hold ONLY the weapon's own keyword-scoped
      `_Base` standard part — that's [omod-slot-hygiene.md](omod-slot-hygiene.md)
      scope (single-standard-part slots), not eligibility pollution.
- [x] .50 cal — grip/mag/muzzle + Critical receivers flipped
      obtainable:false: their COBJs learn from
      `recipe_Dummy_Uncraftable_Item_NOCRAFT` (the new field-based non-granting
      check; edids are clean so the legacy regex never saw them). Data intact,
      hidden — un-hides itself if a patch makes them craftable.
- [x] M79 — misc slot gone (P62 Chaos Engine needs the P62_ma keyword);
      "Standard"-named Assaultron-head receivers no longer leak (empty
      keywords, templated on no weapon). Remaining receiver slot holds only
      mod_M79_Receiver_Standard → slot-hygiene scope.
- [x] Bow + compound bow — receiver slot gone (same Assaultron-head leak).
- [x] Black powder family — muzzle slot kept (mod_Null_Muzzle). The bayonet
      is obtainable:true (its Learn-Method-1 recipe's `Learn Recipe From`
      names WEAP BlackPowder_Rifle — better than the MISC guess) but extracts
      with zero modifiers, so the no-modifier display rule still hides it →
      [omod-nondps-stats.md](omod-nondps-stats.md) scope.
- [x] Gauss minigun gunner sight — NOT an eligibility/obtainability bug:
      already obtainable:true with correct ma_GaussMinigun keyword; hidden by
      the no-modifier display rule → [omod-nondps-stats.md](omod-nondps-stats.md).

## Files

- `scripts/extract/extract-omods.ts` — COBJ chase, emit craft-linkage field.
- `scripts/extract/obtainability.ts` — share the COBJ index (already walks
  COBJ referencers for the obtainable flag).
- `src/types/generated.ts` — new field(s) on `GeneratedOmod`.
- `src/data/omods.ts` — `isAttachable`/`getOmodSlots` consume the linkage.
- `src/data/overrides/corrections.ts` — prune `omodWeaponRestrictions` after.
