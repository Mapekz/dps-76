# TODO: Ranged Fire-Rate Validation (P0) + Melee Swing Speeds

> **P0 — validate before anything else builds on it.** 2026-07-12 ESM dig +
> user domain knowledge resolved most of this doc's original uncertainty.
> Two items remain, both requiring **in-game Pip-Boy readings** — Havok
> animation files aren't parseable, so no further ESM digging will close them.

## What's confirmed correct (no code change needed)

- **The flat `0.11`s animation-cycle constant is correct** as the universal
  auto-fire divisor for "almost every" ranged weapon (user-confirmed). The
  in-game Pip-Boy "Fire Rate" stat displays `(speed / 0.11) × 10`, rounded,
  assuming an infinite magazine — this is a **verifiable ground truth**: any
  weapon's computed fire rate can be checked against its Pip-Boy number.
- **Per-weapon-family automatic Speed overrides are already extracted
  correctly** into the `fireRateSpeed` bucket (verified byte-for-byte against
  the 2026-07-02 ESM dump in `generated/omods.json`):
  - Combat Rifle auto receiver → `SET 0.8248` → 0.8248/0.11×10 = **75** Pip-Boy.
  - Assault Rifle auto receiver → `SET 0.6872234` → **~62**.
  - Handmade auto receiver → `SET 0.8617234` → **~78**.
  - Combat Shotgun auto receiver → `MUL_ADD +0.30` (base Speed 1.0 → 1.3) → **~118**.
  - Gatling Laser Charging Barrels → `MUL_ADD −0.75` on base Speed 2.0 → 0.5
    effective → **~45** (the barrel deliberately trades rate for a charged-beam
    hit, not a bug).
  - These all resolve through the existing OMOD `Includes`-chain flattening +
    `buildEffectiveWeapon()` fold — no extractor change required.
- **V63 Carbine (Meltdown) needs no fix.** It has no separate automatic-receiver
  mod at all (always-auto, with "Capacitor" mods instead of a receiver swap);
  its base WEAP `Speed` is `0.8` (not the typical energy-weapon 1.0), already
  read by the existing extractor. That alone gives it a ballistic-like reduced
  fire rate "unlike other energy weapons," exactly as expected — no code
  change, just a documentation note in `docs/assumptions.md`.

## What's still open — needs in-game Pip-Boy readings

1. **Custom-animation exception weapons.** Railway Rifle, Auto Combat Shotgun,
   and "a handful of others" (per user) ship with newer animations not
   inherited from FO4's `0.11`s cycle — their real `animDurationSec` differs
   and can't be derived from ESM. For each: read the Pip-Boy "Fire Rate" stat
   in-game, then back-solve `animDurationSec = weapon.speed / (pipboyFireRate / 10)`.
   Start with Railway Rifle + Auto Combat Shotgun; flag any others found along
   the way.
2. **Gatling Laser Charging Barrels — confirm no *additional* animation change.**
   The `Speed MUL_ADD −0.75` is already captured (see above, predicts ~45
   Pip-Boy). Compare that prediction against the actual in-game Pip-Boy
   reading with Charging Barrels equipped — if it matches, nothing more to do;
   if it diverges, the barrel swaps to a distinct animation resource on top of
   the Speed change, needing its own `animDurationSec` override.
3. **Add the override mechanism** once (1)/(2) produce real numbers: a small
   hand-maintained per-weapon (or per-weapon+OMOD, for the Gatling Laser case)
   `animDurationSec` override table, following the existing
   `src/data/overrides/` pattern (e.g. alongside `legendary-values.ts`) — not
   worth building until there's a confirmed value to put in it.

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
