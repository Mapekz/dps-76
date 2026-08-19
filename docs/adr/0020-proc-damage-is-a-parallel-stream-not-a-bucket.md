# Proc-triggered damage is a parallel stream, not a Bucket

Electrician's, Fracturer's, and Circuit Breaker each cast a genuinely
separate SPEL on trigger (a reload-animation-state fan-out, an on-cripple
Entry-Point-201 spell, a last-round Entry-Point-51 combat-hit spell) rather
than modifying the weapon's own paper-damage formula. A `Modifier`
(`src/types/modifiers.ts`) is one scalar folded by `foldOps` into a
`Bucket` — it has no room for a proc's multiple damage components, its own
cadence model, or its total independence from dbm/crit/sneak. Forcing a
proc into that shape would mean either flattening multi-component damage
into one number (losing per-type resist routing) or inventing a `Bucket`
whose fold semantics don't compose with anything else in `foldOps`'s
parenthesis.

This is why `addDamageComponent` — an earlier, unused `Bucket` stub for
exactly this kind of "extra damage that isn't a normal per-hit component" —
was correctly removed as dead code in `47e80d4` (no reader anywhere in the
codebase). It was the wrong shape before procs existed to need it; it would
still be the wrong shape now.

Decided instead: procs are `Weapon.procs: ProcSource[]`
(`src/types/procs.ts`), folded by `computeProcDps`
(`src/lib/engine/proc-damage.ts`) into `ScenarioResult.procDps` — exactly
parallel to the existing `dotDps`/`computeDotDps` treatment. `dotDps` is
proven prior art for "a steady-state damage number that lives beside
`perHit`/`burstDps`/`sustain` rather than folding into them": it is NOT
summed into `sustainedDps` (`docs/assumptions.md` "Weapon-intrinsic DoT &
OMOD replacement"), and `MultiplierChainTable.tsx` already renders it as
its own `+X/s` row. `procDps` gets the identical row treatment, one below
it.

`ProcSource.conditions` are gate-only (`conditionsActive`, `resolve.ts`) —
they decide whether a proc fires at all, never scale its magnitude the way
a `Modifier`'s conditions can. `GeneratedProc` carries no condition data by
design (the trigger classification itself — `reloadCycle`/`lastRound`/
`onCripple` — already IS the gating semantic extracted from the ESM), so
every proc today has `conditions: []`; the field exists for a future proc
whose ESM chain does carry a real gate.

## Do not undo this

A future reviewer chasing a fourth proc-like unique might be tempted to
route its damage through a new `Bucket`/`dbm` ADD instead of extending
`ProcSource`/`computeProcDps` — don't. The moment a "damage" fold needs its
own cadence model independent of the weapon's own fire rate (procs fire
once per magazine cycle or once per crippling hit, not once per shot) or
needs to skip the dbm/crit/sneak parenthesis entirely, it has left
`Bucket`'s problem domain and belongs in the parallel-stream shape this ADR
establishes — same reasoning that makes `dotDps` its own field rather than
a `Bucket`.
