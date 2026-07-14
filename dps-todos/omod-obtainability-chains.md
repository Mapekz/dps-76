# TODO: OMOD Obtainability — Plan/Recipe/Vendor Chains

Created 2026-07-14 from the weapon-pane mod-selection bug sweep. Shares the
COBJ index with [omod-eligibility.md](omod-eligibility.md) — execute together
or after it.

## Problem

`scripts/extract/obtainability.ts` proves OMOD access via COBJ (non-repair/
nocraft), GMRW, LGDI, QUST, CONT, MISC, FLST refs and obtainable-WEAP
inheritance, with a 3-hop OMOD-collection chase. It does **not** trace:

- **Recipe BOOK → COBJ teaching** (plan books that unlock the COBJ), nor
  where the BOOK itself comes from (LVLI drop, vendor).
- **Scrap-to-learn** (COBJ learned by scrapping the WEAP — e.g. ultracite
  gatling laser mods — or the OMOD/MISC loose-mod item — e.g. black powder
  large bayonet, legendary mods).
- **Vendor chains** — gold bullion (Samuel/Regs/Mortimer/Minerva/Windy) and
  caps vendors (Splint, train-station/Whitespring vendor bots), i.e. VENDOR
  FLST/LVLI containers the current chase may not reach.

Result: real mods flagged unobtainable (hidden) → the missing-slot reports
below; and conversely cut/POST content sneaks through when a stale ref exists.

## Fix sketch

1. Extend the reverse-ref chase: BOOK teaching a COBJ counts as proof IF the
   BOOK is itself obtainable (LVLI/vendor/quest chase, reuse the existing
   recursive LVLI walker); COBJ `learned from scrapping` conditions count
   when the scrap source (WEAP/MISC) is obtainable.
2. Audit vendor FLST/LVLI roots (bullion + caps vendors) are in the
   player-facing LVLI seed set.
3. Re-extract, run `pnpm extract:diff`, and review `_meta.json`
   unresolved/excludedDetailed before/after. Rescue leftovers via
   `forceVisibleOmodIds` with source comments.

## Issue checklist

Missing (likely obtainability false negatives — verify each via `/esm-walk`):
- [ ] Gauss minigun gunner sight.
- [ ] PlasmaGun + Enclave plasma gun barrel slot entirely missing.
- [ ] Laser + ultracite laser: barrel + muzzle mods.
- [ ] Gatling laser + ultracite gatling laser: barrel mods.
- [ ] Gatling plasma: muzzle + core mods (stinging/swift/large core
      receptacle).
- [ ] Plasma caster: barrel mods.
- [ ] Gamma gun: muzzle slot (signal repeater, electric signal antennae —
      note in-game there may be NO plain/standard option for this slot).

False positives (cut/unobtainable content leaking through):
- [ ] Gauss pistol "energy barrel" — cut/deprecated/POST, not obtainable.
- [ ] Sweep for other COBJ-less, drop-less mods once chains are complete.

## Files

- `scripts/extract/obtainability.ts` — BOOK/scrap/vendor chases.
- `src/data/overrides/corrections.ts` — rescue survivors, prune stale ones.
- Re-extract + `pnpm extract:diff` + `_meta.json` review.
