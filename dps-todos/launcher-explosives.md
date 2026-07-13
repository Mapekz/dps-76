# Launcher explosion damage (EXPL chase)

Filed 2026-07-12 during the weapon-roster vetting pass (user decision: model
explosives from **launchers**, not throwables).

## Problem

Explosive launchers are listed in the picker but compute from their token
WEAP-level flat damage — the real payload rides the projectile's explosion:

| Weapon | WEAP damage today | Real damage source |
|---|---|---|
| Fat Man | 5 flat | mini-nuke PROJ → EXPL |
| Missile Launcher | 5 flat | missile PROJ → EXPL |
| Auto Grenade Launcher | 3 flat | grenade PROJ → EXPL |
| M79 Grenade Launcher | 3 flat | grenade PROJ → EXPL |
| Broadsider / Grand Finale | 5 flat | cannonball PROJ → EXPL |
| Nuka-Launcher | 3 flat | (rescued scoreboard AGL) |
| Cremator | fire curve (partial) | projectile DoT + explosion |

Also parked here: the plain **Gamma Gun** (`GammaGun`) is excluded in the
`noDamage` bucket for the same reason — its radiation burst is an EXPL, not a
WEAP component. Same for the 51 `projectileOnly` records (grenades/mines),
which stay out of the picker per the vetting-scope decision even after this
lands.

## Shape of the fix

1. **Extractor**: chase WEAP → `RGW3.Override Projectile` (or the ammo's
   default PROJ) → PROJ `Explosion` → EXPL damage (+ curve if any). Emit as a
   new component (`damageType: 'explosive'`? — careful: that union member is
   currently engine-synthesized only, see `src/types/index.ts`
   WeaponComponent).
2. **Engine**: explosion component folding — the `explosivePayload` /
   `explosionMult` buckets already exist and are wired (Stage A1), so
   Demolition Expert (`STAT_*` plumbing perk chase in `normalize/mgef.ts`)
   and Grenadier interactions land on existing rails.
3. **Data review**: several launchers' pellet/AoE semantics need in-game
   verification (does the Pip-Boy card show WEAP + EXPL summed?) —
   `docs/assumptions.md` entry required.

## Acceptance

- Fat Man / Missile Launcher / AGL / M79 / Broadsider show realistic damage.
- Golden case measured in-game for at least one launcher.
- `GammaGun` graduates from the `noDamage` excluded bucket into the picker.
