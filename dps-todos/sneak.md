# TODO: Sneak Damage

## What
Add sneak attack damage bonus to the formula.

## Formula position
Sneak damage bonus lives in the **additive** DamageBonusMult bucket:
`dbm += sneakDamageBonusMult`  (only when the player is sneaking and undetected)

Baseline: `sneakDamageBonusMult = 1.0` (+100% of base damage when sneaking).
Modified by the Mister Sandman perk and weapon-specific mods.

## UI
Add a "sneaking" toggle to PlayerConditions. Show a third column of numbers (Sneak DPS).
Sneak + VATS crit combined is the peak damage scenario for stealth builds.

## Dependencies
- `Stat.SneakDamageBonus` already exists in `src/data/stats.ts`
- Ninja perk, Mister Sandman perk need correct `statsModified` values
- `playerConditions.isSneaking` already exists in `PlayerConditions`
