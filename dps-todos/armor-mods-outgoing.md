# TODO: Armor Mods — Outgoing Damage (P1)

## What
Armor mods/legendary effects that boost the *player's* outgoing damage, as
distinct from incoming-damage mitigation ([armor-mods-incoming.md](armor-mods-incoming.md),
which is blocked on enemy mitigation landing). This half has nothing blocking
it — can build now.

## Current state
`ArmorConfig`, `ArmorSlotConfig`, `ArmorPiece`, `ArmorMod` types exist in
`src/types/index.ts`. No armor data is populated, and armor is not factored
into damage calculations at all (`src/lib/loadout.ts` never reads
`playerConfig.armor`).

## Mods to add
- **Unyielding**: +1 to all SPECIAL except Endurance when below ~20% HP.
  Feeds the existing STR melee-scaling term (`strengthTerm()` in
  `paper-damage.ts`) and the SPECIAL fold (`derivePlayerStats`,
  `src/lib/loadout.ts:105-115`) the same way consumable SPECIAL buffs already
  do — likely a new `scaledByMissingHealth`-gated SPECIAL-bucket modifier,
  reusing the `scaledByMissingHealth` condition kind already used for Bloodied.
- **Zealot's**: +damage vs Scorched/Scorchbeast. Needs an `enemyType`/
  `enemyTypeAny` condition value for these two factions — same condition kind
  phase-3-enemies.md plans to activate via `EnemyProfile`, but Zealot's could
  ship with a manual "vs Scorched/Scorchbeast" checkbox in the interim
  (matching the project's pattern of shipping a manual toggle before the full
  enemy-aware condition system lands elsewhere, e.g. `isSneaking`).

## Where to implement
1. New `Bucket`/condition wiring per the CLAUDE.md new-mechanic checklist:
   bucket or reuse of `scaledByMissingHealth` in `src/types/modifiers.ts`,
   evaluation in `resolve.ts`, extractor mapping in `normalize/mgef.ts` or a
   new `extract-armor.ts` (armor legendary effects may already partially
   extract via the shared ENCH/legendary pipeline — check
   `legendary-values.ts` first for whether these already exist as inert data).
2. Populate `src/data/live/armor.ts` (currently minimal/placeholder).
3. Wire `playerConfig.armor` into `resolveLoadout` (`src/lib/loadout.ts`) —
   currently never read.
4. UI: an armor picker component (none exists yet — closest precedent is the
   weapon-mod pickers in `src/components/build/WeaponSection.tsx`).
5. `docs/assumptions.md` entry for any non-ESM-proven value (e.g. the exact
   Unyielding HP threshold, Zealot's damage %).

## Verification
Golden case or in-game measurement for at least one build with Unyielding
active below the HP threshold, and one with Zealot's vs a Scorched enemy.
