# Engine layer is data-adapter-free; composition happens in src/lib

The damage engine (`src/lib/engine/*`) imports only `@/types` and pure helpers
(`curve-tables`) — never the data adapters (`@/data/*`). This is what lets the
engine be unit-tested with synthetic weapons and hand-fed Modifier IR, with no
game data loaded.

Consequently, code that bridges game data to the engine — resolving a
`PlayerConfig` into the engine's `ScenarioInput` — lives one layer up in
`src/lib` (`resolveLoadout` in `src/lib/loadout.ts`), not under `src/lib/engine/`.
`resolveLoadout` is the one sanctioned `@/data → engine` composition point; both
the `useDamageCalc` hook and the golden-case harness go through it.

A future reviewer might reasonably want to co-locate `resolveLoadout` with the
engine (it is engine input, after all) — don't. Moving it under
`src/lib/engine/` would make the engine import `@/data` and forfeit the
synthetic-data testability the current split buys.
