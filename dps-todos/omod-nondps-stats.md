# TODO: Keep Non-DPS Mods (AP Cost, Armor Pen, Utility)

Created 2026-07-14 from the weapon-pane mod-selection bug sweep.

## Policy decision (user-approved direction)

Show **ALL valid + obtainable** mods for a weapon, even those with zero DPS
delta — matching genre convention (Path of Building, WoWSims, xivgear all
model the full loadout): users complete/share builds, a Reflex vs Iron sight
choice is part of the mental model, and AP cost / armor penetration WILL be
wired into the engine later (armor pen already has a dormant `armorPen`
bucket path awaiting enemy mitigation — see phase-3-enemies.md).

## Problem

`PROPERTY_IGNORED` (`scripts/extract/extract-omods.ts:87-112`, 37 names)
drops `ActionPointCost` and friends at extraction ⇒ mods carrying ONLY those
properties land with `modifiers: []` ⇒ `classifyOmodDisplay()`
(`src/data/omods.ts:114-138`) hides zero-modifier non-stock mods entirely.
So Aligned/Glow Sights/Perforating/Prime-style mods vanish from the picker.
(Note: `AttackActionPointCost` → `vatsApCost` and `ArmorPenetration` via
actor-value buckets ARE already mapped — the gap is `ActionPointCost` and
mods whose only payload is currently-ignored properties.)

## Fix sketch

1. Re-triage `PROPERTY_IGNORED`: promote `ActionPointCost` (and audit the
   other 36) into modifiers or a side `stats` field on `GeneratedOmod` —
   even if the engine ignores them today, the data survives and the picker
   can show the mod (optionally with the stat in its description line).
2. Relax `classifyOmodDisplay()`: a craftable/obtainable mod with zero
   engine-relevant modifiers gets `show: true` + `badge: 'inert'` (badge
   machinery already exists) instead of `show: false`.
3. Later wiring (separate, tracked in ap-regen.md / phase-3-enemies.md):
   fold AP-cost mods into the VATS AP economy, `armorPen` into mitigation.
4. Update `docs/assumptions.md` for any non-ESM-proven display choices.

## Issue checklist

- [ ] Aligned stock / Aligned barrel / Long barrel / grips affecting AP cost
      (also feeds Number Cruncher-style perks).
- [ ] Glow Sights; reflex/iron sight choices generally.
- [ ] Prime receivers (AP-cost side; damage side presumably already shows).
- [ ] Perforating / armor-pen magazines (10mm SMG etc.) — "semi-important
      for DPS" per tester; armor pen becomes real with enemy mitigation.
- [ ] Gatling gun scope + barrel: confirm whether they exist as real slots
      and whether they carry AP-cost effects (tester question).
- [ ] Re-sweep zero-modifier hidden mods after the change — some previously
      "inert" hides may deserve rescue, some cosmetics should stay hidden
      (cosmetic-slot regex still applies).

## Files

- `scripts/extract/extract-omods.ts` — `PROPERTY_IGNORED` triage.
- `src/types/generated.ts` / `src/types/modifiers.ts` — where the new stats
  live (modifier bucket vs side-channel field).
- `src/data/omods.ts` — `classifyOmodDisplay()` policy.
- `src/lib/engine/effective-weapon.ts` — nothing now; later wiring.
- `docs/assumptions.md`.
