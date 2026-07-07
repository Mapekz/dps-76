# TODO: Confirm Semi-Auto & Melee Weapon Fire Rates

## Formula (implemented in src/lib/fire-rate.ts)
```
speed_effective = speed × (isPhysical ? 0.8248 : 1.0)
fireRate_auto   = speed_effective / animDurationSec   (≈ 0.11 for most auto guns)
fireRate_semi   = speed_effective / animDelaySec
fireRate_melee  = 1.0  (stubbed)
```

Speed is almost always 1.0. The 0.8248 mult applies to ballistic/physical weapons only.

## Values needing confirmation
These are currently stubbed at `animDelaySec: 0.5` (giving ≈2.0/s for energy, ≈1.6/s for ballistic):

| Weapon | Expected animDelaySec | Source |
|---|---|---|
| Plasma Gun (no mods, standard receiver) | ? | Need from game files |
| Single Action Revolver (no mods) | ? | Need from game files |

## The Fixer
Stubbed as automatic with `animDurationSec: 0.11`. Confirm:
- Does The Fixer ship with an automatic receiver by default? (assumed yes)
- Actual `animDurationSec` if different from 0.11?

## Melee swing speeds (replace 1.0/s stubs)
Once confirmed, update `animDelaySec` in the weapon definitions and change the
`getFireRate` function to not special-case melee:

| Weapon | animDelaySec | Speed | isPhysical |
|---|---|---|---|
| Deathclaw Gauntlet | ? | 1.0? | true |
| Super Sledge | ? | 1.0? | true |
| Pickaxe | ? | 1.0? | true |

## Where to update
`src/data/live/weapons.ts` — update the `animDelaySec` field for each weapon.
`src/lib/fire-rate.ts` — remove the melee stub once real values are in.
