# TODO: Ranged Fire-Rate Validation (P0) + Melee Swing Speeds

> **P0 mostly closed 2026-07-13.** User supplied 16 in-game Pip-Boy Fire Rate
> readings across a wide weapon spread; 14 matched the existing
> speed/attackDelaySec/0.11 formula exactly (zero code changes needed — the
> extraction pipeline was already correct). 2 confirmed exceptions found and
> pinned to real derived values. 4 more targeted weapon+mod combos requested
> to close out the remaining unknowns (see bottom of this doc).

## Confirmed correct — no code change (2026-07-13, 14/16 readings matched exactly)

Formula: automatic weapons (via the `WeaponTypeAutomatic` keyword) use
`speed / 0.11`; non-automatic use `speed / Attack Delay Seconds`. Pip-Boy
Fire Rate = that value `× 10`, rounded, per the user's in-game formula.

| Weapon | Branch | Speed | Divisor | Predicted | User reading |
|---|---|---|---|---|---|
| V63 Carbine (Meltdown) | auto | 0.8 | 0.11 | 73 | 73 ✓ |
| .50 Cal Machine Gun | auto | 1.0 | 0.11 | 91 | 91 ✓ |
| Gauss Minigun (stock) | auto | 1.0 | 0.11 | 91 | 91 ✓ |
| Minigun (stock) | auto | 2.0 | 0.11 | 182 | 182 ✓ |
| Pepper Shaker (stock) | auto | 0.45 | 0.11 | 41 | 41 ✓ |
| 10mm SMG (stock) | auto | 0.9 | 0.11 | 82 | 82 ✓ |
| 10mm Pistol (no auto receiver) | semi | 1.0 | 0.23 | 43 | 43 ✓ |
| Combat Shotgun (no auto receiver) | semi | 1.0 | 0.5 | 20 | 20 ✓ |
| Combat Rifle (no auto mod) | semi | 1.0 | 0.28 | 36 | 36 ✓ |
| Assault Rifle (no auto mod) | semi | 0.8332 | 0.30 | 28 | 28 ✓ |
| Handmade (no auto mod) | semi | 1.0 | 0.25 | 40 | 40 ✓ |
| Radium Rifle (no auto mod) | semi | 1.0 | 0.25 | 40 | 40 ✓ |
| Light Machine Gun (MG42, stock) | auto | 1.3462 | 0.11 | 122 | 122 ✓ |
| Auto Grenade Launcher (no mods) | semi* | 0.8 | 0.5 | 16 | 16 ✓ |

\* Auto Grenade Launcher is flagged `Repeatable Single Fire` in the ESM, not
`Automatic` — despite the name, it correctly uses the semi-auto branch. Good
confirmation that `isAutomatic` should stay driven off the `WeaponTypeAutomatic`
keyword, not weapon display names.

Per-weapon-family automatic Speed overrides (`fireRateSpeed` bucket, verified
byte-for-byte in `generated/omods.json`, already correctly folded through
`buildEffectiveWeapon()`): Combat Rifle auto receiver `SET 0.8248`, Assault
Rifle `SET 0.6872234`, Handmade `SET 0.8617234`, Combat Shotgun `MUL_ADD
+0.30`, Gatling Laser Charging Barrels `MUL_ADD −0.75`. No extractor change
required for any of these.

## Confirmed exceptions — need the override mechanism

Two weapons genuinely don't follow the flat `0.11` divisor. Both are flagged
`Automatic` in the ESM (so the app currently mispredicts them via the flat
formula) but have a different real animation cycle, back-solved from the
user's reading via `animDurationSec = speed / (pipboyFireRate / 10)`:

| Weapon | Speed | Flat-0.11 prediction | User reading | Derived `animDurationSec` |
|---|---|---|---|---|
| Gatling Gun (stock) | 1.0 | 91 | **20** | **0.5s** (clean value — no barrel mod changes Speed, so this is likely a fixed weapon-level constant) |
| Submachine Gun (stock, non-10mm) | 1.61 | 146 | **75** | **≈0.2147s** (single data point only — no Speed-changing mod exists to cross-check, since all its receivers are damage/crit variants, not semi/auto toggles) |

`docs/assumptions.md` updated with these findings.

## Still open — 4 targeted confirms requested (see chat for full context)

1. Railway Rifle, stock (no receiver) — predict **6** (semi, 0.5774/1.0×10).
2. Railway Rifle + Automatic Piston Receiver — predict **~52–53** *if* the
   flat 0.11 divisor applies, but the receiver adds no Speed override of its
   own (`IsAutomatic SET True` only) and this is a user-named suspected
   exception weapon — likely wrong, real reading pins its `animDurationSec`.
3. Combat Shotgun + Automatic Receiver — predict **118** (1.3 effective
   speed / 0.11 × 10).
4. Gatling Laser + Charging Barrels — predict **~45** (0.5 effective speed /
   0.11 × 10) *if* no additional animation swap; diverges if the barrel also
   changes the animation resource on top of the Speed change.

Once in: add the `animDurationSec` override table (`src/data/overrides/`,
keyed by weapon id, or weapon+omod id for the Gatling Laser case) and wire it
into `getFireRate()`'s auto branch.

## Melee swing speeds (separate, lower-priority scope)

Same workstream as [power-attacks.md](power-attacks.md)'s melee-timings
section. `getFireRate`'s melee branch (`src/lib/fire-rate.ts`) still
special-cases melee at a flat 1 swing/sec; `weapon.speed` applies relatively
on top of that stub (power-attack push, 2026-07-11) but the base cadence
itself isn't real yet. Needs actual per-weapon animation timings, same
Speed/AnimDelaySec approach as ranged semi-auto weapons:

| Weapon | animDelaySec | Speed | isPhysical |
|---|---|---|---|
| Deathclaw Gauntlet | ? | 1.0? | true |
| Super Sledge | ? | 1.0? | true |
| Pickaxe | ? | 1.0? | true |

## Where to update
`src/data/overrides/` — new `animDurationSec` override table once measured.
`src/data/live/weapons.ts` — populate real `animDelaySec` for melee weapons.
`src/lib/fire-rate.ts` — remove the melee stub once real values are in; wire
the new override table into the auto-fire branch.
