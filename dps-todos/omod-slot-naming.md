# TODO: OMOD Slot Display Names

Created 2026-07-14 from the weapon-pane mod-selection bug sweep. Pure UI-label
work — independent of the eligibility/obtainability fixes, can run any time.

## Problem

`slotLabel()` (`src/data/omods.ts:148-155`) auto-derives labels from the
attach-point EDID (`ap_gun_Barrel` → "Barrel"); the only override is
`ap_customName` → "Unique". Game data reuses attach points across weapon
archetypes, so melee weapons inherit gun slot names (auto axe blades on a
"scope" attach point, chainsaw bars on "barrel") and some EDIDs are just ugly
("MeleeMod", "ChemicalType").

## Fix sketch

1. Expand `SLOT_LABEL_OVERRIDES` (attach-point-EDID-keyed) for the
   universally-wrong names: `MeleeMod` → "Upgrade" (or similar),
   `ChemicalType` → "Tank", `Item_Description` → see
   [unique-cursed-mods.md](unique-cursed-mods.md).
2. Add a **per-weapon(-class) label override layer** for attach points whose
   correct name depends on the weapon (likely in `overrides/corrections.ts`,
   keyed `(weaponId, attachPointEdid) → label`): auto axe "Scope" → "Blade",
   chainsaw "Barrel" → "Bar", chainsaw "Scope" → (flamer-mod slot — pick a
   sane name, e.g. "Attachment"), drill "Barrel" → "Drill Bit".
3. Convention decision: energy-weapon Capacitor may keep rendering as
   "Receiver" (user OK'd unifying); pick per-weapon overrides only where a
   real in-game Pip-Boy/workbench name differs. Where possible, source the
   in-game name from the attach point KYWD's FULL name via `/esm-walk`
   instead of inventing one.

## Issue checklist

- [ ] Auto axe slot called "Scope" (holds blade mods).
- [ ] Baton, assaultron blade (+ other melee) slot named "MeleeMod".
- [ ] Hatchet "MeleeMod" (also has a stray "no upgrade" entry — dedupe scope
      in [omod-slot-hygiene.md](omod-slot-hygiene.md)).
- [ ] Chainsaw bar slot named "Barrel"; flamer-mod slot named "Scope".
- [ ] Drill piercing-bit slot named "Barrel".
- [ ] Cremator tank slot named "ChemicalType".
- [ ] Sweep all attach points in generated omods.json for other raw EDIDs
      leaking through (`slotLabel` fallbacks).

## Files

- `src/data/omods.ts` — `SLOT_LABEL_OVERRIDES` + per-weapon layer plumbing.
- `src/data/overrides/corrections.ts` — per-weapon label table w/ source
  comments.
