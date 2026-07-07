# TODO: Perk Data Pass

## What
Fill in correct `statsModified` values for all damage-relevant perks in `src/data/live/perks.ts`
and `src/data/pts/perks.ts`. Most entries currently have `statsModified: []`.

## Missing PerkIds to add first
These need to be added to `src/data/perk-ids.ts` AND the N&D key map in `src/lib/nukes-dragons.ts`:
- `Commando` (rifle auto damage) — N&D key unknown (missing from map)
- `HeavyGunner` (heavy weapon damage) — N&D key unknown (missing from map)
- `Rifleman` (base rank, rifle semi damage) — only Expert/Master exist in PerkId enum
- `Gladiator` (1h melee damage) — N&D key unknown (missing from map)

Also missing from key map (perkIds exist but no N&D key):
- Expert/Master variants of Slugger (`SluggerExpert`, `SluggerMaster`)
- Expert/Master variants of IronFist (`IronFistExpert`, `IronFistMaster`)

## Known-wrong data to fix
- `Slugger`: currently `DamageToCrippledBonus: 30` — WRONG. Real value: flat 2h melee damage
  bonus per rank (e.g. +10%/+15%/+20% per rank).
- `IronFist`: `UnarmedDamageBonus: 20` — needs rank-scaling verification.

## Stats that need values (additive bucket, go in DamageBonusMult)
Classify each perk as **additive** (percentage added to `dbm`) or **multiplicative**
(a separate `× mult`).

Additive perks: Commando, Heavy Gunner, Rifleman (base/Expert/Master), Gunslinger (Expert/Master),
IronFist (Expert/Master), Slugger (Expert/Master), Gladiator (Expert/Master), BloodyMess, etc.

Multiplicative perks: Taking One for the Team, Follow Through, others — confirm via testing.

## Process
1. User drafts `statsModified` values from game data / wiki
2. Claude verifies classification (additive vs multiplicative)
3. Test against known-good DPS numbers to confirm
