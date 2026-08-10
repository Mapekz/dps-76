# The suggestions sweep does not prune candidates

Issue #76's L2 candidate pruning recorded which `Bucket`s one full baseline
resolve+scenario pass actually queried (a mutable read-set threaded through
`ResolveContext` and into `resolveLoadout`/`assemble`/`buildEffectiveWeapon`/
`derivePlayerStats`), then skipped any perk/armor/mutation/consumable
candidate whose entire possible modifier contribution was disjoint from that
read-set — such a candidate provably cannot move any scenario result.

Sound, but not worth its cost. `028f8ed` (the commit that shipped it) measured
L2 pruning at only ~5–10% off the ~24ms sweep — still well over the 8ms
"plain useMemo" bench tier — and moved `evaluateSuggestions` to a dedicated Web
Worker (L3) in the *same commit* instead, which removes the latency budget
question entirely rather than reducing the sweep's cost. Benched again
2026-08-10: the full sweep is 26.97ms; the pruning saved 1.5–2.7ms of it. On a
debounced background thread, that's not perceptible.

What it cost to keep: the read-set threaded as a mutable `Set<Bucket>` through
`ResolveContext` and four function signatures across 6 files (`resolve.ts`,
`scenarios.ts`, `effective-weapon.ts`, `player-stats.ts`, `loadout.ts`,
`evaluate.ts`), a per-candidate touched-buckets field on every suggestion
candidate (3 files), a test-only escape hatch to disable pruning, and — the
real tell — a hand-maintained always-in-scope bucket list to compensate for
`buildEffectiveWeapon`'s early-return fast path (no OMODs, no weapon-stat-bucket
loadout modifiers), which the recorder structurally cannot see through: a
baseline that takes the fast path records none of those buckets, but a
candidate that adds e.g. a `reloadSpeed` modifier is exactly what flips it.

Decision: delete L2 pruning rather than keep or reshape it. The sweep now
evaluates every candidate directly; the loop in `evaluateSuggestions`
(`src/lib/suggest/evaluate.ts`) is five lines.

## Do not undo this

A future reviewer might reasonably want to reintroduce read-set pruning,
possibly reshaped after the `trace.ts` pattern (an opt-in flag returning data,
rather than a mutable sink threaded through the engine) — don't, unless the
sweep's cost model changes (e.g. it moves back onto the main thread, or the
candidate count grows enough that even worker time matters). Even reshaped,
`buildEffectiveWeapon`'s early-return blind spot has no equivalent trace
plumbing today, so a hand-maintained always-in-scope list would still be
required — that gap, not just the threading style, is why pruning isn't worth
it at the current cost/benefit.
