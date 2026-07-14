# TODO: Melee Swing Speeds

Merged 2026-07-13 from the melee remainders of the deleted `fire-rate.md`
(ranged fire-rate P0 CLOSED 2026-07-13 — `isAutomatic` flag fix, the two real
`animDurationSec` exceptions, three rounds of Pip-Boy validation; full record
in `docs/assumptions.md` and git history) and `power-attacks.md` (power-attack
model DONE — race multiplier, `powerAttackBonus` bucket, Charged's cadence;
see `docs/assumptions.md` "Power attacks & melee cadence").

## What's left: real melee animation timings

`getFireRate`'s melee branch (`src/lib/fire-rate.ts`) still special-cases
melee at a flat 1 swing/sec; `weapon.speed` applies relatively on top of the
stub (power-attack push, 2026-07-11) but the base cadence isn't
animation-derived. Needs actual per-weapon animation timings, same
Speed/AnimDelaySec approach as ranged semi-auto weapons, with the same 0.8248
physical speed multiplier:

| Weapon | animDelaySec | Speed | isPhysical |
|---|---|---|---|
| Deathclaw Gauntlet | ? | 1.0? | true |
| Super Sledge | ? | 1.0? | true |
| Pickaxe | ? | 1.0? | true |

Power tools (automatic melee) already work — `WeaponHasSecondaryCharging`/
auto-melee keywords merge via `effective-weapon.ts`, fire rate = speed / 0.11
like automatic guns. Only non-auto melee is stubbed.

## Related verification: Mole Miner Gauntlet Extra Claw (added 2026-07-14)

Tester reports the Extra Claw mod shows a damage DECREASE. Plausibly correct:
it trades base physical damage for a small DBM gain plus a DoT — and if the
DoT refreshes on every hit (never ticking to completion at real swing speeds),
sustained DPS drops. Confirm the DoT-refresh interaction once real melee
cadence exists; until then note it as expected-but-unverified in
`docs/assumptions.md` if users ask.

## Where to update

- `src/data/live/weapons.ts` — populate real `animDelaySec` for melee weapons.
- `src/lib/fire-rate.ts` — remove the melee stub once real values are in.

## Dropped scope: 1h/2h weaponClass split (obsolete 2026-07-13)

The old plan added `melee1h`/`melee2h` to `weaponClass` so Gladiator vs
Slugger could apply correctly. Verified against the 20260710 dump: Gladiator
no longer exists as a perk at all, Slugger is now "+10/20/30% melee damage to
crippled targets" (no handedness gate), and **no perk or OMOD in the current
data gates on one-handed vs two-handed**. Don't add the split unless a future
patch reintroduces a consumer.
