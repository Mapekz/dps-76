# TODO: Unique & Cursed Mods — Slot Completion

Created 2026-07-14 from the weapon-pane mod-selection bug sweep. Builds on the
2026-07-13 unique-mod rework (`ap_customName` + `ObjectTypeUnique` +
`templateModFormIds`; see docs/assumptions.md §Unique weapons).

## Problem

Three gaps in the unique system:

1. **Cursed mods live on `ap_Item_Description`**, not `ap_customName`, so
   they render under a slot literally labeled "Item Description" (Broadsider,
   Harpoon Gun). May be a game-data quirk — cursed mods aren't fully in the
   unique system — so treat as its own attach-point case.
2. **Missing uniques**: many unique mods don't appear in their weapon's
   Unique slot — likely `templateModFormIds` join misses (the unique WEAP
   record carries the template, not the base weapon) or `ObjectTypeUnique`
   keyword absent on the mod.
3. **Bogus/wrong entries**: non-player uniques leaking in, wrong display
   names.

## Fix sketch

1. Extraction: for each unique WEAP (one with `mod_Custom_*` in its
   template), propagate its custom/unique mods onto the **base** weapon's
   selectable unique list (the `if_tmp_*` template configuration chase).
   Verify each via `/esm-walk` before overriding by hand.
2. Treat `ap_Item_Description` mods with real modifiers as unique-tier:
   label the slot "Unique" (or "Cursed") instead of raw EDID.
3. UX decision (user open to separate spike): unique selectable from the
   base weapon's Unique slot AND/OR unique weapon listed in the weapon list
   that pre-selects the mod. Start with the mod-slot side; weapon-list
   aliasing can follow.
4. Unique-mod display name should be the unique weapon's name (Kabloom
   showing as "poison" = name derivation bug).

## Issue checklist

Missing uniques:
- [ ] Double-barrel shotgun — Cold Shoulder.
- [ ] Handmade — Shattered Grounds.
- [ ] Flamer — Holy Fire, Boiling Point.
- [ ] Gatling laser + ultracite gatling laser — Valkyrie (+ possibly Helga).
- [ ] Gauss rifle — Flatliner.
- [ ] Gauntlet — Drill Fist.
- [ ] Pickaxe — Cultist Piercer.
- [ ] Plasma gun — Meadow Breeze (sprayer), ABX03 Prototype.
- [ ] Dom Pedro (machete?) — explosive/explosive-penetrating mod: model the
      explosive portion + base-damage reduction/stat changes; ignore the
      penetration part entirely for now.

Wrong:
- [ ] Kabloom (pump action) unique shows as "poison" instead of weapon name.
- [ ] Broadsider + Harpoon Gun — Cursed mod under "Item Description" slot.

Bogus (verify then hide, with source comments):
- [ ] "The Pipe" appearing as a pipe-gun unique — real player item?
- [ ] Cryolator "Minty Breather" — probably not player-obtainable.
- [ ] Fancy pump action + fancy .44 revolver — confirm these are now just
      skins (no separate weapon/unique mod needed).

## Files

- `scripts/extract/extract-omods.ts` / `extract-weapons.ts` — unique
  template propagation to base weapons.
- `src/data/omods.ts` — `ap_Item_Description` handling, unique-slot
  filtering (`omods.ts:219-227`), name derivation.
- `src/data/overrides/corrections.ts` — rescues/hides with sources.
- `docs/assumptions.md` — update the unique-weapons section.
