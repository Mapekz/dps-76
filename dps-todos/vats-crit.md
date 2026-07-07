# TODO: VATS Crit

## What
Add VATS crit damage to the formula and the UI.

## Formula position
Crit damage bonus lives in the **additive** DamageBonusMult bucket (same as regular perks):
`dbm += critDamageBonusMult`  (only when the shot is a crit)

Baseline: `critDamageBonusMult = 1.0` (+100% of base damage on crit).
Can be increased/decreased by weapon mods and perks (e.g. Better Criticals).

## Crit cadence
- Min-maxed VATS build: **50%** crit rate (every 2nd shot crits)
- Comfortable optimized: **33%** crit rate (every 3rd shot crits)
- Manual aim: **0%** crit rate (cannot crit outside VATS)

## Average damage accounting for crit cadence
`avgDamage = nonCritDamage × (1 - critRate) + critDamage × critRate`

## UI
Show a side-by-side comparison: Manual Aim vs VATS (no crit) vs VATS (with crits).
Add a crit-rate input (0%, 33%, 50%) or use the comfort/min-max presets.

## VATS advantage (even without crits)
VATS locks onto weakpoints through enemy bodies, giving near-100% weakpoint hit rate
at maximum fire rate — a DPS advantage over manual aim even without the crit damage.
Display this difference clearly.

## Dependencies
- Correct perk data pass (BetterCriticals perk needs `CriticalDamageBonus` stat)
- Crit stat from `Stat.CriticalDamageBonus` already exists in `src/data/stats.ts`
