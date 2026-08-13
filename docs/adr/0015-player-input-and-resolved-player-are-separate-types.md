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
- `ScenarioInput.player` takes `ResolvedPlayer`. `ResolveContext.player` and
  `PLAYER_STATE_READERS` take the wider `ResolveContextPlayer` (see "Known
  cost, resolved" below) — a `ResolvedPlayer` is always a valid value for it.
- `buildEffectiveWeapon` no longer defaults its `player`/`enemy` arguments.
  Those defaults existed so tests could write `buildEffectiveWeapon(smg,
  [perfectStorm])`, but they also meant a production caller who forgot an
  argument silently got synthetic test values instead of a compile error. Tests
  use an explicit fixture factory
  (`src/lib/engine/__tests__/resolved-player-fixture.ts`) instead.

The glossary entry is **Resolved Player** in `CONTEXT.md`, with both
two-meaning collisions recorded under Flagged ambiguities.

## Known cost, resolved

The split originally widened `PlayerConditionContext` to `ResolvedPlayer` via
a small helper, at two bootstrap points (`derivePlayerStats`,
`buildEffectiveWeapon` — not three; an early doc comment overstated this).
Measured on the suggestions sweep: ~27.0 ms → ~28.5–28.8 ms, about 5%.

This was accepted, not overlooked, but the write-up understated how cheap the
fix was: `ResolveContext.player`'s type is now `ResolveContextPlayer`
(`PlayerConditionContext & Partial<DerivedPlayerFields>`,
`src/types/player.ts`) rather than a full `ResolvedPlayer`, and
`PLAYER_STATE_READERS`' derived-field readers fall back (`resolve.ts`). 8 of
the 9 derived fields already coalesced to a value identical to the old
synthetic default; `addictionCount` needed one added `?? 0`. Total change:
one new type, a handful of signature widenings, and deleting the two
widening calls plus the helper itself. Bench back to ~27.7–29.7 ms
— noisy around the pre-split baseline, not the earlier `larger than the split
itself` fix this section used to describe.

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
