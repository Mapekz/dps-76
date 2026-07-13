# TODO: VATS AP Regen (Passive & Active Sources)

> **Rescoped 2026-07-13** (renamed from `ap-and-accuracy.md`). VATS hit-chance
> / accuracy modeling is now **permanently out of scope** — not deferred,
> dropped for good. The underlying formula (spread, ADS multipliers,
> weapon-specific accuracy curves, VATS-specific to-hit) is a closed box: it
> isn't exposed as a decodeable magnitude/curve anywhere in the ESM, so there
> is no data-driven path to modeling it here. VATS accuracy stays hardcoded
> to 100% (`src/lib/engine/scenarios.ts`) for good. This doc's only remaining
> scope is AP regen/sec sources — passive (condition-gated, e.g. Lone
> Wanderer) and active (on-crit, e.g. Conductor's).

## What's shipped already (baseline this extends)

- **AP economy core** (`src/lib/engine/ap-economy.ts`, 2026-07-11):
  steady-state drain/regen/uptime model, the "AP-limited" VATS DPS line, and
  the manual-aim `hitRatePct` input. `docs/assumptions.md` "VATS AP economy &
  manual-aim hit rate".
- **`apRegen` bucket** (Σ decimal, folds via `foldBucket` in
  `scenarios.ts:338`) and **`apPerCrit` bucket** (flat AP per VATS crit,
  `scenarios.ts:339`) both exist and fold correctly into
  `computeApEconomy`.
- **Conductor's** — active, on-crit AP regen (+AP per VATS crit) — modeled
  via `apPerCrit` (`src/data/overrides/legendary-values.ts`, script-computed
  legendary value with a full ESM chase comment). **DONE**, no further work.
- **Action Boy/Girl's flat `ActionPointsRateMult` path** — `apRegen` bucket,
  `scale: 0.01` (`scripts/extract/normalize/mgef.ts:128`). **DONE**.

## What's actually missing

1. **Lone Wanderer's AP regen is dead.** `+20%/+30% AP regen while solo`
   (ranks 2/3 — `src/data/live/generated/perks.json`, family `LoneWanderer`,
   formIds `0x001D246B/D/E`) extracts with `modifiers: []` on every rank; the
   perk's `notes` carry `"AbPerkFortifyActionPointRegen: curve with unmapped
   input AV 0x000002C5 — needs override"`. This is the highest-value target
   in this doc — Lone Wanderer is one of the most commonly equipped perks in
   the game, so every solo build currently understates AP economy. Work:
   `esm-walk` AV `0x000002C5` (it's the curve's *input* AV, not the affected
   one — same shape as other STAT_*/AbPerk* curve mappings in
   `normalize/mgef.ts`) and add a mapping so rank 2/3 resolve to an `apRegen`
   ADD, gated by the perk's existing `IsMemberOfAPlayerTeam()=0` condition
   (check whether that condition kind already exists in `resolve.ts`, or
   needs one).
2. **Passive armor-sourced AP regen** — no confirmed record yet for a
   "Powered"-named or equivalent effect. **No armor OMOD/legendary
   extraction pipeline exists in this codebase at all**:
   `scripts/extract/extract-omods.ts` hardcodes `formType !== 'Weapon'`
   (~line 268) to skip everything but WEAP-attached mods, so no armor-only
   legendary has ever been chased from the ESM. `esm-walk` from scratch:
   search ENCH/MGEF/PERK records for anything targeting
   `ActionPointsRateMult`/`FortifyActionPointsRegen` gated on armor-equip
   conditions instead of weapon-legendary attach points. This is the same
   missing pipeline `armor-mods-outgoing.md` now depends on for its own
   scope — build it once, feed both.
3. **Sweep broadly while chasing #2** — this doc's scope is now "every
   remaining AP regen source," not just the two named examples. Grep the
   ESM for other `ActionPointsRateMult`/`FortifyActionPointsRegen`/
   `ActionPointsRegen` targets while doing the armor-omod chase above.

## Where to implement

- Curve/AV mapping: `scripts/extract/normalize/mgef.ts` (STAT_*/AbPerk*
  pattern already established — see the existing `ActionPointsRateMult`
  entry for the shape).
- If an armor-only source is confirmed: new `extract-armor-omods.ts` (or
  extend `extract-omods.ts`'s attach-point matching to `ARMO`/`ARMA`
  records) → `armor.ts` population → armor picker UI (shared with
  `armor-mods-outgoing.md`).
- No new `Bucket` expected — reuse `apRegen`/`apPerCrit` unless a source
  turns out to be a flat AP/sec grant instead of a % or per-crit value (would
  need a new bucket per the CLAUDE.md new-mechanic checklist).
- `docs/assumptions.md`: extend "VATS AP economy & manual-aim hit rate" with
  each newly-modeled source and its ESM chase.

## Verification

- Golden case or in-game measurement: solo vs. teamed AP regen rate with
  Lone Wanderer rank 3 equipped (stopwatch test — same pattern as the
  existing `fActionPointsRestoreRate` CAVEAT already flagged in
  `ap-economy.ts`).
- Extraction fixture test for the new curve mapping.
- `pnpm test` + `pnpm build` green; reconcile any golden-case shifts from
  Lone Wanderer suddenly contributing AP regen.

## Permanently out of scope

VATS accuracy %, recoil/spread, aim-down-sight multipliers, and every
per-source accuracy bonus previously catalogued here (VATS Enhanced, Vector,
Photoropter, Eye of the Hunter, Awareness, Orange Mentats, VATS Matrix
overlay, Conc Fire, Aligned/Glow Sights mods) — see the header note. Not
revisiting even once enemy mitigation lands; the closed-box nature of the
underlying formula doesn't change with that dependency.
