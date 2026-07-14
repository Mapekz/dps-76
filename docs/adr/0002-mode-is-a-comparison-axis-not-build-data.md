# Mode is a comparison axis, not build data

`GameMode` (`live` | `pts`) lives in `GameModeContext` (`src/hooks/useGameMode.tsx`)
and is threaded as a parameter everywhere the data/engine layers need it
(`resolveLoadout(config, mode)`, every `@/data` accessor, `makeBuildReducer(mode)`).
It is deliberately **not** a field of `BuildState`, and is never written to the
URL/localStorage codec (`src/lib/persist/codec.ts`).

The live/pts switcher's purpose is to hold a build fixed and vary the game-data
version, to compare how a formula/calculation change affects that SAME build.
The user-selectable parts of a build — which weapon, which perks and their
ranks, which OMODs, which SPECIAL allocation — are assumed compatible across
Live and PTS; only the computed *effects* of those choices (bucket values,
formulas) are expected to differ. That makes Mode an axis you evaluate a build
*at*, not a property a build *has* — two builds that are otherwise identical
but differ only in Mode aren't meaningfully different builds, they're the same
build viewed twice.

A future reviewer might reasonably want to fold `mode` into `BuildState` (the
reducer needs it for perk-budget/race rules, after all — see
`makeBuildReducer` in `src/state/build-reducer.ts`) or into the persisted
codec (so a shared build URL "pins" the mode it was authored in) — don't:

- Folding it into `BuildState` would make "switch to PTS" a build EDIT instead
  of a lens change, and would need a persistence rule for what a shared link
  between two people on different modes should do.
- Persisting it would force whoever opens a shared link into the author's
  mode, which is backwards for a comparison tool — a recipient should see the
  build in THEIR mode by default.

Instead, `makeBuildReducer(mode)` is a factory: `BuildProvider` re-derives the
reducer (memoized) from `GameModeContext`'s active mode, so the reducer always
sees the right mode for its perk-registry-dependent rules without Mode ever
entering the state it operates on. `resolveLoadout`/`computeScenarios` keep
Mode as a plain parameter for the same reason — a future side-by-side
live/pts comparison is just `resolveLoadout(config, 'live')` next to
`resolveLoadout(config, 'pts')` on the identical `config`.

Out of scope for this ADR (a real future feature, not decided here):
surfacing an actual build INCOMPATIBILITY across modes — a perk that vanished,
changed cost, or moved SPECIAL — instead of silently dropping it the way
`keepForRace` already does for race mismatches. The Mode-as-parameter seam is
what makes that feature possible later; building it is separate work.
