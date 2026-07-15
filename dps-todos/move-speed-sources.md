# Movement-speed sources → `moveSpeedBonus` sweep

Fast Fighter ("50% of bonus movement speed as reload speed",
`overrides/perk-overrides.ts`) reads the `moveSpeedBonus` bucket, which today
only auto-derives from AV `SpeedMult` routes that extract cleanly
(`normalize/mgef.ts`, 2026-07-15). The user wants **every non-sprinting
movement-speed bonus** modeled so Fast Fighter's input is complete.

## Modeled today

- Speed Demon (mutation): +20% / +25% with Strange in Numbers
  (`Mutation_FortifyMoveSpeed`, conditions translated from
  UseNormalVersion/UseSuperVersion).
- Wasteland Fish Sandwich (consumable): +20%, unconditional.

## Extracted but inert (unresolved sprint/state gates — decide each)

These carry `unresolved` conditions today, so the engine skips them. For each:
walk the ESM gate, decide whether it's sprint-only (out of scope for Fast
Fighter per user decision) or a modelable state (add a Condition kind), and
either translate the gate or document the exclusion.

- Freight Train r1 (+10%) — gate looks sprint-shaped
- Dead Man Sprinting r1/r2 (+10/+20%, healthBelowPct + unresolved)
- Jaguar Speed r1/r2 (ghoul, +10/+20%, glowAtLeast + unresolved)
- Gun Runner r1/r2 (+10/+20%, weaponKeyword + unresolved)
- Spotlight Player Perk (+15%, unresolved ×2)
- Portable Power r1–r3 (+10/20/30%, unresolved ×2 — power armor?)
- Squad Maneuvers r1/r2 (+10/+20%, teammateCount + unresolved)
- Wasteland Survival 1 r7–r9 (magnitude 100?! — verify AV/scale before ever
  translating; smells like a different SpeedMult convention)

## Not yet swept (no SpeedMult MGEF extracted, or outside current extractors)

- Armor / power-armor OMODs with move-speed properties (Calibrated Shocks
  et al. are carry-weight; check for genuine speed legs mods) —
  dps-todos/armor-mods-outgoing.md overlap.
- Food/drink buffs beyond the fish sandwich (speed-themed foods, events).
- Chems (e.g. any Speed-branded variants) and their addiction penalties
  (negative SpeedMult — penalties currently clamp out of Fast Fighter via
  the curve's (0,0) endpoint; revisit if the game says otherwise).
- Weight-class / encumbrance movement modifiers (engine-native, likely no
  MGEF — probably out of scope, document if so).

## Open question (measurement)

Does the in-game Fast Fighter conversion count sprint-only bonuses while not
sprinting? Current model says no (they're gated out). A reload-time stopwatch
with Fast Fighter + Freight Train equipped, standing still, would settle it.
