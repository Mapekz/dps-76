# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: Fallout 76 min-maxer theorycrafters — players optimizing a loadout
(weapon, perks, OMODs, legendary effects, mutations, consumables) to maximize
DPS before committing scarce in-game resources (SCRIP, legendary rerolls,
perk points) to that build. They already understand the domain vocabulary
(crit, sneak, power attack, weakpoint, tenderizer, DBM) and commonly arrive
with an existing build imported from Nukes & Dragons rather than starting
from a blank config.

## Product Purpose

Computes the full paper-damage formula for a Fallout 76 player build — crit,
sneak, power attack, weakpoint, tenderizer, legendary effects, mutations,
consumables — across Free Aim / VATS scenarios (sneak is a player condition,
not a third scenario), using game data extracted directly from the game's
ESM rather than hand-authored or community-estimated. Success is a build's
exact DPS that a min-maxer can trust before spending resources in-game, plus
concrete suggestions for how to improve it.

## Positioning

Not one differentiator but a bundle the incumbent tools (community
spreadsheets, other FO76 DPS calculators) split across, never combine:

1. **ESM-accurate** — every number is extracted from the game's own data
   files, not hand-guessed or community-estimated.
2. **Fast iteration** — change one input, see the number move immediately.
3. **Prescriptive** — surfaces concrete suggestions for improving the
   current build, not just a static readout.
4. **Working toward mechanic completeness** — already models crit, sneak,
   power attack, weakpoint, tenderizer, legendary effects, mutations,
   consumables, and enemy resist mitigation together.

## Operating Context

Players arrive either building a loadout from scratch or importing an
existing one via a Nukes & Dragons build URL (`p=` perk loadout, `s=` SPECIAL
as hex). They iterate on weapon/OMOD/perk/legendary/mutation/consumable
choices and read the resulting per-scenario damage breakdown, multiplier
chain, and suggestions panel. Dark mode is the default reading environment.

## Capabilities and Constraints

- Outgoing DPS plus enemy resist mitigation (DR/ER); the Live/PTS mode
  toggle exists in the UI but stays disabled until a PTS ESM dump is
  extracted.
- Game data (weapons, perks, OMODs, mutations, consumables) is extracted
  from the game's ESM file, not hand-authored; wrong or missing values are
  patched in a documented overrides layer, never silently guessed.
- Build suggestions surface concrete alternative choices, not only a number.

## Brand Commitments

- Name: "DPS-76". Currently marked with an "Alpha" badge in the header,
  signaling active, incomplete-but-usable status.
- Visual identity (color, typography, dark-mode-default, component specs) is
  specified authoritatively in [`DESIGN.md`](./DESIGN.md) — not repeated here.

## Evidence on Hand

- Nukes & Dragons build-URL import is a real, shipped integration
  (`src/lib/nukes-dragons.ts`), not aspirational.
- Golden test cases (`src/lib/engine/__tests__/golden/cases.json`) pin engine
  output against real in-game measured numbers — concrete proof the tool is
  accuracy-checked, not only internally consistent.
- No testimonials, customer logos, press, or pricing exist or should be
  fabricated — this is a free, unbranded community tool.

## Product Principles

1. Correctness over convenience: every displayed number must be traceable to
   ESM data or a documented, sourced override — never a plausible guess.
2. Prescriptive, not just descriptive: the product should tell a min-maxer
   what to change, not only report what they configured.
3. Power-user vocabulary today, broader accessibility as a trajectory:
   current copy/density can assume domain fluency, but future work should
   look for ways to lower that floor rather than deepen it further — design
   for eventual onboarding of players who don't already know terms like
   "weakpoint bonus" or "DBM", even though today's build stays
   power-user-first.
4. MVP scope is a deliberate cut, not a deficiency: outgoing-DPS-only and
   Live-only are intentional narrowing to ship something trustworthy first,
   not silently missing functionality.

## Accessibility & Inclusion

No product-specific accessibility requirement established yet. Design
should keep the stated broader-onboarding trajectory in mind (Product
Principles) rather than assume permanent power-user-only density.
