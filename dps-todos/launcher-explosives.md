# Launcher explosion damage (EXPL chase) — DONE 2026-07-13

> **Shipped 2026-07-13.** `chaseExplosion` (scripts/extract/extract-weapons.ts)
> follows WEAP → (RGW3 Override Projectile ?? AMMO default PROJ) → PROJ
> `Explosion` → EXPL, gated on the PROJ `Data.Flags` "Explosion" bit (the
> critical discovery: ProjectilePlasmaLarge carries a stale missile-shell EXPL
> formid WITHOUT the flag — an ungated chase would have given every plasma
> weapon +968 phantom damage). Full semantics in `docs/assumptions.md`
> "Launcher explosion damage".

## What shipped

- **Extractor**: EXPL main curve → `explosive` component; typed EXPL entries →
  elemental components (Cremator fire, Gamma Gun radiation + energy); all
  flagged `fromExplosion`. EXPL "Base Weapon Damage Mult" (Gauss 0.15, Tesla
  Cannon 0.10) → `GeneratedWeapon.explosionBaseWeaponDamageMult`, the
  intrinsic base of the `explosivePayload` twin fold (Explosive 2★ ADDs on
  top). Grenades/mines stay `projectileOnly`-excluded (vetting-scope
  decision) — the exclusion is evaluated before the chase.
- **Engine**: `fromExplosion` components match `damageTypeScope
  ['explosive']` regardless of element
  (`ResolveContext.componentIsExplosion`); an explosion never spawns a twin
  of itself. Flat-amount components (token launcher impact damage) now adapt
  to constant curves instead of computing 0.
- **Demolition Expert fixed**: its STAT_DmgExplosive AV was an unmapped-AVIF
  gap (the perk extracted ZERO modifiers). Routed to explosive-scoped `dbm`
  (+20/40/60%, `normalize/mgef.ts` FALLBACK_AVIF_ROUTES) — ADDITIVE with
  Bloodied/Adrenal etc. inside the dbm parenthesis per the June 2026 patch
  (user-reported 2026-07-13; initially shipped as the pre-patch
  multiplicative `explosionMult` bucket, corrected same day and the bucket
  removed).
- **Results @50** (free aim, no perks): Fat Man 1391 (was ~5), Missile
  Launcher 973, M79 525, Broadsider 693, AGL 247, Hellstorm 758, Cremator
  172, Gamma Gun 104. Gauss family & Tesla Cannon gained their intrinsic
  explosive twin (15% / 10%).
- **Gamma Gun graduated** from the `noDamage` bucket into the vetted roster;
  its `mod_Custom_Xerxos` unique mod cascade-rescued via WEAP inheritance.
- **Tests**: chain fixtures (Fat Man, Gamma Gun, plasma-negative, Gauss) +
  engine unit tests + two `expected: null` golden cases.

## Remaining (in-game measurement, not code)

- **Pip-boy summing verification**: does the card show WEAP impact + EXPL
  (Fat Man 1391, Missile Launcher 973)? Fill the two golden cases in
  `src/lib/engine/__tests__/golden/cases.json`. Hellstorm (379+379=758) is
  the sharpest probe — its two halves are separately authored tier-46 curves.
- **Explosive-legendary stacking on Gauss** (0.15 + 0.2 = 0.35 assumed
  additive) — measure if a Gauss + Explosive roll is available.
- **Cremator**: projectile DoT (the WEAP-side fire curve's "partial" caveat)
  unchanged by this work — the explosion component is new, the DoT chase is
  still open.
