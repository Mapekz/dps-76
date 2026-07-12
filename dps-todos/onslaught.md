# Onslaught Mechanic — RESOLVED 2026-07-12

## What

The Onslaught stacking mechanic — the shared stack counter behind Furious,
Pounder's, Splinter's, Whacker Smacker, and Gunslinger/Guerrilla Expert+Master
— is now modeled. User-confirmed model (2026-07-10): max stacks starts at 0;
each equipped Onslaught perk/mod ADDs to the max; each source grants its own
per-stack bonus; the UI gets a slider selecting 0..max stacks (default = max).

Full derivation, the contributor table, and every assumption trade live in
**docs/assumptions.md → "Onslaught"** — this doc is now a pointer + resolution
log, not the working spec.

## What shipped

- **IR**: new `Bucket.onslaughtMaxStacks` (flat ADD contributions to the
  shared cap, base 0) and `CurveInput.onslaughtStacks` (the shared AV
  0x00000395, no AVIF record). EP189 "Mod Damage on Consecutive Hits"
  per-stack values reuse the existing `{ kind: 'stacks', counter: 'onslaught',
  max: 99 }` condition.
- **Engine**: `ResolveContext.onslaughtMaxStacks`, folded once per scenario
  input (`scenarios.ts`) and threaded through every context built after that
  fold; exposed on `ScenarioSet.onslaughtMaxStacks` for the UI. The `onslaught`
  StackCounter reader and the `onslaughtStacks` CurveInput reader share one
  `effectiveOnslaughtStacks` helper (`resolve.ts`) that resolves the `-1`
  "follow max" sentinel and clamps an explicit selection to the computed max.
- **Player state**: `PlayerConditions.onslaughtStacks` sentinel `-1` = assume
  full stacks (default), matching the app's existing assume-max convention
  (`adrenalineStacks`/`bulletStormStacks`). `furiousStacks` (the old dedicated
  Furious ramp input), the `'furious'` StackCounter, and the `'consecutiveHits'`
  CurveInput are RETIRED — nothing else referenced them (verified by grep
  post-extraction); old build URLs degrade gracefully (the codec drops
  unknown `pc` keys).
- **Extractor**: `ENTRY_POINT_BUCKETS` gained "Mod Max Consecutive Hits
  Allowed" → `onslaughtMaxStacks` and "Mod Damage on Consecutive Hits" →
  `dbm` (the latter special-cased in `translateGrantedPerk` to append the
  stacks condition — "Add Actor Value Mult" isn't one of the generic
  Add/Set/Multiply Value functions). `CURVE_INPUT_AVS` gained
  `0x00000395 → 'onslaughtStacks'`, resolving Guerrilla Master's previously
  `_meta.json`-unresolved curve.
- **esm CLI quirk fix**: `repairMisattributedPerkEntryFields`
  (`normalize/mgef.ts`) — Ability+EntryPoint combo PERK records had the Entry
  Point's own Float/Perk-Conditions misattached to the preceding Ability
  entry by the esm tool's JSON serializer (verified via `--raw` byte
  inspection; affects 30 PERK records game-wide, Guerrilla/Gunslinger Expert
  among them). Without this, their EP190 read Float 0 (no max contribution).
- **`p62_` prefix un-junked** (`extract-omods.ts`): it was blanket-excluding
  every `p62_`-prefixed OMOD pre-obtainability, including Splinter's Special
  Effect — a real content prefix (The Drifter boss encounter), not a dev/test
  one. See docs/assumptions.md for the full fallout (a handful of newly
  visible but still-`obtainable:false` legendaries, out of scope here).
- **Splinter/Chaos Engine/Tempest un-hidden, then RE-hidden** (`corrections.ts`
  `hiddenWeaponIds`): the reverse-ref pattern is a script-granted boss drop,
  but the P62 content ("The Drifter") never released — user-confirmed
  2026-07-12. The Splinter's-Special-Effect Onslaught modeling stays in the
  data/tests for whenever P62 ships; the weapons are hidden app-side.
- **UI**: `ConditionsSection`'s "Furious consecutive hits (0–9)" number field
  replaced with an "Onslaught stacks (N / max M)" slider, bounded 0..computed
  max, disabled with a hint when max is 0. Reads the max via
  `useScenarioResults()` (the same derived-results path every other
  DPS-consuming component already uses — no ad hoc `resolveLoadout` call).
- **Badges** (`corrections.ts`): Furious's and Pounder's `pendingMechanic`
  badges removed (both move real numbers now). Combo-Breaker's badge KEPT but
  its comment corrected — it is **NOT** Onslaught (verified: its granted perk
  uses EP79 "Mod VATS Attack Action Points" + EP27 "Mod Power Attack Action
  Points", both `Set Value 0` gated by `GetRandomPercent` vs a GLOB chance — a
  probabilistic AP-cost-reduction effect, unrelated to the shared stack
  counter). Moved out of the Onslaught grouping.

## Contributor summary (see docs/assumptions.md for the full table)

| Source | +max | Per-stack |
|---|---|---|
| Guerrilla Expert | +3 (ranged) | +1%/stack reload speed (extracted correctly; NOT yet functionally wired — see the perk/weapon-stat gap note in assumptions.md) |
| Guerrilla Master | +5 (ranged) | +5%/stack dbm, close range only |
| Gunslinger Expert | +3 (ranged) | +1%/stack weak-spot damage |
| Gunslinger Master | +10 (ranged) | none (its own mechanic is engine-opaque) |
| Furious | +9 | +1%/stack dbm |
| Pounder's | +10 (melee, self-gated) | +1%/stack dbm |
| Splinter's (unique) | +10 | +1%/stack dbm |
| Whacker Smacker (unique) | +0 | +5%/stack power-attack damage |

## Verified (tests)

- Extractor unit tests: EP190/EP189 mapping, the `onslaughtStacks` curve
  route, and `repairMisattributedPerkEntryFields` (all three raw-effects
  patterns — Ability-first misattribution, Entry-Point-first no-op,
  single-effect no-op).
- Engine unit tests: max-stack fold (additive, base 0), the `-1` sentinel,
  explicit-stack scaling, over-max clamping, zero-sources-equipped inactivity,
  and the Whacker-Smacker-style curve reading the shared counter.
- Real-data tests (`buffs-legendary.test.ts`): Furious, Pounder's, Splinter's,
  Guerrilla Master, Gunslinger Expert, and Whacker Smacker all verified
  against the actual extracted 20260702-dump modifiers, plus a multi-source
  max-stack aggregation (Furious + Guerrilla Expert → 9 + 3 = 12).

## Still open (not this pass)

- Guerrilla Expert's reload-speed bonus is extracted correctly but inert —
  fixing it means wiring perk-sourced weapon-stat buckets into
  `buildEffectiveWeapon`'s fold, a pre-existing gap shared with several other
  perks (`GHL_GunTricks`, `GroundPounder`, `MartialArtist`), not Onslaught-
  specific. Left as a known gap (docs/assumptions.md).
- ~~The newly-un-junked `p62_` legendary weapon mods (Ruiner's, Sightseer's,
  Brutalist's, Satiated) extract `obtainable: false` — needs its own
  obtainability review pass~~ RESOLVED 2026-07-12: the whole P62 drop never
  released (user-confirmed), so `obtainable: false` is correct as-is — no
  rescue, no review needed until P62 ships.
- Gunslinger Master's "gain stacks over time / spend on attack" behavior
  stays engine-opaque (max-stack contribution only, per-stack mechanic
  unmodeled — no ESM footprint beyond EP190 to model against).
