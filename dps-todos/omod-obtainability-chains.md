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

**DONE 2026-07-14** — landed as `scripts/extract/cobj-index.ts` (forward COBJ
index: Created Object, Learn Method, Learn Recipe From, Repair Method) +
learn-method-gated COBJ handling in obtainability.ts (`cobjBook`/`cobjScrap`
chases, `BOOK_LVLI_DEPTH_CAP=10` for ~8-LVLI-deep vendor plan pools, field-based
NOCRAFT via the `recipe_Dummy_Uncraftable_Item_NOCRAFT` learn-from stub) + a
`reviewFlagged.omodWeakEvidence` queue in `_meta.json` (user decision: flag,
never auto-hide). Scrap-to-learn needed NO inference: `Learn Recipe From`
explicitly names the scrap source. Vendor LVLI/FLST roots were already
reachable — the problem was depth (BOOK → vendor CONT is 8 LVLIs), not seeds.
See docs/assumptions.md "OMOD eligibility & recipe chains".

Missing (likely obtainability false negatives — verify each via `/esm-walk`):
- [x] ALL of these turned out to be display-layer, not obtainability: every
      listed mod is obtainable:true with correct targetKeywords, but extracts
      with zero modifiers and the "hide pure utility" display rule hides it →
      [omod-nondps-stats.md](omod-nondps-stats.md) scope. (Gauss minigun
      gunner sight, PlasmaGun/Enclave barrels, laser/ultracite barrel+muzzle,
      gatling laser barrels, gatling plasma muzzle/core, plasma caster
      barrels, gamma gun muzzle.) The 2026-07-14 re-extract flipped ZERO
      records false→true — there were no obtainability false negatives here.
- [x] Real false negatives the book chase DID surface (script/terminal
      vendors are invisible to the record graph — rescued in
      `forceVisibleOmodIds` with sources): Tesla Rifle Lobber Barrel (stamps
      vendor plan) and the three Thirst Zapper mags (Nuka-Cade prize plan).

False positives (cut/unobtainable content leaking through):
- [x] Gauss pistol "energy barrel" — confirmed cut (its only recipe learns
      from the uncraftable dummy; obtainable only via template ride-along) →
      `hiddenOmodIds`. Flagged automatically by the weak-evidence queue.
- [x] Sweep — `_meta.json reviewFlagged.omodWeakEvidence` now self-reports
      every standard-slot mod whose only proof is weap:/omod: inheritance
      (52 entries on the 20260710 dump; reviewed: Enclave plasma mods are
      correct loose-mod drops, paddle ball trio was cut → now junk-filtered
      via the `CUT_` referencer prefix, MG42 craft variants → dummy-learn-from
      hides). Re-populated on every extraction.

## Files

- `scripts/extract/obtainability.ts` — BOOK/scrap/vendor chases.
- `src/data/overrides/corrections.ts` — rescue survivors, prune stale ones.
- Re-extract + `pnpm extract:diff` + `_meta.json` review.
