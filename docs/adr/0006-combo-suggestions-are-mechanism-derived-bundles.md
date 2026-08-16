# Combo Suggestions are mechanism-derived bundles

The suggestion sweep (`src/lib/suggest/`) stays a greedy single-step ladder —
it enumerates atomic build changes, evaluates each, and ranks by DPS delta.
That ladder is structurally blind to multi-piece stack-mechanism payoffs: on
slow weapons, no single Onslaught piece charts positive delta (Furious ≈ 0
because forward sustained stacks ≈ 0; Gunslinger Master ≈ 0 because it enables
stacks but carries no payoff), yet the full package is ~2× the best charted
build. On fast weapons the ladder self-heals — verified 2026-07-31 on auto
Fixer clean state: Furious charts at +31.8% immediately — but the pair-era
design hid the aggregate ceiling there (Furious alone +31.8%, full Onslaught
package ~+110%).

Decision: the sweep also enumerates one **bundle** candidate per registered
mechanism — "Full Onslaught", "Full Reverse Onslaught", "Full Crit Cadence"
(VATS-emphasis only), "Full Bullet Storm" — assembled greedily from unequipped
pieces (perks, weapon legendary effects, and SPECIAL allocation pieces)
discovered from the mode's extracted modifier data, never hand-curated lists.
The registry lives in `src/lib/suggest/combos.ts`.

Visibility is gated by a policy flag (`COMBO_GATE_POLICY` in
`src/lib/suggest/evaluate.ts`): `'positive'` (default — the bundle charts
whenever its delta > 0), `'margin'` (must beat its best constituent single by
the 1% tie threshold), `'door-closed'` (the historical pair rule: only when no
constituent charts alone). Unconditional regardless of policy: a bundle adding
fewer than 2 new pieces is never emitted — it would just be the single
suggestion.

The **endogenous-vs-exogenous** criterion: a mechanism earns a bundle iff its
payoff is gated on an endogenous quantity the build's own pieces move
(Onslaught sustained stacks, crit cadence via Luck/crit-meter, Bullet Storm
stacks via magazine size). Synergies gated on exogenous condition sliders
(Bloodied/Nerd Rage via `healthPercent`, Juggernaut via high HP, Adrenaline via
`killStreak` — ADR 0009's exogenous counters) get no bundle: simulation on
2026-08-16 confirmed the single-step ladder handles them once the human sets the
condition (at `healthPercent` 20, Unyielding ×5 charts +118.5% alone; at
`killStreak` 10, Adrenaline charts +23.1% alone; at the defaults all those
pieces chart 0 and a bundle could not change that, since bundles must not
touch condition sliders).

This ADR previously specified mechanism-derived **pairs** with a two-clause
dominance filter (pairs as door-openers only, verified 2026-07-31). Bundles
subsume the door-opening role and additionally surface the aggregate ceiling.
The old two-clause rule survives as the `'door-closed'` policy value.

v1 scope: bundle pieces are perks, weapon legendary effects (first-empty-slot
placement only — no replace variants inside bundles), and SPECIAL allocation;
armor-effect pieces are a documented follow-up. Bundles are built as a
surface-agnostic primitive intended for reuse by a future "build assistant" NUX
(out of scope here).

## Do not undo this

A future reviewer might reasonably want to replace the registry with
hand-curated piece lists — don't. They rot on every ESM patch — discovery reads
buckets/conditions from the mode's dataset (`src/lib/suggest/combos.ts`); a
census drift test enforces registry coverage.

Or hardcode the gate — don't. Policy stays a single flag in
`src/lib/suggest/evaluate.ts`.

Or add bundles for exogenous-condition synergies — don't. Cite the
endogenous-vs-exogenous criterion above; at default slider values those pieces
chart 0 and a bundle cannot change that without touching condition sliders.
