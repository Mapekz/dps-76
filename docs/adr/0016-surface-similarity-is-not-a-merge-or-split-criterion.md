# Surface similarity is not a merge or split criterion

A codebase-simplification review (2026-08) proposed splitting
`computeScenarios` (`src/lib/engine/scenarios.ts`) into four helper functions
and merging `CheckboxRow`/`PerkRow`/`ArmorEffectRow` into one shared row
component. Both proposals were wrong, and both failed the same way: something
that *looked* like duplication — a long function, three components with the
same visual shell — was mistaken for something that *is* duplication, without
checking whether the pieces actually share structure.

`computeScenarios` reads as one 430-line tangle on a length count alone. Read
as code, it is a linear compute-once-then-thread pipeline: fire rate and range
falloff computed once, Onslaught/Bullet Storm stack caps bootstrapped once via
a flag-agnostic context, then threaded through free/VATS hit computation,
crit-meter, sustain, AP economy, and mitigation in sequence. Its doc-comments
explicitly cross-reference each other's precedent (`bashAnimationSec` folded
once, "same precedent as `onslaughtMaxStacks`/`rangeMult` above"). Splitting it
into `bootstrapStackSummary`/`computeHitCycles`/`computeApBlock`/
`computeMitigationBlock` would have required either 10-parameter signatures or
an invented context object to carry `fireRate`, `bodyPartMult`,
`targetBodyPart`, `rangeMult`, `tracing`, `caps`, `bashAnimationSec`,
`bootstrapCtx`, and `freeGeom` between the pieces — trading "scroll one file
where each value is defined just above its use" for "jump between four files
reconstructing what's in the bag." Long-and-linear over shared local state is
the readable kind of long.

`CheckboxRow`, `PerkRow`, and `ArmorEffectRow` share a visual shell
(`bg-muted/40 rounded-none px-2 py-1 text-sm`, a truncating label, a
`NoEffectBadge` slot) and nothing else. `CheckboxRow` is push — pure
presentational, 8 props, no hooks. `PerkRow` is a pull container taking one
domain entity and calling `useBuildDispatch`. `ArmorEffectRow` is a pull
container taking a single prop, calling three hooks, and branching into two
entirely different renders depending on `effect.maxCount === 1`. A merged
component would need a props union spanning presentational-vs-container and
four distinct control types — a twelve-prop boolean-flag explosion, strictly
worse than the three components it would replace.

Decision: before splitting a file or merging components on the strength of
"these look similar" or "this is long," check the thing the similarity
argument actually depends on:

- **Split** only when the candidate pieces share no local state. If splitting
  needs a parameter list longer than the function it's replacing, or an
  invented carrier object, the length is essential (the pieces are one
  computation), not accidental.
- **Merge** only when the candidates' prop/parameter shapes are congruent and
  neither has an internal branch the other lacks. Two things that render the
  same className string are not the same component if one is push and the
  other is pull, or if one branches on a case the other never sees.

Extract shared *fragments* (the `<Row>` shell, a `tracedFold` helper) instead
of forcing shared *components* — that captures the real duplication (styling,
boilerplate) without inventing a false abstraction over things that only look
alike from a distance.

## Do not undo this

Don't propose splitting `computeScenarios` again on a line-count argument
alone. If a genuine seam appears later — a piece that provably shares no local
state with the rest — split that piece specifically, and say what state it
doesn't share, not "the function is long."

Don't merge `CheckboxRow`/`PerkRow`/`ArmorEffectRow` into one row component.
Extract shared *presentational* pieces (a `<Row>` shell) if the visual
duplication is worth removing; keep the three components' distinct data flow
(push vs. pull) and control types separate.

Don't treat "N places do something visually similar" as sufficient grounds for
a merge or split proposal in a review. State what the pieces would need to
share (parameters, branches, state) and verify it against the actual code
before proposing the change — a review whose findings (what exists) were
correct 6 for 6 still had its recommendations (what to do) wrong 4 of 6 by
skipping this check.
