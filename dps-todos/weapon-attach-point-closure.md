# TODO: Weapon Attach-Point Closure — Mod-Granted Slots

Created 2026-07-14, discovered while verifying the slot-naming work: the user
flagged that the Hunting Rifle "definitely has a scope slot" in game, yet the
app shows none. Root cause is an extraction gap, not eligibility/display.
This is also the real cause of the tester report parked (and mis-routed to
the obtainability doc) in the old `omod-slot-hygiene.md` checklist: ".44
pistol, 10mm pistol, 10mm SMG, assault rifle only have a receiver mod slot."

## Problem

`extract-weapons.ts:347` copies only the WEAP record's own
`"Attach Parent Slots"` into `weapon.attachParentSlots`. But the game grants
most slots through *installed mods*: an OMOD's `Data."Attach Parent Slots"`
lists attach points that become available once that mod is equipped.

Ground truth (walked live, 20260710 dump): WEAP `HuntingRifle` (0x0004F46A)
lists only `ap_gun_Receiver` + cosmetic/legendary/range-offset APs. Its
receiver `mod_HuntingRifle_receiver_Base` (0x002DEB09) carries
`Data."Attach Parent Slots"` = `[0x0002249F, 0x00022499 (ap_gun_Scope),
0x0014D08B, 0x00149CA8, 0x0005D4D7 (ap_gun_Mag)]` — equipping the receiver
exposes grip/scope/barrel/front-sight/mag. The extractor never unions these
in, so `isEligible` branch 0 (attach point ∈ weapon.attachParentSlots)
silently rejects every mod on those slots — including all 12 Hunting Rifle
scopes, which extract correctly (obtainable:true, `ma_HuntingRifle`).

**Blast radius: 96 of 282 weapons** have keyword-eligible, obtainable,
non-cosmetic mods sitting on attach points missing from their extracted slot
list (sweep script: join omods.json targetKeywords ⊆ weapon.keywords against
attachParentSlots). Notable vetted-roster casualties:

- **The Fixer** — missing Barrel/Grip/Mag/Muzzle/Scope (shows only
  Receiver + Unique today).
- Hunting Rifle (scope/barrel/grip/mag/muzzle), the pipe-gun family
  (Pipe/Bolt/Revolver), Plasma Gun (20 barrels!), Radium Rifle, Railway
  Rifle, Submachine Gun, Lever Gun (incl. Western Spirit), Ultracite Laser /
  Ultracite Gatling Laser, Handmade (ATX_Sten), Assault Rifle (Whistle in
  the Dark), Pump-Action Shotgun, Single-Action Revolver, Tesla Cannon /
  Missile Launcher / Pepper Shaker / Gamma Gun muzzles, meltdown grip.

## Fix sketch

1. Shared index (same pattern as `cobj-index.ts`): OMOD formId →
   `Data."Attach Parent Slots"` (granted APs), built once from all OMOD
   records.
2. In the weapons pass, compute `attachParentSlots` as a **fixpoint
   closure**: seed with the WEAP's own APs ∪ APs granted by its
   template/default mods (`templateModFormIds`/`defaultModFormIds`), then
   iterate — any mod that is keyword-eligible for this weapon
   (`targetKeywords ⊆ weapon.keywords`, same gate as `isEligible`; empty
   targetKeywords only via template membership, to avoid cross-weapon
   pollution) AND attaches to a currently-available AP contributes its own
   granted APs — until stable (receiver → barrel → muzzle chains).
3. Re-extract, `pnpm extract:diff` (expect large slot-list additions),
   review `_meta.json`.
4. Re-run the roster hygiene/display sweeps: the new slots interact with the
   2026-07-14 show-all-mods policy (many newly visible zero-modifier
   scopes/grips → badged inert, correct) and the no-decision slot-hiding
   rules. Spot-check a handful of the 96 in the browser.
5. Restore the slot-naming test to its original intent: Hunting Rifle
   `ap_gun_Scope` slot exists, labeled "Scope" (it was rewritten to Alien
   Blaster when the missing slot was misread as expected behavior).

## Notes / cautions

- The paper model wants the union over all reachable mod configurations —
  per-configuration slot availability (does a *specific* barrel gate the
  muzzle?) is out of scope; the picker treats all closure slots as always
  present, same as every other loadout tool.
- Keep the closure eligibility gate EXACTLY aligned with app-side
  `isEligible` semantics or slots will drift between extractor and picker.
- Don't seed from every keyword-eligible mod directly (skip the AP-available
  check) without verifying it changes nothing: it likely converges to the
  same set, but the AP-gated fixpoint is the defensible game semantics.
- Watch CUT_/unobtainable donors: a cut mod's granted APs must not open
  slots (gate contributors on `obtainable !== false` or junk-prefix rules).

## Issue checklist

- [ ] Hunting Rifle: scope slot back (12 scopes, inert-badged), plus
      barrel/grip/mag/muzzle.
- [ ] The Fixer: full slot set (Barrel/Grip/Mag/Muzzle/Scope) restored.
- [ ] Tester four: .44 pistol, 10mm pistol, 10mm SMG, assault rifle show
      more than a receiver slot.
- [ ] Plasma Gun barrels (20), Radium/Railway/SMG/Lever/Ultracite laser
      slots restored.
- [ ] Re-verify no eligibility pollution regressions (Vox Syringe /
      internal-suppressor pinning tests stay green).
- [ ] Naming test restored to Hunting Rifle "Scope".

## Files

- `scripts/extract/extract-weapons.ts` — closure computation (~line 347).
- `scripts/extract/extract-omods.ts` or a new shared `ap-grant-index.ts` —
  OMOD → granted-APs index.
- `src/data/live/generated/weapons.json` — regenerated.
- `src/data/__tests__/omods.test.ts` — restore/extend pinning tests.
