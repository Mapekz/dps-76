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

- [ ] Vox Syringe Barrel appears on: gauss minigun, auto grenade launcher,
      black powder pistol/rifle/blunderbuss/dragon, broadsider, chainsaw,
      cremator, and more. (Syringer-only or quest weapon; likely 0 DPS impact
      — may end up hidden entirely by nondps/obtainability rules.)
- [ ] Internal suppressor on chainsaw ("misc" slot), gatling laser, AGL misc.
      In-game only the Anchorage Ace (10mm SMG) has it built-in; everything
      else uses a normal Suppressor muzzle mod.
- [ ] Paddle ball offers fire/spiked etc. melee mods.
- [ ] Auto grenade launcher: bogus mag ("bot mag"), FeedThroat, grip, misc,
      sight slots — only the barrel is real in-game.
- [ ] .50 cal: grip/mag/sight slots not craftable today (leave data intact —
      may become real when new mods ship; hidden by no-COBJ rule).
- [ ] M79: receiver + misc slots (no user-changeable mods in-game yet).
- [ ] Bow + compound bow: purposeless receiver slot.
- [ ] Black powder family: muzzle slot currently shows nothing — the bayonet
      slots here; KEEP the slot with the bayonet (COBJ exists, learned from
      the MISC mod item).
- [ ] Gauss minigun missing gunner sight (may be an obtainability false
      negative instead — see sibling doc).

## Files

- `scripts/extract/extract-omods.ts` — COBJ chase, emit craft-linkage field.
- `scripts/extract/obtainability.ts` — share the COBJ index (already walks
  COBJ referencers for the obtainable flag).
- `src/types/generated.ts` — new field(s) on `GeneratedOmod`.
- `src/data/omods.ts` — `isAttachable`/`getOmodSlots` consume the linkage.
- `src/data/overrides/corrections.ts` — prune `omodWeaponRestrictions` after.
