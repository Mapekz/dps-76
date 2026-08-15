# Kill-streak and other exogenous counters keep zero defaults

Kill-streak-scaling effects — Barbarian (+1 STR/kill), Mind Over Matter (+1
INT/kill), the Adrenal family (+10% dbm/kill), Thrill-Seeker's — read as
contributing nothing by default because `PlayerInput.killStreak` defaults
to `0`. That looks identical to a bug. Compare ADR 0005: Onslaught and Bullet
Storm stack sliders default to `−1` ("auto"), which resolves to a non-zero
simulated **Sustained Stacks** average, not to their own worst case.

The `0` default for `killStreak` — and the same-shaped exogenous knobs
(`capsOnHand`, `addictionCount`, `tenderizerStacks`, `concentratedFireStacks`,
`feralTier`, `followThroughPct`, `takingOneForTheTeamPct`) — is correct and
stays. **Only counters the engine can simulate a steady state for
(endogenous — accrue from the player's own hit-events/ammo-spent: Onslaught,
Bullet Storm) get an auto/sustained default. Counters that depend on
information the engine doesn't model (exogenous — kill streak depends on
enemy HP/time-to-kill, which is out of scope per issue #51's TTK-modeling
parking) keep an honest zero/no-benefit default.**

What ships instead is a presentational fix only: the OMOD picker and perk
editor now show the ceiling value via `describeBuffModifiers`
(`src/lib/buff-description.ts`), e.g. "0–+10 Strength (scales with kill
streak)", so the effect no longer *looks* inert even though it correctly
contributes `0` at the default. The engine and the suggestion sweep
(`src/lib/suggest/`) are unchanged — ADR 0005's coupling between display and
the sweep is preserved, not split: kill-streak effects are still genuinely
absent from suggestions at a 0 streak, which is correct, not a gap.

`PlayerInput.adrenalineStacks` is named `killStreak` (matching the
game's own AV name, `0x00000399`) precisely because Barbarian/Mind Over
Matter/Thrill-Seeker's read it too and have nothing to do with the
"Adrenal" mechanic family. No backward-compat alias exists in the
persistence codec — a pre-rename share URL silently resets this field to
`0` on decode.

## Do not undo this

A future reviewer might reasonably want to give `killStreak` the same
`−1`-sentinel/auto treatment as Onslaught/Bullet Storm (ADR 0005) — don't,
until real TTK/kill-rate modeling exists to back a genuine sustained value; a
fabricated one would misrepresent boss DPS. Don't special-case kill streak
differently from the other exogenous knobs listed above either — the
zero-default rule applies uniformly.
