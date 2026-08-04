# Kill-streak and other exogenous counters keep zero defaults

Kill-streak-scaling effects — Barbarian (+1 STR/kill), Mind Over Matter (+1
INT/kill), the Adrenal family (+10% dbm/kill), Thrill-Seeker's — read as
contributing nothing by default because `PlayerConditions.killStreak` defaults
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

Rejected alternatives:

- A flat non-zero default (e.g. "assume 10 stacks") — would overstate
  single-target boss DPS, the exact class of error ADR 0005 exists to prevent,
  just running in the opposite direction (over- instead of under-recommending).
- Deriving the default from the selected target (boss race → 0, trash →
  sustained) — most correct in principle, but the extracted enemy race data
  (`npcs.json`) has no boss/rank flag today (only `epicAllowed`); would
  require a new hand-maintained boss-race override list.
- Waiting for TTK modeling (issue #51) to produce a genuine simulated kill
  rate — the only route to an honest non-zero default, but not ready yet.

What ships instead is a presentational fix only: the OMOD picker and perk
editor now show the ceiling value via `describeBuffModifiers`
(`src/lib/buff-description.ts`), e.g. "0–+10 Strength (scales with kill
streak)", so the effect no longer *looks* inert even though it correctly
contributes `0` at the default. The engine and the suggestion sweep
(`src/lib/suggest/`) are unchanged — ADR 0005's coupling between display and
the sweep is preserved, not split: kill-streak effects are still genuinely
absent from suggestions at a 0 streak, which is correct, not a gap.

`PlayerConditions.adrenalineStacks` was renamed to `killStreak` in the same
change, matching the game's own Actor Value name (`0x00000399`) — it was
misleading because Barbarian/Mind Over Matter/Thrill-Seeker's read it and have
nothing to do with the "Adrenal" mechanic family. No backward-compat alias was
added in the persistence codec (`src/lib/persist/codec.ts` decodes
`PlayerConditions` fields by name); old share URLs that pinned a kill-streak
value silently reset to `0` on decode.

## Do not undo this

A future reviewer might reasonably want to give `killStreak` the same
`−1`-sentinel/auto treatment as Onslaught/Bullet Storm (ADR 0005) — don't,
until real TTK/kill-rate modeling exists to back a genuine sustained value; a
fabricated one would misrepresent boss DPS. Don't special-case kill streak
differently from the other exogenous knobs listed above either — the
zero-default rule applies uniformly.
