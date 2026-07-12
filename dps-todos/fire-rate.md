# TODO: Ranged Fire-Rate Validation (P0) + Melee Swing Speeds

> **P0 nearly closed 2026-07-13.** Two rounds of user-supplied in-game Pip-Boy
> readings (16, then 20+ across weapon+mod combos) confirmed the existing
> speed/attackDelaySec/0.11 formula is correct for the overwhelming majority
> of weapons and mods — zero code changes needed there. Found and precisely
> pinned **three distinct alternate animation-cycle constants** beyond the
> standard 0.11s, each tied to a specific weapon/receiver/barrel family, not
> arbitrary per-weapon noise. Only Railway Rifle's stock/semi reading remains
> ambiguous (user gave two candidate numbers, neither matches the raw ESM
> field — needs one more precise confirm).

## Confirmed correct — no code change (30+ readings matched exactly)

Formula: automatic weapons (via `WeaponTypeAutomatic` keyword) use `speed /
0.11`; non-automatic use `speed / Attack Delay Seconds`. Pip-Boy Fire Rate =
that value `× 10`, rounded.

**Base weapons** (14/16 from round 1): V63 Carbine 73, .50 Cal Machine Gun 91,
Gauss Minigun stock 91, Minigun stock 182, Pepper Shaker stock 41, 10mm SMG
stock 82, 10mm Pistol 43, Combat Shotgun (no auto receiver) 20, Combat Rifle
(no auto mod) 36, Assault Rifle (no auto mod) 28, Handmade (no auto mod) 40,
Radium Rifle (no auto mod) 40, Light Machine Gun/MG42 stock 122, Auto Grenade
Launcher 16 (flagged `Repeatable Single Fire` not `Automatic` in the ESM —
correctly takes the semi branch despite the name; good confirmation
`isAutomatic` should stay keyword-driven, not name-driven). Alien
Disintegrator stock 33, Gamma Gun stock 67 (implied by "+24 with Signal
Repeater" = 91).

**Weapon + mod combos** (round 2, all via the per-weapon-family `fireRateSpeed`
SET/MUL_ADD chain, already correctly extracted and folded — no extractor
change needed for any of these):

| Weapon + mod | Speed fold | Predicted | User reading |
|---|---|---|---|
| Alien Disintegrator + Automatic Receiver (`SET 0.8248`, shares the generic `_PARENT_mod_WEAPON_Receiver_AutomaticInit` piece) | 0.8248 | 75 | 75 ✓ |
| Handmade + auto mod | 0.8617234 | 78 | 78 ✓ |
| Gamma Gun + Signal Repeater (`IsAutomatic SET`, no Speed change) | 1.0 | 91 | 91 ✓ |
| Combat Rifle + auto mod | 0.8248 | 75 | 75 ✓ |
| Assault Rifle + auto mod | 0.6872234 | 62 | 62 ✓ |
| Pepper Shaker + Hex Barrel (`MUL_ADD +0.50`) | 0.45+0.225=0.675 | 61 | 61 ✓ |
| Minigun + Tri Barrel (`MUL_ADD −0.20`) | 2.0−0.4=1.6 | 145 | 145 ✓ |
| Minigun + Accelerated Barrel (`MUL_ADD +0.15`) | 2.0+0.3=2.3 | 209 | 209 ✓ |
| Minigun + Prime Barrel (generic AntiScorchBeast `MUL_ADD −0.10`) | 2.0−0.2=1.8 | 164 | 164 ✓ |
| LMG/MG42 + Standard .45 Receiver (`MUL_ADD +0.30`) | 1.3462+0.404=1.750 | 159 | 159 ✓ |
| LMG/MG42 + Prime .45 Receiver (+0.30, generic AntiScorchBeast −0.10 = net +0.20) | 1.3462+0.269=1.615 | 147 | 147 ✓ |
| LMG/MG42 + Prime .308 Receiver, and + Prime Receiver (base) — both just the generic AntiScorchBeast `MUL_ADD −0.10` | 1.3462−0.135=1.212 | 110 | 110 (both) ✓ |
| Gauss Minigun + Tri Barrel (`MUL_ADD +0.20`) | 1.0+0.2=1.2 | 109 | 109 ✓ |
| Gauss Minigun + Penta Barrel (`MUL_ADD +0.30`) | 1.0+0.3=1.3 | 118 | 118 ✓ |
| Gauss Minigun + Penta Barrel + Prime Capacitor (Tesla slot, generic AntiScorchBeast −0.10; net +0.20) | 1.0+0.2=1.2 | 109 | 109 ✓ |

The recurring `_PARENT_mod_WEAPON_GENERIC_AntiScorchBeast` piece (`Speed
MUL_ADD −0.10`, plus AimModel/range/value tweaks) is the shared "Prime" tax
across weapon families — confirmed consistent everywhere it appears.

## Confirmed exceptions — three real alternate animation-cycle constants

These don't use the flat `0.11` divisor. Back-solved via `animDurationSec =
effectiveSpeed / (pipboyFireRate / 10)`; consistency across independent
readings (below) confirms these are real per-family constants, not noise:

| Constant | Weapons/mods it applies to | Evidence |
|---|---|---|
| **0.5s** ("shotgun/gatling automatic cycle") | Gatling Gun (always — no receiver option exists, base `Speed` is `1.0` not `2.0` as an earlier note wrongly assumed); Combat Shotgun + Automatic Receiver | Gatling Gun: 1.0 effective / 0.5 × 10 = 20 (matches exactly). Combat Shotgun+auto: 1.3 effective / 0.5 × 10 = 26 (matches exactly). Two independent weapon families landing on the *identical* constant — not a coincidence. |
| **1/6s ≈ 0.1667s** ("Gatling Laser Charging Barrels' charged-beam cycle") | Gatling Laser + Charging Barrels only (base Gatling Laser and its Prime Receiver alone both still use flat 0.11) | Charging alone: 0.5 effective (2.0 base × (1−0.75)) / (1/6) × 10 = 30 (matches). Charging + Prime Receiver (extra −0.10 MUL_ADD → 0.3 effective): 0.3 / (1/6) × 10 = 18 (matches exactly) — same constant holds with a second, independent Speed value, confirming it's the barrel's animation, not a fluke. |
| **≈0.215s** (Submachine Gun's stock-only anomaly) | Submachine Gun (non-10mm) with **no receiver mod installed** only | 1.61 base / 0.215 × 10 ≈ 75 (matches). Installing **any** receiver (even the damage-only "Prime Receiver": `SET Speed 0.8248` + generic AntiScorchBeast `MUL_ADD −0.10` → effective 0.8248−0.161=0.6638) reverts to the **standard 0.11 cycle**: 0.6638/0.11×10=60.3→60 (matches the user's Prime reading exactly). Only one data point for the stock value itself (no second mod to cross-check its precision), unlike the other two constants — lower confidence on the exact decimal, high confidence on "reverts to 0.11 once modded."|

**Pattern**: a receiver/barrel swap can change which attack animation plays,
not just the `Speed` stat. Rifle/SMG/pistol-style automatic receivers (Combat
Rifle, Assault Rifle, Handmade, Alien Disintegrator, Railway Rifle's auto
receiver, Gamma Gun's Signal Repeater) all keep the standard 0.11s cycle.
Shotgun/gatling-mechanism weapons get a slower 0.5s cycle. Gatling Laser's
Charging Barrels get their own charged-beam 0.1667s cycle. Submachine Gun's
*unmodded* state is the one weapon found so far where the anomaly is in the
base state rather than a mod.

## Still open — 1 confirm needed to fully close this out

**Railway Rifle, stock (no receiver mod installed)** — raw ESM says `Speed
0.5774`, `Attack Delay Seconds 1.0`, predicting semi fire rate **6**; this
matches neither of the user's two candidate readings ("10" or "25"), and the
user was themselves unsure which was right. Railway Rifle's **automatic**
reading (52, with the Automatic Piston Receiver, which adds no Speed
override of its own) matches the standard flat-0.11 formula exactly using
the same `Speed 0.5774` — confirming Speed is correct and this is the same
"stock-only anomaly" pattern as Submachine Gun (a receiver swap likely
reverts it to a normal cycle). Need one precise Pip-Boy digit for the true
stock/no-receiver state to back-solve its `animDurationSec`.

## Implementation plan (once Railway Rifle's stock number is in)

Add a proper `animDurationSec`-style bucket to the modifier IR, analogous to
the existing `fireRateSpeed` bucket, rather than a flat lookup table — this
naturally handles every confirmed case:
- Base weapons default to `0.11` (unchanged).
- Combat Shotgun's Automatic Receiver OMOD adds `animDurationSec SET 0.5`.
- Gatling Gun gets a base-weapon-level `animDurationSec SET 0.5` (no receiver
  family exists to hang it on, same treatment as V63's Speed workaround).
- Gatling Laser's Charging Barrels OMOD adds `animDurationSec SET 0.16667` (1/6).
- Submachine Gun gets a base-weapon-level `animDurationSec SET ≈0.215`, and
  *every* receiver OMOD (Standard, Prime, etc.) adds `animDurationSec SET
  0.11` to cancel it back to normal once any receiver is equipped (folds via
  "last SET wins," consistent with the existing `foldOps` semantics).
- Railway Rifle: same pattern as Submachine Gun once its stock value is confirmed.

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
`src/types/modifiers.ts` — new `animDurationSec` bucket.
`src/lib/engine/resolve.ts` or `effective-weapon.ts` — fold it like `fireRateSpeed`.
`src/data/overrides/` — the base-weapon-level SET entries for Gatling Gun,
Submachine Gun, and (once confirmed) Railway Rifle.
`scripts/extract/extract-omods.ts` — map the Combat Shotgun auto receiver and
Gatling Laser Charging Barrels OMOD properties to the new bucket.
`src/lib/fire-rate.ts` — remove the melee stub separately, once real melee
values are in.
