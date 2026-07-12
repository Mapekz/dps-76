# TODO: Melee Weapon Fire Rates (Swing Speeds)

> **Ranged fire rate: DONE.** Semi-auto/auto `animDelaySec`/`animDurationSec`
> are now extraction-driven (`src/data/live/weapons.ts` sets `animDelaySec`
> from the real WEAP "Attack Delay Seconds" field; `isAutomatic` from the
> `WeaponTypeAutomatic` keyword), and the 0.8248 physical-speed multiplier
> flows from `SET Speed 0.8248` on automatic-receiver OMODs via
> `buildEffectiveWeapon()` rather than being hardcoded. No more Plasma
> Gun/Single Action Revolver/Fixer value confirmations needed — those come
> from the ESM now. **Remaining scope is melee only** — same workstream as
> [power-attacks.md](power-attacks.md)'s melee-timings section.

## Formula (implemented in src/lib/fire-rate.ts)
```
speed_effective = speed × (isPhysical ? 0.8248 : 1.0)
fireRate_auto   = speed_effective / animDurationSec   (≈ 0.11 for most auto guns)
fireRate_semi   = speed_effective / animDelaySec
fireRate_melee  = 1.0  (still stubbed — this doc's remaining scope)
```

## Melee swing speeds (replace the 1.0/s stub)
`getFireRate`'s melee branch (`src/lib/fire-rate.ts`) still special-cases melee
at a flat 1 swing/sec; `weapon.speed` applies relatively on top of that stub
(power-attack push, 2026-07-11) but the base cadence itself isn't real yet.
Need actual animation timings, same Speed/AnimDelaySec formula as ranged
semi-auto weapons (with the same 0.8248 physical multiplier):

| Weapon | animDelaySec | Speed | isPhysical |
|---|---|---|---|
| Deathclaw Gauntlet | ? | 1.0? | true |
| Super Sledge | ? | 1.0? | true |
| Pickaxe | ? | 1.0? | true |

## Where to update
`src/data/live/weapons.ts` — populate real `animDelaySec` for melee weapons.
`src/lib/fire-rate.ts` — remove the melee stub once real values are in.
