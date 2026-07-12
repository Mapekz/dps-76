# TODO: Melee Swing Speeds (ranged fire rate: DONE)

> **Ranged fire rate P0: CLOSED 2026-07-13.** Three rounds of user-supplied
> in-game Pip-Boy readings (16, then 20+ weapon+mod combos, then 6 more on a
> PTS dump) plus a real bug fix: `isAutomatic` was incorrectly derived from
> the `WeaponTypeAutomatic` **keyword** (user-confirmed: that keyword drives
> perk conditions only, not fire mode), which caused Combat Shotgun's
> Automatic Receiver to be misclassified as full-auto and given the wrong
> divisor. Fixed at the source: `isAutomatic` now comes from the WEAP
> `Data.Flags` "Automatic" bit (base weapon) + the OMOD's explicit
> `IsAutomatic` property (receivers) — never a keyword. Every other suspected
> "animation exception" (Submachine Gun, Railway Rifle) turned out to be
> fully explained by ordinary Speed SET/MUL_ADD folding once that bug was
> fixed; only **two** real exceptions remain, both now implemented as
> hand-maintained overrides. **Remaining scope is melee only.**

## What shipped

- **`isAutomatic` fix** (`src/types/generated.ts`, `scripts/extract/extract-weapons.ts`,
  `src/data/live/weapons.ts`, `src/lib/engine/effective-weapon.ts`): new
  `GeneratedWeapon.isAutomaticFlag` extracted from `Data.Flags.flags.includes('Automatic')`;
  `effective-weapon.ts`'s `isAutomatic` computation no longer ORs in
  `keywords.includes('WeaponTypeAutomatic')` — it's purely the folded
  `isAutomatic` bucket (base weapon flag + any OMOD's real `IsAutomatic SET`
  property). This was a live, active bug: Combat Shotgun's Automatic
  Receiver's include chain adds the `WeaponTypeAutomatic` keyword (for
  unrelated perk-gating reasons) without ever setting the `IsAutomatic`
  property (it sets `HasRepeatableSingleFire` instead) — so the app was
  computing its post-mod fire rate via the flat 0.11 divisor (118) when the
  correct answer, using its own `Attack Delay Seconds` (0.5) with the
  receiver's boosted Speed (1.3), is 26 — confirmed exactly by the user's
  in-game reading. Fixed for every current and future weapon with this same
  keyword/property mismatch, not just Combat Shotgun.
- **`animDurationSec` bucket** (`src/types/modifiers.ts`, folded in
  `effective-weapon.ts` exactly like `fireRateSpeed`, base 0.11): the two
  confirmed real exceptions to the flat 0.11s auto-fire divisor.
  - **Gatling Gun**: `src/data/overrides/corrections.ts` `weaponCorrections.GatlingGun.animDurationSec = 0.5`.
    Confirmed via a dedicated `AnimsGatlingGun` ESM keyword (distinct from
    every other weapon's own bespoke `Anims*` keyword, e.g. Minigun's
    `AnimsMinigun` — which uses the standard 0.11s cycle, proving each
    weapon's animation resource is independent design, not a shared/buggy
    override) — this is a real, intentional per-weapon animation, not a
    coincidence. In-game Pip-Boy: base Speed 1.0, reading 20 (1.0/0.5×10=20).
  - **Gatling Laser Charging Barrels**: `src/data/overrides/corrections.ts`
    `omodModifierAdditions` — a new additive (not replacing) override
    mechanism (`applyModifierAddition` in `dataset.ts`), since extraction
    already correctly got this OMOD's `Speed MUL_ADD −0.75`; only the
    animation-cycle piece needed adding. Confirmed via two independent
    effective-Speed readings landing on the exact same constant: Charging
    alone (0.5 effective, Pip-Boy 30) and Charging + Prime Receiver (0.3
    effective, Pip-Boy 18) both back-solve to exactly 1/6s (0.16667). All 8
    Charging Barrel variants (4 regular + 4 Ultracite) share the underlying
    `_PARENT_mod_WEAPON_GatlingLaser_Super` include and get the same override.
- Re-extracted weapons (`pnpm extract --only weapons`, 2026-07-02 dump) to
  populate `isAutomaticFlag`; `pnpm test` 204 passed (2 pre-existing failing
  suites are unrelated — a missing `@/data/bodyparts` module from other
  in-progress work, not touched here).

## What turned out to need NO fix at all (false-positive "exceptions")

- **Combat Shotgun + Automatic Receiver** (was thought to need a shared 0.5s
  constant with Gatling Gun): fully explained by the `isAutomatic` bug fix
  above — it was never really "automatic," it's `HasRepeatableSingleFire`
  (a hold-to-repeat semi mechanic, the same one Auto Grenade Launcher's base
  record carries), so it correctly uses `speed / AttackDelaySeconds` with its
  own boosted Speed (1.3/0.5×10=26 ✓). No animation override needed.
- **Submachine Gun** (was thought to have a stock-only ~0.215s anomaly that
  "reverts to normal" once any receiver is equipped): the "Standard
  Receiver" was never Speed-neutral — walking its own Includes chain (not
  just the divergent "Prime" one) shows it pulls in the SAME shared
  `_PARENT_mod_WEAPON_Receiver_AutomaticInit` template used by Combat
  Rifle/Alien Disintegrator (`IsAutomatic SET True` + `Speed SET 0.8248`).
  The raw, truly-unmodified WEAP Speed (1.61) is never a real achievable
  in-game state — a receiver is always equipped, including by default. Both
  readings (75 base, 60 Prime) match the ordinary Speed SET/MUL_ADD fold
  exactly, standard 0.11 divisor, no override.
- **Railway Rifle**: the earlier "ambiguous 10-vs-25, doesn't match ESM"
  finding was simply because it was checked against the wrong dump — the
  user's numbers came from a **PTS** client (`FO76-Tools/esm/Data/20260710/`),
  which has different base stats (`Speed 1.0`, `Attack Delay Seconds 0.4`)
  than the live 2026-07-02 dump (`Speed 0.5774`, `Attack Delay Seconds 1.0`).
  All 6 PTS readings (25 semi, 45 Automatic Piston, 25 Shotgun/Splitter
  receiver, 22 Prime + Prime Shotgun, 36 Prime Automatic Piston) match the
  ordinary formula exactly on that dump — no exception, no override. (This
  app currently only has a live dataset; PTS support is `dps-todos/pts-toggle.md`.)

## Melee swing speeds (remaining scope)

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
`src/data/live/weapons.ts` — populate real `animDelaySec` for melee weapons.
`src/lib/fire-rate.ts` — remove the melee stub once real values are in.
