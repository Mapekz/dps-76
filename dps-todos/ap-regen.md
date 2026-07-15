# CLOSED 2026-07-15: VATS AP Regen, AP Cost, Max AP & AP-Scaled Damage

> **Shipped 2026-07-15** (the "AP economy completion" pass). Everything
> in-scope for this doc is modeled; the two remainders moved out explicitly:
> armor-sourced AP effects → [armor-mods-outgoing.md](armor-mods-outgoing.md)
> (records already located, engine buckets ready), on-kill AP restores →
> phase-3 TTK (README parked list). Full derivations and the ESM chases live
> in `docs/assumptions.md` "VATS AP economy & manual-aim hit rate".
>
> VATS hit-chance / accuracy modeling remains **permanently out of scope**
> (closed-box engine formula, no decodeable ESM data — rescope note
> 2026-07-13). VATS accuracy stays hardcoded to 100%
> (`src/lib/engine/scenarios.ts`).

## What shipped

- **Lone Wanderer** — already resolved by the teammate-count extraction work
  + the existing `charisma` curve-input mapping; verified 2026-07-15: the AP
  regen lives ONLY on rank 1's ability (CHA curve 10→85%, solo-gated); ranks
  2/3 records carry only the DR effect (their flat "20/30% AP regen"
  descriptions are stale legacy text). Engine test + null golden added.
- **New buckets**: `apRegenFlat` (flat AP/sec, AV `ActionPointsRate` —
  Company Tea +10, Nukashine, alcohols, L&L#4/G&B#4 magazines), `apMax`
  (Peak fortifies on AV `ActionPoints` — foods, wine, AT#7/L&L#7 magazines,
  Scaly Skin −50, Civil Unrest +50), `apCritHot` (refresh-only on-crit AP
  HoT). Composition: `regen = (4.0 + Σflat) × (1 + Σ%)` (AV-standard,
  assumption pending stopwatch goldens).
- **Consumable recovery**: routing the two AVs rescued 28 previously-excluded
  AP-only consumables (Company Tea among them) — the keep-filter needed no
  change. Instant AP restores are a documented out-of-scope skip (same rule
  as instant heals).
- **Hydration baseline discovered & modeled**: hidden `SURV_Thirst_Ability`
  grants every fully-hydrated non-ghoul +35% AP regen (45/60% with
  Rejuvenated 1/2 — hand-authored deltas since the PERK records are empty).
  Default-on `hydrated` toggle in Conditions; ghoul-gated.
- **Packin' Light**: +25% regen, `IsOverEncumbered()=0` consumed as
  always-true (optimal-play assumption).
- **Number Cruncher**: `STAT_DmgAP` route → dbm 0.02 × new
  `scaledByWeaponApCost` condition (weapon-level EFFECTIVE AP cost, all
  scenarios incl. free aim). Scanner's-4★ exemption documented in
  armor-mods-outgoing.md.
- **Conductor's corrected**: flat `apPerCrit 110` → spike 10 + refresh-only
  HoT 20 AP/s × 5s (fast crits saturate at +20 AP/s instead of the old
  110/crit overcount).
- **UI**: VATS card AP breakdown line (pool · regen/s · cost/shot);
  hydration toggle.
- **Sweep verdicts** (dead/skipped/deferred records) recorded in
  assumptions.md so nothing gets re-chased.

## Verification still owed (user, in-game)

Four `expected: null` goldens in `golden/cases.json` (`apRegenPerSec` /
`perHit` measures): hydrated baseline 5.4 AP/s, Lone Wanderer solo 6.6 AP/s,
Company Tea 18.9 AP/s, Number Cruncher +32% pip-boy damage. The baseline +
Company Tea pair pins the flat-4.0 GMST CAVEAT and the flat-before-percent
composition in one session.
