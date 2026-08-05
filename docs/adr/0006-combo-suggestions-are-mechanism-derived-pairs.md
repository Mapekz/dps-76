# Combo Suggestions discover multi-piece synergies via mechanism-derived pairs

The suggestion sweep (`src/lib/suggest/`) stays a greedy single-step ladder — it
enumerates atomic build changes, evaluates each, and ranks by DPS delta. This is
structurally blind to multi-piece synergies: on slow weapons, no single
Onslaught piece charts positive delta (Furious ≈ 0 because forward sustained
stacks ≈ 0; Gunslinger Master ≈ 0 because it enables stacks but carries no
payoff), yet the pair is 2× the best charted build. The ladder self-heals,
though — verified 2026-07-31 on auto Fixer clean state: Furious charts at
+31.8% immediately, and the rest climb via single steps.

A registry in `src/lib/suggest/combos.ts` solves the anchor problem by
deriving pairs from the mode's extracted modifier data — one counter + cap
bucket (`onslaughtMaxStacks`, etc.) + at least one per-stack payoff signature
discovered from active modifiers. Each pair is evaluated as a single
multi-action candidate in `src/lib/suggest/evaluate.ts`, surfacing only past
the dominance filter: no constituent single may chart on its own AND the pair
must beat the best of them by the existing 1% tie threshold. The first clause
is load-bearing — pair synergy is superlinear, so on fast weapons a pair
beats its best single even though the ladder works fine there (auto Fixer:
Furious alone charts +31.8%, so every Furious pair is suppressed as
redundant). Pairs suffice because one opens the door; the ladder climbs the
rest.

Evaluation cost stays cheap — see `combos.ts`'s own doc-comment for the
benchmark.

## Do not undo this

A future reviewer might reasonably want to replace the ladder with multi-ply
beam search (exploring all 2-tuples, 3-tuples, …) — don't. 643² ≈ 400k evals
per sweep is seconds of work behind a 300 ms debounce; pairs already unlock
every door the ladder can then climb one step at a time.

Or hand-curate pair lists to avoid machinery — don't. Piece discovery reads the
cap/enabler buckets and per-stack payoff signatures from the mode's dataset
(`src/lib/suggest/combos.ts`), so ESM re-extraction keeps pairs current. A
curated list would silently rot and require re-curation on every patch.

Or gate combos on stack-simulation internals (e.g. heuristics like "forward
sustained ≈ 0") — don't. The dominance filter in `src/lib/suggest/evaluate.ts`
is the only gate, and it needs no knowledge of why singles score low. Coupling
suggest/ to onslaught-sim internals would break portability when the next
stack-like mechanism is added to the registry.
