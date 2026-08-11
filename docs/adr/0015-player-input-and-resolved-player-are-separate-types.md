# The persisted player input and the resolved engine view are separate types

`PlayerConditions` was one type serving three roles: persisted user input,
derived engine state, and the `PLAYER_STATE_READERS` lookup surface. The codec
re-separated the first two after the fact, via a hand-maintained *negative* set
of derived keys.

The real problem was narrower and worse than input-vs-derived. `playerAgg`
(`src/lib/loadout.ts`) returns `{ ...conditions, ...special, maxHealth, ...,
playerDamageResist: damageResistGain, ... }` — a view that overlays computed
values onto stored ones **under identical keys**. Eight fields genuinely meant
two different things depending on where you read them:

- **`playerDamageResist`** is the manual Berserker's knob, the fold base *and*
  the folded output. `derivePlayerStats` folds `damageResistGain` over
  `player.playerDamageResist` as its base, and `playerAgg` writes the result
  back onto that same key.
- **The seven SPECIAL keys** hold budget-enforced base allocation (1–15) in
  `BuildState`, and buff-folded effective SPECIAL in the engine view.

Nothing marked the crossing, so `p.strength` meant different numbers on either
side of `resolveLoadout` with nothing in the types to say so.

Decision: **`PlayerInput` and `ResolvedPlayer` are distinct types**
(`src/types/player.ts`), with `PlayerConditionContext` naming the intermediate
— `PlayerInput` plus the derived gates the SPECIAL folds themselves need.

- `BuildState`, the reducer, the codec and the knob registry take `PlayerInput`.
- `ResolveContext.player`, `PLAYER_STATE_READERS` and `ScenarioInput.player`
  take `ResolvedPlayer`.
- `buildEffectiveWeapon` no longer defaults its `player`/`enemy` arguments.
  Those defaults existed so tests could write `buildEffectiveWeapon(smg,
  [perfectStorm])`, but they also meant a production caller who forgot an
  argument silently got synthetic test values instead of a compile error. Tests
  use an explicit fixture factory
  (`src/lib/engine/__tests__/resolved-player-fixture.ts`) instead.

The glossary entry is **Resolved Player** in `CONTEXT.md`, with both
two-meaning collisions recorded under Flagged ambiguities.

## Known cost

The split widens `PlayerConditionContext` to `ResolvedPlayer` at three points
per suggestion candidate (`toResolvedPlayer`), which the single type did not
need. Measured on the suggestions sweep: **~27.0 ms → ~28.5 ms**, about 5%,
after hoisting the synthetic defaults to a module constant and removing a
double-widening inside `derivePlayerStats`.

This was accepted, not overlooked. If it needs recovering, the fix is to type
`ResolveContext.player` as the context plus *optional* derived fields and give
the readers fallbacks, so the bootstrap path stops materialising a full
`ResolvedPlayer` it only partly uses — a larger change than the split itself,
and not worth bundling with it.

## Do not undo this

Don't re-merge the two types "because most fields are the same." Most fields
being the same is precisely why the eight that differ were invisible for so
long.

Don't reintroduce default arguments on `buildEffectiveWeapon` to shorten test
call sites. Use the fixture factory; the defaults were a production hazard, not
a convenience.

Don't try to "fix" `playerDamageResist` by renaming one side without checking
`derivePlayerStats`'s fold base — the knob is deliberately both the base and,
after folding, the output. This ADR makes that visible; it does not change it.
