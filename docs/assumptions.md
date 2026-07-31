# Damage Engine Assumptions

Registry of every engine assertion **not directly proven by ESM data** — each
confirmed or corrected by an in-game golden measurement
(`src/lib/engine/__tests__/golden/`) where possible.

**Format**: one claim per bullet, tagged **ESM-PROVEN** (kept only as
load-bearing context for a nearby assumption), **USER-CONFIRMED**,
**ASSUMPTION**/**INFERENCE**, or **MEASURED**/**CLOSED**, plus a code pointer
and — where open — a tracking issue.

**Where things go**: investigation history (how a bug was found, rejected
alternatives, dated narrative) belongs in the **commit message**, not here.
In-game measurement TODOs are tracked as GitHub issues (label
`needs-measurement`). A full explanation of how a mechanic works — even an
ESM-proven one, not an assumption — belongs in the implementing function's
doc-comment, not here.

**Section names and bold sub-anchors below are cited across the codebase by
exact text** (comments, tests, golden-case `source` strings, and the
`OMOD-chased launcher payloads` notes baked into generated `omods.json`) — do
not rename or merge one without updating every citation.

## Formula structure
Engine: `src/lib/engine/paper-damage.ts`, `resolve.ts`.

```
PaperDamage = Σ_components base(c) × ( dbmFold(c) + Tenderizer + (CritMult−1)[crit]
              + (SneakMult−1)[sneak, non-explosive] + PowerAttackBonus + STR term[melee] )
              × Π wholeDamage × BodyPartMult[non-explosive] × (1 + weakpointBonus)[BodyPartMult>1, non-explosive]
              × PowerAttackRaceMult[melee power attack] × RangeFalloffMult[non-melee]
```

- **Bucket fold** — `result = (last SET ?? base) + (Σ MUL_ADD) × base + Σ ADD`;
  multiple MUL_ADDs stack additively and always multiply the ORIGINAL base,
  even under a SET. **USER-CONFIRMED.**
- **Explosive carve-out** — `fromExplosion`/`explosivePayload` components skip
  `(SneakMult−1)`, `BodyPartMult`, and `weakpointBonus` (an AoE payload lands
  on whatever part it strikes, not a targeted/stealth shot); crit,
  power-attack, and whole-damage multipliers still apply.
  **USER-CONFIRMED, 2026-07-14.**
- **DoT carve-out** — stricter than explosive: `computeDotDps` also drops
  crit, entirely outside the formula above (no body part in its signature).
  Structural, not a per-component flag; pinned by invariance tests.
  **USER-CONFIRMED, 2026-07-14.**
- **Curve tables override flat magnitudes** wherever both exist (OMOD
  properties always default their input to `itemLevel`; MGEF/ENCH curves need
  a resolvable input AV or drop with a `_meta.json` note — see
  **Single-point curve tables**). ~9 records remain genuinely unmodeled
  (non-level creature/event DoTs, a lockpicking gimmick, a caps-scaled hidden
  mod, PA battery drain).
- `DamageTypeValues` on dtPhysical ≡ `AttackDamage` (both phys-only).
- **Base-damage scaling** — `AttackDamage`/`DamageTypeValues` MUL_ADDs on
  OMODs multiply the component's BASE damage pre-parenthesis.
  **USER-CONFIRMED.** Golden: Fixer + Powerful Automatic Receiver =
  103×0.7×1.25 = 90.125.
- **Classification caveat** — ESM plumbing (`STAT_DamagePerk` et al.) informs
  bucket routing, but confirm additive-vs-multiplicative with the user for
  everything EXCEPT "Mod Weapon DMG Bonus Mult" (always additive, no
  confirmation needed).
- **Crit/sneak composition** — OMOD MUL_ADD/SET adjusts weapon base mult
  first, then additive bonuses stack. **USER spec; ESM-consistent.**
- **Weakpoint bonus** multiplies whole damage, only active when body-part
  mult > 1.0. ESM-confirmed (`STAT_DamagePerk`).
- **STR melee scaling** — STR/20 (1h/2h melee), STR/10 (unarmed). **USER spec.**
  Investigated 2026-07-21 for ESM backing: GMSTs `fAVDMeleeDamageMult` (0.05)
  and `fDamageStrengthMult` (0.1) match the two coefficients exactly, but the
  mapping is **NOT confirmed** — the name-obvious unarmed candidates
  (`fHandDamageStrengthMult`, `fAVDUnarmedDamageMult`) both read 0.0 (dead/
  vestigial), and `fDamageStrengthMult`'s generic name doesn't self-evidently
  point to "unarmed" the way `fAVDMeleeDamageMult` points to "melee". No DFOB
  bridge or reverse reference confirms either wiring (GMSTs are read by
  native code, not cross-referenced in ESM). Left un-extracted — a value
  match alone isn't proof, per this repo's speculative-facts convention.
- **Body-part multiplier** — resolves from BPTD-extracted per-enemy data when
  a target/part is picked (see **Body parts (BPTD-extracted)**); the manual
  input is a fallback only, default 1.5 (a standard humanoid headshot).
- **Range falloff** — folded into `outerMult`/`explosiveOuterMult` as a flat
  multiplier alongside `wholeDamage`/`bodyPartMult`/`weakpointBonus`/
  `paRaceMult` (Phase 1 — Range + falloff). See **Target distance (Close /
  Far)**.

## Base damage & components

- Per-component damage = level curve evaluated at `min(itemLevel, levelCap)`,
  levelCap = max Eligible Level. Confirmed: Fixer tier-24 y(50)=103.
- **A physical component exists IFF the weapon has a main Damage Curve** —
  regardless of the legacy `Base Damage` field. **USER-CONFIRMED.** All
  plasma weapons deal phys+energy (Gatling Plasma 28+28 despite Base Damage
  0); Laser/Flamer have no main curve → typed damage only. Golden: Shishkebab
  (64×1.75)×2 = 224 @45.
- Item level clamps to the weapon's max Eligible Level (Shishkebab 45
  confirmed by user — a "level 50" variant would give 252, unconfirmed
  whether one exists).
- Thrown explosives (grenades, mines) stay excluded — **2026-07-12
  vetting-scope decision** (launchers, not throwables); flagged
  `projectileOnly`.

## Launcher explosion damage
Engine: `chaseExplosion`, `extract-weapons.ts`.

Chain: WEAP `RGW3."Override Projectile"` ?? AMMO `.DNAM.Projectile` → PROJ
`Data.Explosion` → EXPL `Data`, gated on the PROJ `Data.Flags` "Explosion" bit
(several projectiles carry a stale Explosion formid that never detonates —
chasing unflagged ones would give phantom missile damage, e.g.
ProjectilePlasmaLarge).

- **WEAP + EXPL sum per shot** — the engine adds the token WEAP impact damage
  and the EXPL explosion (Fat Man @45: 5 + 1386; Hellstorm: 379+379, two
  separately-authored halves). **ASSUMPTION**, not ESM-proven — pending
  Pip-Boy card reading (Fat Man, Missile Launcher goldens).
- **EXPL "Base Weapon Damage Mult"** (Gauss family 0.15, Tesla Cannon 0.10) is
  modeled as the intrinsic BASE of the `explosivePayload` twin fold;
  Explosive 2★ legendary (+0.2) ADDs on top (0.15 → 0.35 / 0.10 → 0.30).
  **USER-MEASURED 2026-07-30** (supersedes the prior "additive stacking
  unconfirmed" note — this is a Projectile-Scaling Explosion, see below).
- **Explosive 2★ dual behavior, USER-MEASURED 2026-07-30**: the legendary
  always contributes +20% as BASE damage, pre-DBM — WHICH base it attaches to
  depends on the weapon's explosion kind (CONTEXT.md):
  - **Projectile-Scaling Explosion** (Gauss family, Tesla Cannon w/
    standard/DC muzzle — `explosionBaseWeaponDamageMult`): the +0.2 ADDs to
    the mult itself (see bullet above) — unchanged, already correct.
  - **Curve-Table Explosion** (`fromExplosion` components — launchers,
    Gamma Gun, Cremator, Broadsider, Chaos Engine, War Shrike): the +20%
    instead boosts the explosion's OWN base damage, pre-DBM — a
    `baseDamage` MUL_ADD scoped `damageTypeScope: ['explosive']`
    (effective-weapon.ts), **multiplicative with Demolition Expert /
    'explosive' dbm bonuses**, unlike every other explosion bonus below. The
    direct-impact component (Hellstorm's ballistic 5, say) does NOT also
    spawn a twin — the 20% lands entirely in the explosion, nowhere else
    (decided: the alternative reading would make the 2★ worth ~2× on a
    weapon like Hellstorm or Cremator where direct and explosion damage are
    comparable magnitude).
  - **Chain-suppressed** (Tesla Cannon's Alternate Current muzzle — chain
    lightning, not an explosion, see "Chain lightning" below): the 2★ is
    dead weight, contributes exactly zero.
  - Fixed 2026-07-30: prior to this, a Curve-Table-Explosion weapon's
    explosion never saw the legendary at all (`paper-damage.ts` returns
    early for an explosion component before the twin fold runs), while its
    direct-impact token spawned a spurious twin instead — sharpest on
    Gamma Gun (no direct component: the 2★ contributed literally zero) and
    Hellstorm/Cremator (direct and explosion share the same tier/magnitude).
- **Explosion bonuses are ADDITIVE dbm** (June 2026 patch, **user-reported**):
  Demolition Expert and 'Mod Player Explosion Damage' (SCAV!) route to `dbm`
  with `damageTypeScope: ['explosive']`, folding in the same parenthesis as
  Bloodied/Adrenal (0.9+0.5+0.6 → ×3.0, not the pre-patch ×3.84). The
  'explosive' scope matches `fromExplosion` regardless of elemental type.
- **Not modeled**: explosion radius/AoE itself; self-damage. (OMOD projectile
  overrides swapping the explosion — e.g. Hellstorm's Napalm/Cryo/Plasma tube
  barrels — ARE modeled: see "OMOD-chased launcher payloads" § Launcher-family
  replacement below. The explosive-radius-bonus-to-damage CONVERSION —
  mod_Custom_BunkerBuster, Grenadier — is separately modeled: see
  "Explosive-radius-to-damage conversion" below.)
- Gamma Gun graduated out of the `noDamage` bucket 2026-07-13 — its only
  damage IS the explosion (`fromExplosion` radiation component, tier 18
  curve), now modeled. (Supersedes any older note elsewhere calling it
  unmodeled/excluded.)

### Chain lightning (Tesla Cannon's Alternate Current muzzle)
Engine: `explosionIsChain` (`scripts/extract/normalize/explosion.ts`),
`GeneratedOmod.chainSuppressesExplosion`, `effective-weapon.ts
buildEffectiveWeapon`.

The AC muzzle's `OverrideProjectile` resolves to `ProjectileTeslaBeam_Chain` →
EXPL `SCORE_S19_Chainlightning_TeslaCannon`, which carries `Data.Flags1`
`Chain` and zero damage/mult (`Damage: 0.0`, `Damage Curve Table: null`, `Base
Weapon Damage Mult: 0.0`) — this is chain lightning on direct hit + bounces,
not an explosion. Detected by the `Chain` flag; when equipped, suppresses the
weapon's `explosionBaseWeaponDamageMult` AND strips `explosivePayload`
outright (a 2★ Explosive contributes nothing — **user-confirmed
2026-07-30**), rather than falling back to a normal plain-weapon twin.

- **Not modeled**: the chain damage itself — 100% on direct hit (subject to
  weakpoint/strongpoint like a normal projectile hit, per user report), with
  falloff per bounce, max 2 bounces (3rd target hit). V63-BERTHA
  (`mod_custom_V63-BERTHA_Perk`, *"Lightning Arches to an Additional
  Target"*, one entry-point effect `Add Value -0.1`) adds a bounce and
  reduces the falloff. Needs a target-count concept the engine does not have.
- **Falloff rate is NOT in the ESM** — chain lightning uses an older
  engine-native mechanism. `GMST fBouncedProjectilePowerMult` (`0x00851143`
  = 0.7) is **Hat Trick's** ricochet setting, confirmed **NOT** this
  mechanism — do not reuse it here. User-reported falloff is a 30%-per-bounce
  loss (40% on the 3rd target); whether that composes as subtractive
  (0.7 → 0.4, matching BERTHA's `-0.1` ⇒ 0.8) or multiplicative (0.7² = 0.49
  on the 3rd target) is unmeasured. **NEEDS MEASUREMENT.**

### Explosive-radius-to-damage conversion
Engine: `effective-weapon.ts buildEffectiveWeapon`.

`mod_Custom_BunkerBuster`'s AVIF `ConvertExplosiveRadiusToDamage` (Boolean,
native DFOB consumer, no ESM-visible formula) redirects the player's
accumulated `STAT_ExplosionRadius` bonus (Grenadier r1/r2: +50/+100 via MGEF
AbPerkFortifyExplosionRadius) into damage instead of AoE.

- **Conversion is 1:1** — radius percentage points fold straight into a `dbm`
  fraction (Grenadier r2 + Bunker Buster ⇒ dbm ADD 1.0). **ASSUMPTION**, not
  ESM-proven — no SPEL/PERK/ENCH reads the AV; pending in-game measurement.
- **Placement is ADDITIVE `dbm`, explosive-scoped** (`damageTypeScope:
  ['explosive']`), not a standalone multiplier — consistent with the
  Demolition Expert / SCAV! precedent above. **ASSUMPTION**, user-supplied.
- Explosion radius/AoE itself remains unmodeled — `explosionRadiusBonus`
  (Grenadier's own contribution) is inert with no engine effect unless
  `explosionRadiusToDamage` is also set (Bunker Buster only source today).

## Weapon-intrinsic DoT & OMOD replacement
Engine: `chaseWeaponEnchantment`/`translateEnchantment` (extract-weapons.ts),
`computeDotDps` (paper-damage.ts).

Some weapons carry an on-hit DoT directly on the WEAP's own `Enchantment`
field (Cremator's fire, bladed-melee intrinsic bleeds, Shishkebab, HarpoonGun)
— chased via the same MGEF translation OMOD `Enchantments` use, gated to
Contact-delivery.

- **`GetIsPlayer` inverts for Contact-delivery effects**: a Contact/
  Fire-and-Forget ENCH/SPEL's effects apply to the STRUCK TARGET, not the
  wielder — `=0` is the NPC-target (PvE) branch this calc models, `=1` is
  PvP-only. **Opposite** of every other `GetIsPlayer` reading in this
  codebase (self-gates read `=1` as "granted to the player"). `conditions.ts`'s
  `subjectIsTarget` flag scopes this flip to Contact-delivery only.
- **OMOD REM of an `Enchantments`/`OverrideProjectile` property is skipped,
  not walked** — a REM (e.g. Slow-Burner removing Cremator's base ench) was
  previously walked like an ADD, double-chasing removed content.
- **Replacement semantics**: an OMOD that REMs the base weapon's ench and ADDs
  its own needs its own `dotDamage` to REPLACE the weapon-intrinsic one (one
  chemical-type receiver at a time in-game), not stack. `computeDotDps` folds
  every `kind: 'weapon'` `dotDamage` modifier FIRST as the BASE; every OTHER
  (OMOD/perk) `dotDamage` folds ON TOP via a separate `foldBucket` call. A
  plain OMOD **ADD** stacks with the intrinsic base (HarpoonGun + Barbed
  Harpoon magazine); a **SET** replaces it (`legendary-values.ts`'s
  Slow-Burner entry flips ADD→SET for exactly this). **USER-CONFIRMED**
  design, browser-verified.
- `Modifier.durationSec` remains inert — carried for a future DoT model,
  unused by the engine.

## OMOD-chased launcher payloads
Engine: `overrideProjectileModifiers` (`extract-omods.ts`) — full mechanic
(unified PROJ→EXPL chase, REPLACE-vs-ADD, materialization) is in that
function's doc-comment, not repeated here. Consumed by `buildEffectiveWeapon`
(`effective-weapon.ts`) via `GeneratedOmod.explosionChase`.

Covers 154 `OverrideProjectile` OMODs (mostly cosmetic); the ones with real
explosive-family damage: Lightning Gun's Lobber Barrel, Cryolator's Polar
Lobber Barrel, Dom Pedro's Nitro's/Nitro's-Penetrating, Explosive Arrows/Frame,
Firework Frame, Plasma Caster's Signal Dish Barrel, Nuka-Cola Quantum Gun's
Thirst Zapper mag, Hellstorm's Napalm/Cryo/Plasma tube barrels, Nuka-Launcher.

- **`explosionBaseWeaponDamageMult` is cleared to 0 whenever a chase applies**
  (chain-suppressed too) — the weapon's intrinsic mult-based `explosivePayload`
  twin mechanic (paper-damage.ts) would be redundant with, or wrong alongside,
  a chase's real components.
- **ASSUMPTION**, unconfirmed: HAZD `Target Interval` (re-tick rate) and
  `Limit` (max simultaneous targets) are NOT modeled — magnitude folds as a
  steady-state DoT for the HAZD's full `Lifetime`, which may over/understate
  a lobbed payload's real contribution.
- A `Chain`-flagged EXPL (Tesla Cannon's AC muzzle) is a distinct outcome of
  this same chase — see **Chain lightning** above; it emits no
  `explosionChase`, only `GeneratedOmod.chainSuppressesExplosion`.

## Mixed damage-type OMOD conversion (DamageTypeValues)
Engine: `materializeDamageTypeComponents`, `effective-weapon.ts`.

OMODs like the Gauss Minigun's Tesla Coil Capacitor convert damage types
(`baseDamage MUL_ADD −0.2` ballistic, `+0.5` energy). A bonus scoped to a type
the weapon doesn't deal used to silently no-op.

- **Fold formula**: `final(X) = max(0, (last SET ?? base(X)) + Σ(MUL_ADD ×
  MUL-base) + Σ ADD)`, clamped to 0 (driven negative ⇒ contributes nothing).
  **USER-CONFIRMED.**
- **Missing-type materialization**: a `baseDamage` modifier scoped to an
  absent type synthesizes a NEW component instead of no-op'ing. `scale` =
  Σ POSITIVE MUL_ADD only (a negative MUL_ADD on a missing type is DROPPED,
  not netted against positives) — keeps blanket "−30% on all 6 types"
  automatic-receiver OMODs from spawning phantom components on e.g. a
  ballistic-only Fixer.
- `flatBonus` = `(last SET ?? 0) + Σ ADD`, flat/absolute (no curve scaling —
  literal SET/ADD-shaped values). MUL-derived materialized damage DOES
  level-scale via the fallback component's curve.
- New component borrows its curve from the fallback: the weapon's first
  non-`fromExplosion` ballistic component, else its first non-`fromExplosion`
  component — never `weapon.damageType` (would misroute explosive-first
  launchers). A weapon with no eligible fallback (Gamma-Gun-shaped)
  materializes nothing.
- Every modifier consumed into a materialized type is removed before the
  ordinary per-component fold runs (no double-application). Modifiers scoped
  to types the weapon ALREADY deals are untouched.
- **Twins inherit the parent component's damage type**, not a hardcoded
  `'explosive'`. **USER-CONFIRMED** (Gauss Minigun + Tesla Coil + its
  intrinsic `explosionBaseWeaponDamageMult`: explosive tick deals a phys twin
  off ballistic AND an energy twin off the materialized energy component).
  Generalizing beyond ballistic/energy is an **ASSUMPTION** — only
  Tesla/Science! is user-verified.

## Fire rate — CLOSED
Engine: `src/lib/fire-rate.ts` — formula, `isAutomatic` resolution, and the
Gatling Gun/Gatling Laser `animDurationSec` exceptions are documented on
`getFireRate`'s doc-comment. **CONFIRMED** against 30+ in-game Pip-Boy
readings (live + PTS dumps).

- **melee = 1.0/s stub** — the one open scope. **ASSUMPTION**, pending real
  melee cadence extraction (`#45`).

## Charging weapons
Engine: `src/lib/charge.ts`, `paper-damage.ts`, `fire-rate.ts`,
`effective-weapon.ts`.

Gauss rifle/pistol/shotgun, bows, and tesla/gamma/laser (via charging-barrel
OMODs) ramp damage as the trigger/draw is held. ESM: WEAP.Data "Full Power
Seconds" (FPS) / "Full Power Damage Mult" (FPDM); bows also carry "Minimum
Charge Time". OMODs grant/override FPS/FPDM via SET properties — this is how
tesla/gamma/laser barrels turn charging ON for a base WEAP that doesn't have
it (esm-walked: Tesla's base WEAP has FPDM 1.25/FPS 0 until its Charging Hold
barrel SETs FPS 1.0; Gamma Gun's antenna muzzle and Laser Gun's Sniper Barrel
work the same way).

- **Gate**: `fullPowerSeconds>0 && fullPowerDamageMult>0` (numeric ESM
  fields) — NOT the `HoldInputToPower` flag, since laser sniper barrels
  charge without carrying it.
- **Damage ramp — USER-CONFIRMED, NOT ESM-proven**: `damage(t) = base ×
  (1 + FPDM × t/FPS)`, linear from base (×1) at t=0 up to `base × (1+FPDM)`
  at t=FPS. Worked example: 50 base, FPDM 2.0, FPS 1.0s → 50 at t=0, 150 at
  t=1.0. Despite the name, FPDM is a bonus ON TOP of ×1 base, not a
  replacement. **Consequence**: per-hit damage never drops to 0, so
  partial-charge/spamfire play can beat full-charge burst DPS — expected, not
  a bug. No in-game confirmation of the linear shape itself yet, only the
  full-charge endpoint value.
- **Cadence — USER-CONFIRMED, speed-immune**: `shots/sec = 1/(chargeSec +
  animDelaySec/speed)`. The charge-hold is real wall-clock time (Speed/
  fire-rate buffs never speed up the hold); only the post-release
  attack-delay tail divides by `speed`. Identical for Free Aim and VATS (one
  scenario-wide `chargeTimeSec` input).
- **Explosion-twin inheritance**: charge mult folds into the component base
  BEFORE the `baseDamage` bucket fold, so the Gauss family's intrinsic
  explosive twin inherits it for free (pinned by test).
- **DoT exclusion — user decision, pending measurement**: charge scaling does
  NOT apply to `computeDotDps`'s steady-state DoT (no `chargeTimeSec`
  parameter exists there at all).
- **`minimumChargeTime`** (bows) floors BOTH the UI slider and the engine's
  resolved charge time — the multiplier AT the floor is baked into the
  output (e.g. RegularBow resolves to ≈×1.19 for any hold ≤0.9s, not ×1/0%
  charge). The true below-floor behavior (misfire, 0 damage) is deliberately
  NOT modeled.
- **Overheat is a different, deliberately unmodeled mechanic** (same
  WEAP.Data block) — broken/no-op in live FO76; don't confuse with charging.
- **Naming collision**: Gatling Laser's "Charging Barrels" are an unrelated
  spin-up `animDurationSec` override (see **Fire rate**), NOT this FPS/FPDM
  mechanic — neither Gatling Laser nor Gatling Gun sets FPS/FPDM at all.
- **Still outstanding**: the extraction pipeline doesn't yet read
  FPS/FPDM/MinChargeTime off WEAP.Data or map the OMOD
  `FullPowerSeconds`/`FullPowerDamageMult` properties — every real weapon
  reads as non-charging today, and the six `expected: null` charging goldens
  are no-ops pending that extraction phase.

## Sustained DPS
Engine: `src/lib/engine/sustain.ts`.

- `burstDps = perHitAvg × fireRate` (mag-dump, no reload).
- `sustainedDps = (perHitAvg × shotsPerMag) / (shotsPerMag/fireRate +
  reloadSec)`, `shotsPerMag = floor(Capacity / ammoPerShot)`.
- **ASSUMPTION, unverified**: `reloadSec = Animation Reload Seconds (RGW3) /
  Reload Speed (Data)`. Fixer: 3.20/1.1765 ≈ 2.72s. Golden `expected: null`
  pending a stopwatched mag-dump+reload cycle; the discriminating
  divide-vs-time-scale protocol is in `#2`.
- **Fold shape RESOLVED (stopwatch-leaning)**: OMOD/legendary `ReloadSpeed`
  record rewrites and perk/mutation `WeapReloadSpeedMult` AV fortifies land in
  the SAME `reloadSpeed` bucket (`base + ΣMUL_ADD×base + ΣADD`) — NOT an
  independent `×(1+ΣADD)` layer on top. Backed by in-game A/B stopwatch
  comparisons (Fixer, Gatling Plasma across several stack combos), not a
  pinned golden — a qualitative call, no exact seconds recorded.
- **Per-shell reloaders**: weapons with the `AnimsSequentialReload` keyword
  (Lever Action Rifle, Pump Action Shotgun, Single Action Revolver) repeat
  the reload animation once per round: `reloadSec = animationReloadSec ×
  shotsPerMag / reloadSpeed`. Keyword is ESM-proven; reading the animation
  time as the PER-SHELL increment is an **ASSUMPTION** pending stopwatch.
  **Double-Barrel Shotgun is deliberately NOT per-shell**
  (`animsDoubleBarrelShotgun` — a single combined break-action animation).
- Magazine OMODs map `AmmoCapacity`/`ReloadSpeed` properties to the
  `ammoCapacity`/`reloadSpeed` buckets, same fold as Speed. No magazine
  (melee/unarmed) ⇒ sustained = burst, reload 0. Weapons extracted before
  the reload field landed are treated as zero-cost reload.

### Reload-skip & free-ammo expected value
Three **sustain-chance** buckets (`reloadSkipChance`, `reloadSkipChanceBash`,
`ammoFreeChance`) fold via independent-probability union (`foldChanceUnion`,
`effective-weapon.ts`) and apply as a SEPARATE multiplicative stage on the
already-folded reload time/capacity — not inside the additive folds (would
wrongly stack with Quad/reload-speed mods).

- `reloadSec_eff = reloadSec × (1 − reloadSkipChance)`. Sources: Quick Hands,
  Wild West Hands — both proc PASSIVELY on the reload itself (EP182 "Auto
  Fill Weapon Clip"), so the skip is free (no time cost).
- **Battle-Loader's gets its OWN channel (`reloadSkipChanceBash`)**: its ESM
  trigger is EP199 "Instant Reload Clip On Bash", gated `IsPowerAttacking` in
  its own extracted conditions (dropped as a CONDITION per **Armor** below,
  but preserved structurally via the bucket split) — a bash swing is a real
  action with a time cost, unlike a passive reload skip. `sustain.ts`'s
  `sustainTiming` composes both channels: `pFree = reloadSkipChance`,
  `pBash = reloadSkipChanceBash` (both clamped to [0,1]);
  `realReloadSec = animationReloadSec × perShellMult / reloadSpeed`;
  `reloadSec = (1 − pFree) × ((1 − pBash) × realReloadSec + pBash × bashSec)`.
  **Free skip wins first — a modeling choice, not ESM-proven**: when both
  would otherwise apply on the same reload, the free channel takes priority
  (no bash swing needed at all). At `bashSec = 0` this degenerates to the
  plain union `realReloadSec × (1 − union(pFree, pBash))`, i.e. the
  two-channel model is a strict generalization (regression-tested,
  `sustain.test.ts`).
- **`bashSec`** is `PlayerConditions.battleLoadersBashSec` (UI slider, default
  `DEFAULT_BATTLE_LOADERS_BASH_SEC` = 0.75s) — **ASSUMPTION, user-approved
  placeholder pending an in-game stopwatch** (`#61`). `reverseOnslaughtAvgStacks`
  and `bulletStormAvgStacks` thread the same value through their own
  `sustainTiming` calls.
- `capacity_eff = capacity / (1 − ammoFreeChance)`. Sources: Tesla Science 5,
  Dom Pedro Fortunate magazine mods.
- Multiple sources on the SAME channel compose as independent probabilities:
  `1 − Π(1 − chanceᵢ)`.
- Fortunate's "add a round past max clip" proc is ignored in the EV
  amortization (same treatment as "don't consume ammo").
- **Tesla Science 5's heavy-gun gate is DESCRIPTION-sourced** — the ESM
  effect carries only a random-percent roll, no weapon-class condition; the
  `weaponClass: ['heavy']` gate is hand-supplied (`buff-overrides.ts`), not
  ESM-proven.

### Fast Fighter & the moveSpeedBonus bucket
- Fast Fighter carries **no effects on-record** — the "50% of bonus movement
  speed → reload speed" conversion is engine-native, modeled as a
  hand-authored override (`reloadSpeed` ADD, identity curve on
  `moveSpeedBonus` × scale 0.5). The 50% factor and the "bonus = Σ SpeedMult
  fortifies" reading are **DESCRIPTION-sourced, not ESM-proven**.
- `moveSpeedBonus` bucket reads AV `SpeedMult` at scale 0.01, bootstrap-folded
  once per `buildEffectiveWeapon` (mirrors `onslaughtMaxStacks`) — not a
  movement model, nothing else consumes it.
- **Sprint/swim-gated sources are excluded** (`IsSprinting()`/`IsSwimming()`
  gates marked inactive — the calc models grounded, non-sprint combat);
  non-sprint sources (Gun Runner, Squad Maneuvers, Portable Power) DO feed
  it. Whether in-game Fast Fighter counts sprint-only bonuses while standing
  still is **UNMEASURED** (`#69`).
- A net move-speed penalty grants nothing (curve clamps at 0,0) — direction
  unverified in-game.

## Crit meter
Engine: `src/lib/engine/crit-meter.ts`.

- `fillPerHit% = fVATSCriticalChargeBase + weapon's own Crit Charge Bonus +
  curveY(LCK)`. **USER-IDENTIFIED, ESM-CONFIRMED.** `fVATSCriticalChargeBase`
  = 5.0 (0x00249662); the per-LCK term is curve table
  `CT_LuckVATSCriticalCharge` (0x00655629, domain LCK 1–100 — matches the
  SPECIAL clamp exactly — reached via DFOB `LuckVATSCriticalChargeCurve_DO`
  0x0065562A), extracted via `extract-curvetables.ts`'s
  `CURVE_TABLE_SINGLETONS` → `player/vats/luckvatscriticalcharge.json`.
  **`fVATSCriticalChargeMult` is DEAD** — not read by the live mechanic;
  don't reintroduce it as a multiplier. The weapon's own "Crit Charge Bonus"
  WEAP field is ADDITIVE, ESM-raw and literally 1.0 for 280/282 obtainable
  weapons (the two SnapMatic/disposable cameras read 0).
- Consumption: `fold(critConsumption over 100)` — Critical Savvy SETs 85/70/55
  — × `(1 − 0.10×limitBreakingPieces)` (hand-modeled).
- Steady state: crit every `ceil(cost/fill)+1` shots, max every 2nd.
  **User-verified anchor**: 16 LCK + Crit Savvy 3 + 5× Limit Breaking → every
  2nd shot (`crit-meter.ts`'s module doc comment).
- Per-weapon Crit Charge Bonus rounding unverified in-game.

## Value curves

Curve-bearing effects (Curve Table + input AV) supply Y at X = a
player/weapon stat, overriding the flat magnitude. Extracted automatically
(`normalize/mgef.ts`, `Modifier.curve`).

- **Single-point curve tables** (exactly one `{x,y}` pair) carry no real
  input axis — the engine reads that Y as a flat magnitude directly,
  bypassing `curveInputAv` resolution (which would otherwise drop the
  modifier for having no resolvable input AV). Confirmed on three alcohol
  `dbm` effects whose Curve Y matches their flat EFIT magnitude exactly.
- **Null-input DoT curves default to `itemLevel`**: weapon-mod
  bleed/burn/shock/poison DoTs carry a multi-point curve with NO Actor Value
  at all. `normalize/mgef.ts` defaults these to `itemLevel` when the curve's
  last point is ≤100 (level-shaped domain) — restores ~125 obtainable
  weapon-mod DoTs. The guard matters: some MGEFs share an edid with
  creature/event effects on a genuinely wider domain (X up to 540+), which
  correctly stay dropped rather than misread as item level.
- **Cross-family `HasPerk` gates → `perkFamilyRank`**: a `HasPerk` row
  referencing ANOTHER perk family's rank chain (Bullet Storm's reload curve
  gated on Lock and Load, Bear Arms' bash gate) translates to a runtime
  `perkFamilyRank` condition rather than `unresolved`. Owning rank N
  satisfies `HasPerk` on every rank ≤N of that family (mirrors the
  self-family rule).
- **Shotgun Champ's projectile-count axis** — **USER-CONFIRMED**: projectile
  count SCALES the bonus (curve X, new `projectileCount` CurveInput reading
  the effective weapon's projectile count); crippled-limb presence is a
  binary GATE, not a per-limb scale like Bully's (`perCrippledLimb` with
  `max: 1`).

| Effect | Input (X) | Curve | Notes |
|---|---|---|---|
| Bloodied | current HP fraction | (0.05→+130)…(1.0→0) | linear; clamped below 5% HP |
| Nerd Rage! | current HP fraction | (0.05→80, 0.2→40, 0.8→1, 1.0→0) | perk had zero base magnitude — curve IS the value |
| Junkie's | addiction count | (1→10…10→100) | +10%/addiction to +100% at 10; count itself uncapped in-game |
| Aristocrat's | caps on hand | 0→0…17000→30…29000→50 | up to +50% at 29k caps |
| Juggernaut's (weapon mod) | ABSOLUTE current HP | (0→0, 1000→100) | +0.1%/HP; see **Max HP (derived)** |
| Unarmored-target | enemy DamageResist | extracted | INERT until enemy defenses land |
| Adrenal (legendary + perk, both) | kill streak | (0→0, 1→10, 10→100) | +10%/stack; curve domain confirms the streak cap of 10 |
| Polished | equipped weapon condition % | 27-point table, (1.0→0)…(2.0→+60%) | 100% = full condition (no bonus), 200% = over-repaired max; UI field `weaponConditionPct` 0–200 |

**Don't conflate the four Adrenal-family sources** (same kill-streak trigger,
different mechanics): Adrenaline perk (+10%/stack dbm), Adrenal Reaction
mutation (+5%/stack, +6.25 SiN), Adrenal legendary WEAPON mod (+10%/stack
dbm), Adrenal legendary ARMOR mod (scales DR+ER, out of scope until armor
modeling).

## Hand-supplied values
Policy: wiki-sourced values are banned — ESM-derived or in-game-measured only
(`src/data/overrides/`). Effects the ESM can't express stay inert with a
picker badge.

| Effect | Model | Status |
|---|---|---|
| Furious | Onslaught stack counter (+9 max, +5%/stack dbm) — see **Onslaught** | ESM granted-perk chase |
| Instigating | +50% dbm while enemy HP ≥ 60% | ESM |
| Executioner's | +50% dbm while enemy HP ≤ 40% (default 100 → inactive) | ESM |
| DmgVs* family (Hunter's, Exterminator's, Ghoul Slayer's, Assassin's, Troubleshooter's, Zealot's, Mutant Slayer's) | +50% dbm vs matching enemy race/keyword, active since 2026-07-15 via the Target picker's race | ESM |
| Bully's / Tormentor | dbm per crippled limb (+25%/+20%), cap **6** | ESM value; cap is ours |
| Explosive (2★) | Always +20% BASE damage pre-DBM (see **Launcher explosion damage** § "Explosive 2★ dual behavior"). On a Projectile-Scaling Explosion: `explosivePayload` spawns an explosive twin per component, folding dbm/crit/PA/wholeDamage but NOT sneak/body-part (see **Formula structure**). On a Curve-Table Explosion: rewritten into a `baseDamage` MUL_ADD on the explosion itself, no twin. Chain-suppressed (Tesla + AC muzzle): contributes nothing. | ESM property; branch USER-MEASURED 2026-07-30 |
| Crippling / Basher's | extracted to `limbDamage`/`bashDamage` — INERT until limb-targeting/bash is modeled | ESM |
| Scaly Skin (+ Chameleon/Grounded ripple, same AV route) | +DamageResist/+EnergyResist extracted to `damageResistGain`/`energyResistGain` (flat points, 50/62 normal/Class-Freak-boosted) — INERT until wearer-side resist mitigation is modeled | ESM-confirmed |
| Pyromaniac's / Viper's / Severing's | +50% dbm while target has an active fire/poison/bleed status (toggle, default off); Viper's `ImmuneToPoison` gate CONSUMED (target assumed vulnerable) | ESM granted-perk chase |
| Last Shot | +100% dbm on the magazine's last round (toggle, default off); steady-state doesn't model the once-per-mag cadence | ESM |
| Encircler's | +10%×N from `enemyGroupCount` tiers; default count **1** (target itself) | ESM |
| Fencer's (melee) | +12.5–50% from exact `teammateCount` tiers; range-check CONSUMED (teammates assumed in range) | ESM |
| Mutant's / Gourmand's / Lucid | curve-driven on `mutationCount`/**Hunger & thirst tiers**/`feralTier` | ESM |
| **Hunger & thirst tiers** | `hungerThirstTier`(0–8) = foodTier + drinkTier (two 0–4 sliders). **INFERENCE**: the sum decomposition matches Gourmand's behavior but isn't record-proven | ESM AV max + inferred composition |
| **Feral meter** names | 8/6–7/4–5/2–3/0–1 banding of 5 tier names over 9 values. **INFERENCE** (display-only) | ESM names; banding ours |
| Two Shot | ×1.75 confirmed (Fixer@50: 103→180.25); extra projectile feeds no damage term yet (deferred) | ESM + **user-confirmed** 2026-07-10 |
| Anti-Armor family | −50% target armor via `armorPen` — INERT until enemy DR lands | ESM |
| Bleed/burn/shock mod DoTs | `dotDamage`, **refresh-only model** (re-applying resets the timer; steady-state = summed magnitude). **INTERPRETED as dmg/sec, NOT ESM-proven** (ESM only proves total-over-duration). Exempt from sneak/crit/body-part (**Formula structure**) | ESM magnitude; rate reading ours |
| Adrenal Reaction (mutation) | +5%/stack (+6.25% SiN); below x=1 the curve clamps to its lowest point, same convention as the game's own curve tables (not a zero-floor special case) | ESM curve |
| **Tenderizer** | +0.1% dbm/stack, manual 0–1000 (cap +100%), target-side, applied UNCONDITIONALLY | ESM (2026-07-15); cap is ours |
| **Follow Through / Taking One for the Team** | Both `wholeDamage` ×(1+value) target-side debuffs, exact card-description match (10/20/30/40%/rank). Both are conditional 10s-window procs, so each is a manual 0/10/20/30/40% toggle (default 0), applied UNCONDITIONALLY, composing multiplicatively. 2026-07-21 re-walk: both grant a PERK to the struck/attacking actor via `Apply Combat Hit Spell`/`Apply Combat Hit Spell Taken` → SPEL → MGEF "Perk to Apply" (`FollowThroughDamageDebuffPerk01` 0x005A5D6D / `LGN_TakingOneForTheTeam_DamageIncrease_Perk01` 0x005B01AE), each carrying Entry Point "Mod Incoming Weapon Damage", function "Multiply Value", value 1.1/1.2/1.3/1.4 by rank — confirms the `wholeDamage` shape directly rather than by card-description inference alone | esm-walk-confirmed |
| SPECIAL buffs (Buffout, Bufftats, Mentats, Berry Mentats) | flat unconditional ADDs into STR/LCK; other stats stored-inert until perk-SPECIAL scaling. Stacking in **Consumable stacking & addictions** | ESM |
| Juggernaut's max-HP input | `maxHealth` is DERIVED (**Max HP (derived)**), read-only | — |
| **Strange in Numbers** | DERIVED: active iff card equipped AND `teammateCount≥1` (teammate mutation status not modeled — **user decision**) | card text + user decision |
| Kill-streak slider gating | detection is an existence scan over assembled modifiers, unlike Onslaught's dedicated bucket fold | engine wiring |
| United Ordeal | Ghoul-only, +1/+2/+3 all 7 SPECIAL, ranks 1–3, while `playerIsGhoul` AND `teammateCount≥1` | ESM |
| Public team bonuses | user-selected toggle (None/Casual/Exploration), NOT derived; magnitude `min(teammateCount+1,4)` is a **documented bond-score-proxy simplification** | ESM gate + ours |

## Consumable stacking & addictions
Implementation: `src/lib/consumable-rules.ts` (single shared implementation
for build reducer, persistence codec, and picker UI).

Binding rules (**user-specified**): Chem — one active at a time. Alcohol —
one active at a time, independent of chem. Food/non-alcohol drink — stack
freely UNLESS they grant the "same bonus", which displaces.

- **"Same bonus" is derived from ESM data, never hand-authored** —
  `dispelKeys` (one key per dispel-flagged MGEF effect, its resolved KYWD
  edids joined). Two buffs collide iff their key SETS are IDENTICAL —
  exact-set equality, not any-keyword intersection (intersection is provably
  wrong: every food carries the same broad non-discriminating keywords
  regardless of what it buffs).
- **Displacement is item-level, not per-effect** — a collision on any single
  `dispelKeys` entry evicts the WHOLE item. **Documented simplification** of
  the game's real per-effect dispel system, not an oversight.
- **Addiction**: each ALCH's `Effect Data.Addiction` field points directly at
  an `AbAddiction<Name>` SPEL — no AVIF chase needed. Catalog is scoped to
  addictions caused by an obtainable, selectable consumable.
- **Suppressors survive the zero-modifier gate**: a record with an addiction
  AND ≥1 `dispelKeys` entry is kept even with zero routed modifiers (Med-X,
  Nukashine variants) — taking a 0-damage chem still drops a Junkie's stack,
  so it's a real (negative) lever.
- `addictionCount` (Junkie's curve input) is DERIVED, never stored: selected
  addictions minus those SUPPRESSED by a currently-active addictive
  consumable — **category-agnostic** (chem/alcohol/food/drink all suppress
  equally, **user decision**), checked by consumable-id membership.
- **Withdrawal penalties** (2026-07-14): each addiction's own effects are
  flat Detrimental Peak-Value SPECIAL debuffs, uniform across all 12
  families (no Class Freak gating — verified). Applied at selection-time, not
  condition-time — the modifiers themselves stay unconditional once a family
  is selected-and-unsuppressed.

## Magazines & bobbleheads
Engine: `extract-buffs.ts`, `consumable-rules.ts`.

Magazines/bobbleheads are ALCH records carrying dedicated keywords
(`MagazineKeyword`+series type, `BobbleheadKeyword`+stat type) checked ahead
of the chem/food/drink/alcohol classification.

- SPECIAL bobbleheads are a direct Peak Value Modifier on the SPECIAL AV.
  Combat magazines/bobbleheads are a Script-archetype MGEF with a "Perk to
  Apply" grant, auto-chased through the same path a legendary's
  `AttachedPerk` uses — no new plumbing needed.
- **Sorting** uses `localeCompare(..., {numeric:true})` — plain string sort
  put "...10" before "...2" for numbered issues.
- **Bonus text** (`describeBuffModifiers`) is derived from the extracted
  `Modifier[]`, deliberately NOT the ESM's own card description text — the
  description can promise a condition the data doesn't carry (e.g. Guns and
  Bullets 7 says "without scopes" but its modifier is unconditional).
  Known-inert entries say so inline.
- **Stacking**: one magazine and one bobblehead active at a time, independent
  of each other and of chem/alcohol/food/drink.
- **Aim-down-sights toggle** (`PlayerConditions.isAimingDownSights`, default
  false): gates override-wired scoped-damage magazines (Awesome Tales 10's
  `GetInIronSights()` row). User-editable in Conditions.
- **Under-alcohol derived flag** (`PlayerConditions.underAlcoholEffect`,
  derived in `resolveLoadout` from any active alcohol-category consumable):
  gates Live & Love 5's `HasMagicEffectKeyword(AlcoholEffect)` row.
- **Live & Love 5 magnitude (+2 LCK)**: **INFERENCE** — the MGEF is
  Script-archetype with no extractable Peak Value Modifier; magnitude taken
  from the card description (`buff-overrides.ts`).
- **No inert entries remain** — every extracted magazine/bobblehead resolves
  to a real, conditionally-active modifier. Live & Love 2 (`dbm` +5%) gates on
  `teammateCount` ≥ 1 (`IsMemberOfAPlayerTeam` translated the same way Herd
  Mentality's condition is) — 0% ΔDPS solo is correct team-buff behavior, not
  an extraction gap.

## Carnivore's / Herbivore's food scaling
Engine: `src/lib/diet-mutations.ts`.

ESM-proven end to end: `Mutation_Carnivore`/`Herbivore` SPELs grant
Script-MGEF perks whose "Mod Spell Magnitude" entry points rescale ingested
food (×2.0 normal / ×2.5 Strange-in-Numbers for matching-type food, ×0 for
the opposing type).

- **The asymmetry is real**: Carnivore only ZEROES Vegetable-tagged food —
  pure Herb/Fruit dishes keep their undoubled benefit.
- Only effects carrying `SURV_EffectTypeFood{Buff,Hunger,Healing}` scale —
  audited across all 77 meat/veg foods; the one exception is
  `Moon_Rudy_Pozole` (lacks the keyword, exempt in-game).
- **Mixed meat+vegetable dishes**: both entry points apply and compose
  ×2×0=0 for either mutation (zeroing-wins). No damage-relevant record
  carries both tags today — this rule is **shape-derived, NOT measured
  in-game**.
- Carnivore+Herbivore together is impossible in-game (each cures the other);
  enforced on toggle. A hydrated URL somehow carrying both zeroes all tagged
  food (degenerate-but-consistent).
- RadX suppression of mutation effects is NOT modeled — mutation selection
  already IS the active/inactive toggle.

## Mutation penalties & Class Freak
Engine: `src/lib/class-freak-mutations.ts`.

ESM-proven via two mechanisms:
- **Mechanism A (generic keyword scaling)**: every mutation "Reduce" MGEF
  carries `AbilityTypeMutation_NegativeEffect` + `Detrimental`. Class Freak's
  3 ranks each carry a "Mod Spell Magnitude" entry (×0.75/0.5/0.25) gated on
  that keyword. Tagged set: EggHead, Eagle Eyes, Talons, Marsupial, Bird
  Bones, Herd Mentality, Adrenal Reaction.
- **Mechanism B (per-tier granted perks)**: Grounded's energy-DR-reduction
  perk bakes 4 discrete tiers via `HasPerk(ClassFreak0N)` gates directly (no
  app-side expansion needed). **Fold shape USER-RESOLVED**: "Mod Weapon Attack
  Damage" routes to `wholeDamage` (a standalone multiplier), NOT `dbm` — a
  genuinely different Perk Entry Point from "Mod Weapon DMG Bonus Mult" (the
  real `dbm` source, function "Add Actor Value Mult" on `STAT_DamagePerk`),
  carrying its own Function Type "Multiply Value", a bare scalar. Not provable
  from static ESM data alone; corroborated by its sibling entry point "Mod
  Incoming Weapon Damage", independently confirmed `wholeDamage`-shaped with
  the same function type (see **Hand-supplied values**' Follow Through /
  Taking One for the Team row). `wholeDamage` and `baseDamage` are
  mathematically equivalent here (Grounded's gate is weapon-level, not
  per-component), so this is a bucket-family-consistency choice, not a
  correctness fork — full reasoning in the `wholeDamage`/`baseDamage` doc
  comments (`src/types/modifiers.ts`) and `ENTRY_POINT_BUCKETS`
  (`scripts/extract/normalize/mgef.ts`). Practical effect: Grounded's penalty
  cuts the total by its full fraction rather than being diluted inside a large
  dbm/crit/sneak/tenderizer sum.
- `classFreakRank` is DERIVED, never stored (reads the equipped card's rank).
- **The MGEF `Detrimental` flag negates flat value-modifier magnitudes
  globally** — without it, "Reduce" effects extract POSITIVE (EggHead as +3
  STR). DoTs (also Detrimental) are exempt — their magnitude IS the damage
  amount.
- `IsSpellTarget(RadX|Serum_*)` rows are CONSUMED (suppression stays
  unmodeled — mutation selection IS the toggle). This is what un-inerts the
  SPECIAL penalties.
- **SPECIAL folds are condition-aware** (`derivePlayerStats` folds through
  `foldBucket` with the derived gates), so a conditioned SPECIAL modifier
  still reaches net stats.

## Target distance (Close / Far)

Engine: `src/lib/distance.ts` (constants, `rangeFalloffMult`), `resolve.ts`
(`targetDistance` condition case), `effective-weapon.ts` (range-bucket fold),
`scenarios.ts` (bootstrap fold → `rangeFalloffMult`/`ScenarioSet.range`),
`paper-damage.ts` (`outerMult`/`explosiveOuterMult`).

- **Close gate = 850 raw units** — GMST `fDistanceForCloseDamage`.
  **ESM-PROVEN.** `STAT_DmgVsClose`/`STAT_DmgVsFar` themselves carry NO
  distance-condition rows anywhere in ESM — the actual range check happens in
  native engine code, not data.
- **Far gate = 1000 raw units (46.875 Pip-Boy units).** **MEASURED** (user,
  2026-07-18; re-confirmed 2026-07-19): no ESM record gives a number (DFOB
  `DamageVsFar_DO` 0x00815EE7 only confirms the entry point exists) —
  measured in-game via the CAMP-foundation method (~3.9 foundation pieces ×
  12 Pip-Boy units each × `PIP_BOY_UNIT_DIVISOR` 64/3 ≈ 1000).
- `EnemyConditions.targetDistance` is now a **continuous number** (raw game
  units), replacing the old manual three-way `'close'|'none'|'far'` toggle —
  a single continuous slider now drives both the Close/Far perk gates
  (threshold comparison: `d ≤ 850` / `d ≥ 1000`, boundary-inclusive both
  ways) AND the range-falloff multiplier below. Default
  `DEFAULT_DISTANCE_UNITS` = 900 — strictly between the two gates, preserving
  the old default's "neither fires" behavior. Consumers of the gates:
  Guerrilla family (close), Down Ranger/Rifleman family (far), Sniper's
  legendary (+100%, far).
- **Composite range-falloff model.** **USER-CONFIRMED** mechanism (the
  reconciliation of the two ESM-proven pieces below, re-confirmed
  2026-07-19 — no shape validation pending); the curve and field names
  themselves are ESM-proven.
  - `d ≤ minRange` → ×1.0.
  - `minRange < d ≤ maxRange` → linear interpolation from ×1.0 to
    `outOfRangeDamageMult` (WEAP Data — Hunting Rifle: minRange 2612, maxRange
    5225, outOfRangeDamageMult 0.5).
  - `d > maxRange` → `outOfRangeDamageMult × curveY(X)`, where
    `X = (d − minRange) / (maxRange − minRange)` — **NOT** `d / maxRange`.
    The curve is `CT_Player_PercentOfMinToMaxRangeDMGMult` (0x008407AC, DFOB
    `CombatFormulaPercentOfMinToMaxRangeDMGMult_DO` 0x008407AD; ESM-PROVEN,
    byte-identical across every live/pts dump sampled through 2026-07-18):
    points (1.0, 1.0), (1.5, 0.75), (1.75, 0.55), (2.0, 0.2), clamped flat to
    its own endpoints outside its domain (game-accurate — same convention as
    every other curve table). X = 1.0 exactly at `d = maxRange`, so the curve
    segment is continuous with the linear segment's endpoint there. With the
    sampled-weapon norm `maxRange = 2 × minRange`, X reaches 2.0 (the curve's
    floor, 0.2) at `d = 1.5 × maxRange`, not `2 × maxRange`.
  - Guard: a non-positive or degenerate `[minRange, maxRange]` span returns
    ×1.0 (`rangeFalloffMult`'s own doc comment).
- **Melee exemption**: melee weapons never reach `rangeFalloffMult` — gated by
  the caller (`scenarios.ts`'s `isMelee` check), not a field-value guard,
  because melee `outOfRangeDamageMult` values are sentinel-ish (Shishkebab
  0.0, Machete −1.0) and must never be read.
- **Explosive-component EXEMPTION** (supersedes the prior "inclusion"
  reading, **USER-CONFIRMED** 2026-07-19): `rangeFalloffMult` is folded into
  `outerMult` only — explosive components (launcher payloads, Explosive-
  legendary twins) do NOT fall off with engagement distance at all via this
  curve. `minRange`/`maxRange`/`outOfRangeDamageMult` model a projectile's own
  flight/spread degrading with distance; an explosion's payload instead falls
  off by distance from its OWN blast center within its `Inner Radius`/
  `Outer Radius` (EXPL `Data`) — a spatial-precision mechanic, unmodeled and
  distinct from engagement range. Joins the sneak/body-part-mult carve-outs as
  a third confirmed explosive exemption.
- **Sniper's magnitude rides a Global reference**, not the effect's own
  Magnitude field (which reads 0) — a narrow, field-shape-specific
  resolution, confirmed absent from other zero-magnitude effects (which are
  genuinely script-driven).
- Range OMODs (`weaponMinRange`/`weaponMaxRange`/`weaponOutOfRangeMult`
  buckets): mostly barrels (`_PARENT_mod_WEAPON_Barrel_Long_Range`
  0x0027ABFA-shaped, MUL_ADD 0.5 on both range fields), one SET
  (`mod_PlasmaGun_barrel_Flamer_Abraxo`, `weaponOutOfRangeMult` → 0.7);
  scopes carry none. Folded in `effective-weapon.ts` over the base weapon's
  `minRange`/`maxRange`/`outOfRangeDamageMult` (same pattern as
  `ammoCapacity`/`reloadSpeed`).

## VATS AP economy & manual-aim hit rate
Engine: `src/lib/engine/ap-economy.ts` — pool/regen formula, the race-based
%-of-max model, Conductor's refresh-only HoT, the `AP_REGEN_DELAY_SEC` GMST
provenance, and the pool-cycle uptime model are all documented on that
module's own doc-comment, not repeated here.

- **Per-shot VATS AP cost**: WEAP `Data."Action Point Cost"`, rewritten by
  the `vatsApCost` bucket. **Engine keeps the raw float** (e.g. 16×0.7 =
  11.2); Pip-Boy displays `round(cost)` (user-measured 2026-07-29) — do not
  round to match the Pip-Boy.
- **Instant AP restores are OUT OF SCOPE by design** (mirrors instant heals)
  — one-shot Value-Modifier events have no steady-state meaning. Same verdict
  for on-kill restores (Grim Reaper's Sprint, Inertial) — need enemy TTK
  modeling (phase 3).
- **Hydration AP regen** (baseline): a hidden ability grants +35% AP-regen to
  every fully-hydrated non-ghoul with no perk required. Modeled as a
  **default-ON** toggle. **ASSUMPTION**: lower hydration tiers are NOT
  modeled — all-or-nothing, optimal play = fully hydrated. **Rejuvenated**
  layers hand-authored deltas on top (`perk-overrides.ts`); its rank-2 ESM
  tier also requires Rads ≤100 — assumed true (optimal play).
- **Packin' Light** (**Encumbrance**): its `IsOverEncumbered()=0` gate is
  consumed as always-true — the calculator assumes the player is never over
  encumbered.
- **Number Cruncher** ("+2% damage per AP cost"): routed as `dbm 0.02` scaled
  by the EFFECTIVE (post-OMOD-fold) per-shot AP cost, in every scenario —
  **user-confirmed** it improves free aim too. Stock Fixer (16 AP) → +32%.
- **VATS canonical DPS = `apLimitedDps`** (2026-07-29, **user decision**):
  the card headline, headline strip, auto-emphasis pick, suggestion deltas,
  and the vs-target effective sustained all use the duty-cycle blend
  `uptime × vatsSustained + (1 − uptime) × freeAimSustained` — during the
  AP-empty pause the player free-aims instead of idling. The post-mitigation
  `effective.sustainedDps`/`ttk` blend the same weights via
  `blendEffectiveDps` (`scenarios.ts`); `effectiveAgainstEnemy` no longer
  takes uptime, `perHit`/`retainedPct` stay VATS-only.
- **Passive AP regen during free-aim fallback** (**CONFIRMED** in-game
  2026-07-29, `#75`): keeps ticking at full `regenPerSec` while firing in
  free aim — sighted, hip, and scoped ADS all cost no AP. Sole exception:
  holding breath while scoped drains AP and suppresses regen; the fallback
  window assumes no breath-hold.
- Display: AP breakdown always shown when `ScenarioResult.ap` exists; ranged
  weapons only (melee/VATS-melee AP costs are out of scope).
- **Manual-aim hit rate** (`hitRatePct`, 10–100, default 100): Free Aim's
  "does the shot hit the enemy at all" share. Scales free-aim **SUSTAINED**
  dps only — never per-hit or burst. Independent of `bodyPartHitRatePct` —
  see **Body parts (BPTD-extracted)** — that's "of the shots that hit, how
  many find the aimed part vs. center mass".
- **Manual VATS hit rate** (`vatsHitRatePct`, 10–100, default 100): VATS's
  *only* accuracy knob — the share of VATS shots that land on the targeted
  body part. A user-supplied estimate, not computed accuracy; auto-computing
  VATS hit chance from distance/Perception/perks stays **permanently out of
  scope**. Unlike Free Aim, a VATS miss deals **zero damage** — no
  torso/center-mass fallback (2026-07-31: previously VATS shared
  `bodyPartHitRatePct`'s part/torso blend with Free Aim — see
  `bodyPartBlendedHit`'s doc comment in `scenarios.ts`). Also scales the
  VATS-weighted term of `ap.apLimitedDps`; the fallback term uses free aim's
  own `hitRatePct` instead (a miss still costs AP).

## VATS hit-chance aggregate (display-only)
Engine: `scenarios.ts` (bootstrap fold → `ScenarioSet.vatsHitChanceBonus`).
UI: `TargetSection.tsx` pill next to the VATS hit-rate slider.

- **Aggregation ≠ computation** (user decision): the standing "auto-computing
  VATS hit chance from distance/Perception/perks is permanently out of
  scope" ruling bars DERIVING a hit-chance NUMBER from game state; it does
  not bar summing already-known ESM bonus MAGNITUDES for display.
  `vatsHitChance` (`regime: 'display'`) is consumed ONLY by the UI pill —
  **never** threaded into `sustainedDps`/`apLimitedDps`/any damage term
  (regression-tested, `engine.test.ts` "vatsHitChanceBonus"). The manual
  `vatsHitRatePct` slider stays the sole authoritative VATS hit-rate input.
- **Fold base is 1, not 0** (unlike `armorPen`/`onslaughtMaxStacks`):
  `foldBucket(mods, 'vatsHitChance', 1, ctx) - 1` — `foldOps` scales MUL_ADD
  terms by the base, so base 0 would silently zero out every MUL_ADD source.

Modeled sources (all ESM-proven unless noted):

| Source | Route | Contribution |
|---|---|---|
| V.A.T.S. Enhanced (OMOD) | flat ADD `STAT_VATSAccuracy` | +0.50 |
| Awareness perk | curve vs Perception AV, new `CurveInput 'perception'` | +0.05 to +0.50 by rank |
| Eye of the Hunter (Ghoul-only) | `playerIsGhoul` + `targetDistance('far')` — **APPROXIMATION**, ESM's own gate is a numeric distance threshold, collapsed onto the far-range bucket | +0.20/+0.25/+0.30 |
| V.A.T.S. Matrix Overlay (7 PA helmets) | `FortifyVATSAccuracyChemPerk`, Multiply Value ×1.1 | MUL_ADD +0.10 |
| Orange Mentats | flat Peak Value Modifier, 300s | +0.10 |
| Hoppy Hunter IPA | Multiply Value ×0.8 (penalty — pill hides at ≤0) | MUL_ADD −0.20 |
| Twisted Muscles (Class Freak tiers) | Multiply Value ×0.7/0.77/0.85/0.93 | MUL_ADD −0.30/−0.23/−0.15/−0.07 |

Concentrated Fire does NOT feed this aggregate — its hit-chance half is a
multiplier, not additive; see **Concentrated Fire stacks** below.

- **Concentrated Fire stacks**: the `STAT_DamagePerk` plumbing perk carries
  EP135 "Mod VATS Concentrated Fire Damage Mult" (0.01 × `ConcentratedFireRank`
  AV) and EP109 "Mod VATS Concentrated Fire Chance Bonus" (4.0 non-auto /
  1.0 auto × the same AV); max stacks GMST `iVATSConcentratedFireBonus` = 20.
  **ESM-PROVEN**, but both entry points stay `ENTRY_POINT_IGNORED` pending an
  esm-walk of how `ConcentratedFire01-03` write the AV — the
  `perk-overrides.ts` `ConcentratedFire` override is a hand-authored
  stand-in, **must be removed in the same commit if the extraction lands**
  (double-stack hazard, `#48`).
  - **Damage half**: each rank adds `dbm` ADD 0.01/0.02/0.03, gated
    `vatsOnly` + `stacks(counter: 'concentratedFire', max: 20)`. The stack
    COUNT is a manual slider (default 0) standing in for the native
    per-target consecutive-shots counter (resets on target switch) — the
    calculator assumes a steady stream of hits on one body part.
    **ASSUMPTION**: the slider's value, not the ESM-proven magnitude/cap.
  - **Hit-chance half — EP109 unit USER-RESOLVED**: a MULTIPLIER on the
    game's own computed VATS hit chance, not additive % — per stack, semi
    ×(1+0.04×rank), auto ×(1+0.01×rank) (the raw floats read as additive
    points only pre-~2025, before a game rework). Modeled as
    `vatsHitChanceMult` (`regime: 'display'`), exposed AS-IS (1=neutral) —
    same display-only contract, **never** consumed by any damage term.

## Power attacks & melee cadence
Engine: `paper-damage.ts`, `scenarios.ts`, `fire-rate.ts`.

- **Power-attack race multiplier** — RACE per-attack-event Damage Mult on
  Power-Attack-flagged events: HumanRace **1.5×**, PowerArmorRace **2.0×**
  (the PA race swap IS the multiplier). Multiplies the whole melee hit
  outside the dbm parenthesis. **Carve-outs proven in the same RACE records**
  (stays 1.0): automatic "power tool" melee (Ripper/Auto Axe), gun bashes
  (unmodeled), and UNARMED (not even Power-Attack-flagged). **Deliberately
  NOT re-extracted as an ESM-derived constant** (`extract-constants.ts`'s
  module doc comment): RACE `Attacks[]` is a 32-entry table of named attack
  events, each with its own Damage Mult — for HumanRace 6 read 1.5 and 26 read
  1.0, including Power-Attack-flagged carve-outs (e.g. `meleeAttackShredder`)
  that legitimately keep 1.0. There is no single scalar to read, and picking
  "the" generic-melee entry by event name risks silently extracting a
  carve-out's value instead.
- **Race-mult vs PowerAttackDBM split — USER-CONFIRMED**: the base
  power-attack multiplier is the race-defined Attacks[] mult above (native,
  hardcoded by design); DFOB `PowerAttackDamage_DO` (0x00837DFB) is unrelated
  to it — it names the PowerAttackDBM entry point, AV `STAT_DmgPowerAttack`,
  already routed `powerAttackBonus` (`normalize/mgef.ts`) and folded
  additively in the dbm parenthesis (Heavy Hitter, Radioactive Strength,
  Heavy Hitter's, Whacker Smacker). Bridge pinned each extraction
  (`verify-dfobs.ts`).
- **Melee speed applies relatively** (`1.0 × weapon.speed` instead of a flat
  1.0) — so `fireRateSpeed` OMOD/AV rewrites have an effect on melee.
  Absolute swing timings remain unmeasured (`#45`).
- **Charged (4★ melee)**: damage curve gives **+0.5/+1.5/+3.0** at 1/2/3
  charges (max 3), multiplying the releasing power attack by `(1+y)`.
  **Extracted, not hand-copied** — DFOB
  `WeaponSecondaryChargeUpDamageBonusCurve_DO` (0x0089A83C) → CURV
  `CT_Legendary_Weapon_ChargedUpWeapon` (0x008A3B85) →
  `extract-curvetables.ts`'s `CURVE_TABLE_SINGLETONS` →
  `legendarymods/weapon_chargedmeleeattack.json`; `scenarios.ts` reads both
  the max-charge count and the full-charge bonus off the curve's own domain/
  endpoint rather than hardcoding them, so a future re-tuning is picked up on
  re-extraction. **1-charge-per-light-attack is an INFERENCE** — no rate
  field exists in ESM for this mechanic. Modeled as a steady-state cycle: N
  normal hits (N = the curve's max charge count) + 1 full-charge detonation,
  averaged into `burstDps`/`sustainedDps`. **Applies regardless of the
  `isPowerAttacking` toggle** — a deliberate choice so DPS reflects real
  steady-state play (**not derived from data**).
- **Thrill-Seeker's**: 10 exact kill-streak tiers, `0.03×N` on melee speed
  AND reload speed — relies on `foldWeaponStat` being condition-aware, or all
  10 tiers sum unconditionally.
- **Action Boy/Girl cross-family rank gate**: the shared ability spell's
  tiers gate on BOTH gender families' rank formids
  (`OR[HasPerk(ActionBoy02)|HasPerk(ActionGirl02)]`) — resolved via a small
  hardcoded `GENDER_TWIN_PAIRS` map (not substring inference), since the
  player owns one gender's card at a time.

## Onslaught
Bucket: `Bucket.onslaughtMaxStacks`; engine: `src/lib/engine/onslaught.ts`
(stack counter, max-stack table, Route B, reverse mode — full mechanic in its
module doc-comment, not repeated here), `resolve.ts`'s
`effectiveOnslaughtStacks`.

- **Base max = 0 is an INFERENCE** — no record defines a starting cap. **The
  app's slider IS the steady-state input**, standing in for "whatever the
  counter settles at during sustained play" (same convention as
  `adrenalineStacks`/`bulletStormStacks`). Sentinel `-1` = follow the
  computed max.
- **Splinter's/Chaos Engine's/Tempest's P62 family**: fully modeled but
  **never shipped in-game** ("The Drifter" encounter never released) — stays
  hidden regardless of what the record graph implies; same verdict for the
  P62 weapon-side legendaries and Combo-Breaker's.
- **Reverse regen/consumption/averaging** — **ASSUMPTION** (each): +1
  stack/sec never interrupted (`ONSLAUGHT_REGEN_PER_SEC`); consumption =
  `onslaughtHitEventsPerShot`; averaging = faithful mag+reload sawtooth
  fixed-point, first mag starts at max. **Forward sustained sim** is the
  mirror by symmetry (unmeasured) — `forwardOnslaughtAvgStacks`.
- **`targetsHit` input** — **ASSUMPTION**: default 1 (single-target DPS);
  user-set for AoE/cleave fan-out under reverse mode only today
  (`PlayerConditions.targetsHit`).
- **Splash-reliant suppression** — **ASSUMED** (playstyle: direct hits
  essentially never land; exceptions with real projectile damage: Hellstorm,
  Cremator, Tesla Cannon): lobbed splash launchers count no physical
  projectile tick (explosion only) in Onslaught hit-events, both directions —
  curated list `weapon-corrections.ts` `splashReliantWeaponIds`; in-game
  measurement tracked as `#77`.


## Bullet Storm
Buckets: `bulletStormMaxStacks`, `bulletStormMinStacks`, `bulletStormRetention`;
engine: `resolve.ts`'s `effectiveBulletStormStacks`, `bulletstorm.ts`'s
`bulletStormAvgStacks` — accrual formula and the instant-reload/retention
interaction are documented on that function, not repeated here.

The stack counter is engine-hardcoded (raw AV `0x0000039B`, no AVIF record) —
same shape as Onslaught's. **Base max = 0 is an INFERENCE**.
`bulletStormMaxStacks` sources: Bullet Storm perk +10 (unconditional),
Bringing Out the Big Guns +10 more (`perkFamilyRank(HeavyGunnerMaster,
minRank: 1)`), Foundation's Vengeance +5 more (`healthBelowPct: 25`, gate is
**ESM-PROVEN** inclusive `≤` — see `conditions.ts`'s `GetHealthPercentage`
handler) — cap ranges 10/20/25 depending on loadout. `bulletStormMinStacks`
(Resolute Veteran +5, omod side) is the same shape as a floor.

- **Sentinel default**: `bulletStormStacks = -1` means "follow the computed
  max" — same convention as `onslaughtStacks`, clamped to `[min, max]` at
  read time (`min > max` degrades to `max`, never a floor above the cap).
- **No-magazine weapons** (melee/unarmed, capacity 0) simplify the sustained
  average to a flat `max` — **ASSUMPTION**, doesn't model an initial ramp-up
  from 0. **ASSUMPTION**, unproven: the sim carries a possibly-fractional
  running stack total across reloads — whether the hidden AV tracks
  fractional progress this way vs. truncating to whole stacks has no
  in-game confirmation.
- **Bootstrap fold, twice**: like `onslaughtMaxStacks`/`moveSpeedBonus`,
  `bulletStormMaxStacks`/`bulletStormMinStacks` are folded once per scenario
  input AND once in the weapon-stat bootstrap fold (so the reload-speed curve
  sees the cap/floor too) — `bulletStormRetention`/the sustained-fire average
  are NOT folded in `effective-weapon.ts`, same boundary as
  `onslaughtReverseStacks`.
- **Inert siblings**: `bulletStormOnKill` (Final Word — kills are unknowable
  in steady-state paper DPS), `bulletStormSpinUp` (Valkyrie's spin-up ramp —
  not modeled), `deflectChance` (The Action Hero — no incoming-damage model;
  deliberately generic, not Bullet-Storm-scoped).


## SPECIAL & perk budget
Engine: `src/lib/player-stats.ts`.

Rules (**user-confirmed** 2026-07-12, superseding an earlier
derive-from-perks experiment):

- **Base allocation is user-defined**: 1–15/stat, from a pool of 7 base + 49
  level-ups = **56**. Pool size **ESM-PROVEN 2026-07-21** (was
  user-confirmed): `specialAllocationPool(level)` = 7 × the SPECIAL AVIF
  Minimum Value (`constants.json.special.min`) + curve
  `SPECIAL_LevelRewardCurve` (0x004F473F, via DFOB `SpecialPointCurve_DO`
  0x004F4740) at the player level — extracted, not hand-copied
  (`extract-curvetables.ts` singletons → `player/special/levelrewardcurve.json`).
- **Player level is a fixed input**: `PLAYER_LEVEL = 300`
  (`src/lib/player-stats.ts`) — every level-indexed curve (SPECIAL pool,
  legendary slots) evaluates at endgame; a future level selector threads a
  variable through the same functions. **Modeling choice**, same
  size-against-endgame convention as the enemy level-slider default.
- **Legendary perk slots are curve-derived**: `legendarySlotsAtLevel(level)`
  counts `LegendaryPerkSlotCount` (0x005B67A0, via DFOB
  `LegendaryPerkSlotCurve_DO` 0x005B67A1) points with unlock-level ≤ player
  level — 6 at `PLAYER_LEVEL` (unlocks 50/75/100/150/200/300).
- **Legendary SPECIAL cards** (+1/+2/+3/+5 by rank) add ON TOP of base (may
  exceed 15) AND grant that many extra perk points — budget per stat is
  `min(15, base + legendary bonus)`. Their PERK records carry no effects; the
  bonus is applied app-side, so no double-count with `specialX` buff
  buckets.
- **Card point costs are PCRD data, not rank** (2026-07-13) — each card's
  per-rank cost comes from its own `Card Rank Cost` entries.
- **The PCRD `Perks[]` list is the LIVE shape of a card** (**user-confirmed**
  2026-07-13): 28 rebalanced cards record FEWER entries than the family has
  PERK ranks — the surplus ranks are dead content from before the rebalance,
  not missing data. `maxRank` clamps to the entry count.
- **Antibiotic / Conductor / Light Meal are NOT live cards**
  (**user-confirmed**) — their PCRDs exist in the ESM but are unreleased;
  deliberately get no PerkId.
- **Card SPECIAL/rank counts are PCRD-derived**, not folk knowledge — e.g.
  Tenderizer is a 1-rank Charisma card in the current dump.
- **Blocking**: over-budget slotting is refused in-app; N&D imports are NOT
  blocked (shown with an "over budget" badge instead).
- **Race-restricted cards** (2026-07-14): 52 families carry a PCRD "Race
  Restriction" enum — this is card-level ESM data, NOT derived from
  `playerIsGhoul` modifier conditions. Switching race prunes whatever no
  longer fits, after a confirm dialog — the user's choice is never silently
  overridden.
- **ESM-proven**: `perkHasEngineEffect` recognizes `LEGENDARY_SPECIAL_PERKS`
  structurally (membership check, not a modifier scan) — their PERK records
  extract with zero modifiers by design, since the bonus is the baseSpecial
  pathway above (`src/data/perk-modifiers.ts` `perkHasEngineEffect`).
- **ESM-proven**: Effective (post-buff) SPECIAL clamps to [1, 100] — each of
  the 7 SPECIAL AVIF records (`Strength` 0x000002C2 through `Luck`
  0x000002C8) declares `Minimum Value 1.0` / `Maximum Value 100.0`. Applied
  after the `specialX` bucket fold (`derivePlayerStats`), so debuff stacking
  (e.g. mutation penalties) can't drive a stat below the AVIF floor and buff
  stacking can't push it past the AVIF ceiling. Extracted (not hand-copied) —
  `scripts/extract/extract-constants.ts` → `constants.json` →
  `getSpecialClamp` (`@/data`) — so re-extraction re-derives the clamp
  instead of it silently drifting.

## Max HP (derived)
Engine: `src/lib/player-stats.ts`.

- **Base formula: `245 + 5 × effective END`** — **user-supplied convention,
  NOT ESM-proven** (level-scaling GMSTs weren't chased).
- `maxHealth` bucket: MGEF Peak Value Modifiers on AV `HealthBonus` —
  Lifegiver (END-keyed curve, all ranks), Nocturnal Fortitude, Spotlight.
- **Lifegiver ranks 2/3 are dead content** (2026-07-13) — the live card
  records a single rank; rank 1's curve is the whole live effect.
- Consumers: Juggernaut's `healthCurrent` curve X, the displayed HP stat.

## Ghoul Glow
Glow is the ghoul resource stored in the **Rads** actor value; ghoul perk
effects gate on `GetValue(Rads) ≥ N`.

- **Max Glow = max HP** — **user-stated convention, NOT ESM-proven** (no cap
  record chased). Conditions slider ranges 0..derived maxHealth.
- Thresholds are absolute literals + GLOB-resolved spend gates, all
  translate to `{kind:'glowAtLeast', min}`.
- Spend gates are steady-state: a `≥N` "can afford" gate passes whenever the
  slider is at/above cost — Glow drain over time isn't modeled.

## Elemental 2★ effects & enemy-status 4★ rework
- **Cryologist's/Poisoner's** (2★): **user-confirmed** — additive into the
  dbm parenthesis, scoped to the matching damage type only. Weapon-side
  Pyro-Technician's OMOD has no attach point yet — correctly doesn't
  extract. STAGED OUT 2026-07-21: the 20260717 dump renamed the weapon-side
  trio to `POST_*` (see the Pyro-Technician's bullet under **Unique
  weapons**) — none of the three extract anymore.
- **Pyromaniac's/Viper's/Icemen's/Severing** (4★) reworked from ENCH
  properties to plumbing AVs (+50% dbm gated on the enemy's active status).
  Icemen's is a REAL balance change: pre-patch was +20% cryo-scoped damage;
  now +50% vs frozen targets.

## Resist mitigation
Engine: `src/lib/engine/mitigation.ts` (`applyMitigation`) — formula, the
7-GMST exponent/factor/clamp inventory, radiation squaring, the
damage-type→resist-type map, and the Option A pipeline-position rationale are
all documented there, not repeated here. `src/lib/enemy-defenses.ts`
(`getEnemyDefenses`, `resolveTargetLevel`), `scenarios.ts` (bootstrap fold →
`armorPenTotal`/`armorPenFlatTotal`). Shipped as Phase 2 — Enemy defenses.

- **Option A divergence — MEASURED** (synthetic, `mitigation.test.ts` "Option
  A divergence"): applying mitigation once to the blended hit under-states
  retained damage vs. true per-hit-then-blend by **−2.1% to −2.9%** at a 2×
  crit mult and 15–45% steady-state VATS crit rates (Jensen's inequality;
  magnitude is a pure function of crit rate/mult) — small enough that Option A
  ships as specified.
- **`armorPen`** (fraction): Incisor/Stabilized/Tank Killer/Anti-Armor
  legendary families, 76 extracted modifiers, unconditioned flat ADDs.
- **`armorPenFlat`** (resist points, not a fraction): only source is Taking
  One for the Team's flat DR debuff. **ESM-PROVEN** (`#62`): hidden companion
  perk `LGN_TakingOneForTheTeam_DamageIncrease_Perk`, physical-only (no
  Energy Resist component — enforced consumer-side in `mitigation.ts`),
  magnitudes **6 / 10 / 15 / 50** at ranks 1–4. The rank-4 jump (not the ~20
  an even progression predicts) is a **possible ESM data-entry anomaly**,
  modeled as-is, not corrected.
- **DoT is NOT mitigated in v1** — `ScenarioResult.dotDps` stays a separate,
  unmitigated steady-state add. Deferred, matches the plan.
- **Level-slider default = max** (`resolveTargetLevel`): an unset
  `EnemyConditions.targetLevel` resolves to the race's `levelMaxGlobal` —
  **ASSUMPTION** ("endgame" use case). Fallback bounds 1–100 when a race has
  no Renorm window at all — also **ASSUMPTION**.
- Golden placeholder: `golden/cases.json` "Combat Rifle (Fixer) @50 ... vs
  Scorchbeast Queen (Lv 100)" (`expected: null`) — pending an in-game DPS/TTK
  reading to cross-check the formula end-to-end.

## Berserker's (Damage Unarmored)
Engine: `resolve.ts` (`playerDamageResist` `CurveInput` reader), `src/types/modifiers.ts`
(`CurveInput` doc comment), `scripts/extract/normalize/mgef.ts`
(`CURVE_INPUT_AVS['0x000002E3']`).

The AV is `DamageResist` (0x000002E3) and holds the WIELDER's own value, never
the enemy's — hence the 2026-07-18 rename from `enemyDamageResist`.

- **USER-CONFIRMED**: Berserker's (`mod_Legendary_Weapon1_DamageUnarmored`,
  curve points (0,50)→(20,30)→(40,17)→(60,5), scale 0.01) is FO76's real
  "deals more damage the LESS armored you are" effect — a self-buff curve
  keyed on the caster's own DR, not a target-facing one. Confirmed by a
  SECOND independent perk reading the same AV with the SAME "your own DR"
  semantics: Iron Fist's description is literally "Your Fists deal more
  damage based on your DR" (curve (0,0)→(1000,100), scale 0.01 — the opposite
  slope from Berserker's, but the same AV/axis).
- **No armor-mitigation model exists** to derive this from equipped gear
  (Phase 3 — Armor pipeline is scoped "slim" and won't add one), so the curve
  X is a manual numeric input, `PlayerConditions.playerDamageResist`, default
  **0 = naked** (`ConditionsSection.tsx` "Your damage resist").

## Creature stat curves & NPC extraction (Phase 2 data)
Engine: `scripts/extract/extract-curvetables.ts`, `scripts/extract/extract-npcs.ts`,
`src/lib/creature-curves.ts`.

- **Curve X-axis = the target's own effective level**: `effectiveLevel =
  clamp(nearbyPlayerLevel + levelOffsetGlobal, levelMinGlobal,
  levelMaxGlobal)`, fed directly into the matching
  `CT_Creatures_{Health,Armor}_Universal_Tier<N>` curve. **ESM-proven**: the
  `Renorm_*` GLOB family, `NPC_.Actor Scaling Info.{Level Min/Max/Offset
  Global}` wiring, and `Properties[].Curve Table` per-AV attachment are all
  directly observed. **INFERENCE** (high confidence, not literally labeled in
  any record): the curve's implicit input axis is "Level" specifically (no
  `Level` AVIF record exists in the ESM), and "nearbyPlayerLevel" is the
  requesting player's raw character level — standard Bethesda auto-calc-stats
  semantics, not provable from the plugin alone. `levelOffsetGlobal` is 0 in
  every sample to date; kept as a real field since it's structurally present.
  Curve-tier numbering (`CT_..._Tier<N>`, ~1-59) and Renorm-window numbering
  (`Renorm_*_Tier<N>`, 00-31) are unrelated schemes that share the word
  "Tier" — don't conflate them.
- **Resist Properties fall back RACE → NPC_, per-AV** (found building
  extract-npcs.ts, not covered by the spike's boss-only sample): Health
  (0x2D4) is NPC_-only and never appears on a RACE record; the 6 resist AVs
  frequently live on the RACE record instead of repeating on every NPC_ of
  that race (e.g. `EncMirelurkCrab_Template` carries zero resist Properties
  of its own — all 6 come from `MirelurkRace`). `extract-npcs.ts` merges
  NPC_ Properties over RACE Properties, per AV — verified against ~40 sampled
  records, zero exceptions found. **INFERENCE** (established
  "more-specific-record-wins" convention; not documented anywhere Bethesda-side).
- **Flat-wins tie-break**: when a Properties row carries both a nonzero flat
  `Value` AND a `Curve Table` (rare), the flat value is authoritative and the
  curve is ignored — mirrors the MGEF GLOB-magnitude flat-wins convention
  (esm-cli skill doc). **ESM-proven example**: `RD01_Enc06_ScorchtongueHead`
  (Ultracite Terror raid head) has flat Health 500000 alongside a
  `CT_Creatures_Health_Universal_Tier59` ref, and flat 300 physical/energy/
  fire/cryo/poison resist alongside Tier34-50 curve refs — only its
  radiation resist (flat 0) actually curve-scales.
- **`zzz`-prefix CURV rename**: `zzzCT_Creatures_Armor_Universal_Tier49`
  (formerly `CT_Creatures_Armor_Universal_Tier49`) is Bethesda's
  "hide-from-CK-browser" convention for a retired-from-new-authoring record —
  it's still FormID-live. A prefix-only search pattern silently drops it (49
  files instead of 50); `extract-curvetables.ts` uses a leading `*` wildcard
  to catch it. **ESM-proven** (ships in the 20260710 dump).
- **NPC-perk normalized-level adjustment — CONFIRMED**, baked into
  `levelMinGlobal`/`levelMaxGlobal`: a `crModNormalizedLevel*` PERK on an
  NPC's own `Perks` array (not just the RACE/NPC_ GLOBs) can Add-onto or
  Set-replace the level-scaling window via the "Mod NPC Normalized Min
  Level"/"Mod NPC Normalized Max level" Entry Points (`extract-npcs.ts`'s
  `resolveNormalizedLevelAdjustment`). Head Hunt bounty bosses
  (`Burn_BountyTarget_BIG_*`) mostly carry `crModNormalizedLevelPerk_25`
  (Add +25/+25); Infestation-event bosses carry
  `HTO_crModNormalizedLevelPerk_Boss` (Set 150/200 — matches their base GLOBs,
  a no-op in practice).

### Epic creatures

- **Per-rank HP multiplier — ESM-PROVEN**: `QUST SQ_EpicCreatures`
  (0x0001C339) VMAD property `EpicRankData` holds the table — `HealthMult`
  **2.0 / 2.4 / 3.2 / 4.0 / 4.8** at ranks 1–5. (`outgoingDamageMult`
  1.1/1.15/1.2/1.25/1.3 is present too but OUT OF SCOPE — this app doesn't
  model enemy outgoing damage.) `getEnemyDefenses` (`src/lib/enemy-defenses.ts`)
  reads `epicRank` off the npc row directly (data-driven, no caller-supplied
  override) and scales `hp` only — DR/ER untouched.
- **Eligibility — ESM-PROVEN**: `GeneratedNpc.epicAllowed`
  (`scripts/extract/extract-npcs.ts`) checks both the NPC_'s own Keywords and
  its RACE's Keywords against FLST `EpicCreatureDisallowedKeywords`
  (0x004FC5B7, 4 members). Both SBQ (`EncScorchbeastQueen01Template`) and
  Earle (`EN06_LvlWendigoColossus_Nuked`, `WendigoColossusRace`) are
  `epicAllowed: true`; the 4 curated targets that ARE excluded are all
  Ultracite Terror raid-boss components (`RD01_Enc04_{Grenadier,Assassin,
  Brute}`, `RD01_Enc06_ScorchtongueHead`). **`epicAllowed: true` is NOT a
  claim that a race actually spawns epic** in a given encounter — for most
  creatures that stays a runtime chance roll with no static ESM signal.
- **Fixed epic rank IS ESM-provable for specific bosses**, via the summon
  quest's Virtual Machine Adapter, in one of two shapes
  (`extract-npcs.ts`'s `BOSS_EPIC_RANK_QUESTS` + `resolveEpicRankFromVmad`):
  (a) an `EncounterWaves` struct-array property whose boss wave carries
  `BossEpicLevel` alongside `BossEpicChance: 100` — `CB15_ScorchedEarth`
  0x003E271D (SBQ's summon quest): rank 3; (b) a boss-alias
  `defaultforcelegendaryalias` script's `minRank` property —
  `Storm_RegionBoss` 0x006AD506 (Storm Goliath's 3 boss aliases for the
  Plasma/Frag/Cryo variants, all `minRank: 3`): rank 3.
- **Earle/Wendigo Colossus does NOT get a rank** — checked exhaustively and
  empty: `E06_Colossus` 0x00583D14 (no BossEpicLevel/BossEpicChance on any of
  its 3 waves, no `defaultforcelegendaryalias` on any of its 4 aliases),
  `SQ_WendigoColossusSummonAllies`, `RB_Master` 0x004DF720, `E06_PocketWatch`,
  and the boss NPC_'s own Keywords/Perks. A claim that `E06_Colossus` matches
  shape (a) at rank 3 circulates informally and does **not** reproduce against
  a live query.
- **Loot-list rank ≠ epic creature rank**: a boss dropping N★ gear is not a
  fixed epic rank N — the drop list and the epic-rank system are unrelated ESM
  mechanisms. UC Titan's summon quest `E09A_Launcher` 0x0063461B: all 5 waves
  carry only a `Difficulty` field. Head Hunt's 3★ drop is LVLI
  `Burn_LL_BountyHunt_LegendaryTemplate_3Star_HeadHunt` 0x00833A16; Bigfoot's
  4★ is LGDI `RA_LegendaryItems_Weapons_BigfootOnly_Rank4` 0x008833D6 — loot
  lists, not epic upgrades. All three stay rank-less (`#52`).
- **Scorchbeast Queen HP — RESOLVED (user)**: the ~32k community figure is the
  game's OLD HP cap (32767, the signed-integer clamp boss HP hit until the cap
  was widened ~2023), not an observed live HP, and there is NO
  per-nearby-player boss-HP scaling (myth). The ESM-derived value (curve HP ×
  epic HealthMult) is authoritative as computed: SBQ @ L60/L100 ≈ 759,562 /
  1,305,734 at rank 3; Storm Goliath (level window 50–100, Tier49 curve, also
  rank 3) ≈ 227,161 / 472,390. No measurement pending.

## Body parts (BPTD-extracted)
Engine: `scripts/extract/extract-bodyparts.ts`.

Per-enemy body-part multipliers are real ESM data (RACE → BPTD → per-part
Damage Mult). No pick = a custom multiplier input (default 1.5, standard
humanoid headshot).

- **`ctx.bodyPart` location is decoupled from the multiplier itself**
  (2026-07-15, fixing Center Masochist firing incorrectly on limb/
  armored-torso hits): the `bodyPart` condition category derives from the
  picked part's BPTD `partType`, not the mult's sign — so a torso-weakpoint
  enemy (Deathclaw belly ×1.35, `partType: Torso`) counts as BOTH torso and
  weakpoint. **Not ESM-proven, still an assumption**: `Pelvis`-slot
  center/belly parts (a different BPTD slot from `Torso`) are deliberately
  NOT counted as torso, leaving those specific parts torso-gate-inactive
  until measured.
- **Body-part hit rate** (`bodyPartHitRatePct`, default 100%) — **Free Aim
  only** (changed 2026-07-31; previously blended in VATS too, see the
  `vatsHitRatePct` entry in "VATS AP economy & manual-aim hit rate" above):
  while aiming, each Free Aim hit blends `rate×aimed-part + (1−rate)×torso`.
  Independent of free-aim `hitRatePct`. VATS models a missed part as a miss
  (zero damage, no torso fallback) via its own `vatsHitRatePct` slider
  instead of this blend.
- Crippled-limbs input caps at the picked race's distinct BPTD limb-AV count
  (10 when no race picked).
- **NoCripple** (zero limb damage) is hand-authored per curated target (Blue
  Devil, Bigfoot, Deathclaw Matriarch) — no BPTD flag encodes it.
- **EN06 Guardian's "torso is damage-immune until the shield breaks" phase
  gate is NOT modeled** — this is a steady-state calc with no phase
  scripting; exposing both parts and picking the shield generator is the
  closest approximation.
- Auto-receiver crit/sneak base MUL_ADDs are −20% (**user-confirmed** — the
  −30% applies to AttackDamage/DamageTypeValues instead, see **Formula
  structure**).

## CAMP resource generators & consumable chains
Obtainability rules (`obtainability.ts`) — judgment calls, not assumptions
about unproven values, but worth recording:

- **RESO = player-obtainable** — a workshop generator's produce list always
  proves access (all 52 RESO records are player camp/workshop resources).
- **A dispensing ACTI counts only if the player can BUILD it** (a non-junk
  COBJ constructs it) — never recursed through a world activator that
  merely holds a loot list.
- **ALCH → ALCH ferment/spoil chains are followed**; **CHAL (challenge)
  referencers deliberately do NOT count** (challenges are authored against
  cut content too).
- **Deliberate stay-hidden** (**user-confirmed** 2026-07-14): Firecracker
  Whiskey (no `Created Object` field — dead chain; only referencers are the
  unshipped `POST_Challenge_*` bucket), Calmex Silk (placed refs alone are
  insufficient), `LGN_BrawlingChemist_Chem01–04` (internal effect-carriers,
  never enter inventory).
- Two rescues are script-granted and can never be derived
  (`forceVisibleConsumableIds`): Chally's Milk, Roast Chicken.

## OMOD eligibility & recipe chains
Engine: `cobj-index.ts`, `isEligible` (`src/data/omods.ts`).

- **A COBJ cannot name a target weapon** — per-weapon gating lives entirely
  in the OMOD (attach point + Target Keywords). "Recipe exists"
  (`hasGrantingCobj`) is a diagnostic, **never an eligibility input**.
- **`Learn Recipe From` is polymorphic by `Learn Method`** (plan BOOK /
  explicit scrap source / NOCRAFT dummy stub). `Repair Method 5` is NOT a
  NOCRAFT marker — real scrap-learnable recipes carry it too.
- **Mod boxes substitute for recipe knowledge** (**user-clarified**
  2026-07-14): a NOCRAFT-dummy COBJ's mod can still be player-slottable via
  a matching loose-mod/mod-box item — `hasGrantingCobj: false` is *correct*
  for these and must never gate visibility.
- **Picker eligibility**: attach point must be on the weapon; keyword-scoped
  mods use the game's own subset gate; **empty-keyword mods match NOTHING by
  default** — previously they matched every weapon sharing the attach point
  (the "wrong-weapon mod" bug class). They're offered only via template
  whitelisting or an explicit rescue entry.
- **Picker display policy** (**user decision** 2026-07-14, superseding an
  earlier "hide pure utility" rule): show ALL valid+obtainable mods,
  including zero-DPS ones (sights, grips) — badged `inert` rather than
  hidden. Two curated exceptions excluded wholesale
  (`DEAD_MECHANIC_SLOT_EDIDS`): a removed mechanic and pure cosmetic
  reskins.
- **Weak-evidence review** (**user decision**: flag, never auto-hide): a
  standard-slot mod whose only proof is riding along on its weapon lands in
  `_meta.json reviewFlagged.omodWeakEvidence`; confirmed cut content is
  hand-hidden with a source comment.

## Attach-point closure
Engine: `ap-grant-index.ts`, `applyAttachPointClosure`.

A WEAP's own `"Attach Parent Slots"` lists only the bare-frame points — most
real slots are granted through *installed mods'* own `Attach Parent Slots`
(e.g. Hunting Rifle's receiver grants its grip/scope/mag slots). Copying the
WEAP field verbatim silently dropped whole slot families on 136 of 282
weapons.

- `weapons.json.attachParentSlots` is therefore a **fixpoint closure**: seed
  = WEAP's own slots ∪ each default/template mod's own attach point ∪ the
  slots those mods grant, iterated until stable. Eligibility during
  iteration is the **shared picker predicate** (`omod-eligibility.ts`) —
  extractor and picker can never drift.
- **The paper model wants the union over all reachable mod configurations**
  — per-configuration availability (does a *specific* barrel gate the
  muzzle?) is deliberately out of scope, same as any other loadout tool.
- **Contributor gate is structural only** (dev/junk prefixes, non-weapon
  mods) — full OMOD obtainability can't gate here (circular: needs the
  weapons pass's own output). **Accepted residual risk**: a real-Name,
  non-junk but actually-unreleased donor mod could open a slot.
- Over-generation is structurally inert: `buildSlots` is OMOD-driven, not
  AP-driven — an attach point with zero eligible mods never creates a
  picker slot.

## Unique weapons
Rework basis: `WeaponsUniqueNamedList` FLST — each reworked unique is a base
WEAP + a `mod_Custom_*` OMOD at `ap_customName` (identity + effects), plus a
paint. Legacy standalone WEAP records are dead for everyone (owned items
auto-converted); their stats are stale and must not be shown.

- Dead legacy WEAPs classify `obtainable: false` via the standard
  NOCRAFT-COBJ rule; a handful of E08B legacies have real-looking-but-
  unreferenced COBJs the heuristic can't catch — hand-hidden with a note to
  re-review periodically.
- **Still-live standalone uniques** (real FLST/grant refs, kept in the
  roster): CombatRifle_Fixer, 10mm_CircuitBreaker, MoM_BladeOfBastet,
  MoM_VoiceOfSet_44, PipeSyringer_Vox, atx_alienprobe,
  BlackPowder_Rifle_Dragon. The Fancy Pump Action Shotgun/Revolver are
  script-granted quest rewards, not reworked uniques.
- App-side, identity uniques surface as the "Unique" mod slot; equipping one
  renames the weapon in the Build summary.
- **Deliberately note-only, no formula bucket** (extracted, badged `inert`,
  never wired): damage-TAKEN perks, `EnableAmmoSpenderOnKill` (boolean flag,
  already reachable via the manual `bulletStormStacks` slider),
  `STAT_DeflectChance`, sneak/detection AVs, `RefractingProjectileChance`
  (V63 Laser Rifle beam-refract chance, native-consumed via its DFOB — no
  ESM-visible damage semantics; user decision 2026-07-21), and Self-delivery
  ENCH damage (Xerxos's `SelfRadDamage` wielder irradiation — the
  `enchantmentModifiers` gate in `scripts/extract/extract-omods.ts` keeps
  self-damage out of weapon output).
- **Pyro-Technician's/Cryologist's/Toxicologist's**: pulled out of shipping
  data by a `POST_` staging-prefix rename (junk-filtered at the extraction
  root) — re-adjudicate craftability when a dump drops the prefix.
- **Gamma Gun**: its own weapon-level explosion IS now modeled
  (`fromExplosion`, graduated out of `noDamage` 2026-07-13 — see **Launcher
  explosion damage**). Xerxos (Season 7 reward, user-confirmed live
  2026-07-21) ships as an identity-mod preset on the base Gamma Gun
  (`mod_Custom_Xerxos`); the standalone `SCORE_S7_GammaGun_Xerxos` WEAP is
  the usual dead REPAIRONLY legacy record and stays excluded.
- **Daisy Cutter** (unique Fat Man, rebuilt 20260724 — see
  `Data/notes/20260717_to_20260724/patch-summary.md`): its old flat 30%
  clip-refill chance became an 8-step `+20%` dbm ladder gated on
  `GetValue(RadResistExposure) ≥ 1000..8000` (`radResistAtLeast` condition,
  `resolve.ts`), capping at **+160% at 8000** with nothing beyond. No armor
  model derives player Rad Resistance from equipped gear (same gap as
  Berserker's `playerDamageResist`), so it's a manual knob,
  `PlayerConditions.playerRadResist`, default 0.
- **Instance-only target keywords** (~24 unique `ap_customName` mods): the
  game applies a second target keyword at instance-creation via template
  combination, which the base WEAP never has — the shared eligibility
  predicate lets template membership bypass the keyword subset check.
- **Unnamed identity effects** (Holy Fire, Cultist Piercer, Elder's Mark,
  ...) were silently dropped by the no-Name filter — rescued when
  template-member + has properties + sits on an identity attach point.
- **Cursed mods** (`ap_curse`, Nuka-World on Tour): real stat payloads on a
  cosmetic naming slot, no `ObjectTypeUnique` — surfaced by the same
  modifiers+template-membership gate, labeled "Cursed". Own dedicated attach
  point since the 20260724 patch (rode the shared `ap_Item_Description` slot
  before it — `omods.ts` `SLOT_LABEL_OVERRIDES`/`RENAMING_SLOTS`).
- **Dom Pedro**: its Explosive muzzle mods' EXPL payload is hand-supplied
  via `omodModifierAdditions` as a ballistic-scoped ADD curve (right paper
  number, but explosive-only perk interactions aren't modeled — the engine
  has no OMOD-conditional explosive component).
- **The V.A.T.S. Unknown**: base OMOD SETs `VATSCriticalMultAdjustMin/Max` =
  0.2/2.0 (unmapped AVs, zero extracted modifiers) — **USER-CONFIRMED** this
  is a random ×0.2–×2.0 roll on the additive crit-damage BONUS only (not the
  base weapon crit mult). Hand-supplied via `omodModifierAdditions` as a
  `critDmgBonusScale` MUL_ADD 0.1 (mean of the roll, ×1.1), folded in
  `paper-damage.ts totalCritMult`. **ASSUMPTION**: modeled at the roll's mean
  (exact for expected DPS since the fold is linear); exact scaling target
  still wants an in-game measurement (`#72`). Its five
  `mod_Custom_TheVATSUnknown_*` siblings are unreferenced legacy/cut records,
  not real variants — removed from the picker.

## Armor pipeline (Phase 3 extraction)

- **ESM-PROVEN**: armor/power-armor OMODs (`Data."Form Type" = "Armor"`, not a
  distinct "PowerArmor" value — verified on Battle-Loader's PA variant
  `mod_Legendary_PowerArmor4_BattleLoaders`) share the same OMOD record type
  as weapon mods, gated only by that field. `extract-omods.ts` emits both
  `omods.json` (Weapon) and `armor-omods.json` (Armor) from one shared
  list+get pass (`classifyOmodRecordExclusion(record, allowedFormTypes)`),
  leaving weapon output byte-identical to a weapon-only extraction.
- **ESM-PROVEN**: the OMOD `Properties[].Property` enum differs between
  weapon and armor mods for at least one entry — `ActorValues` (weapon,
  numeric value 94) vs `Actor Values` with a space (armor, value 10),
  otherwise semantically identical. `propertyName()`'s `PROPERTY_NAME_ALIASES`
  normalizes this; `Enchantments`/`Keywords` carry different numeric values
  too but the same string name in both enums (no alias needed there). A real
  weapon/armor spelling split for a different property would surface as an
  `unknownProperties` entry, same safety net as always.
- **ESM-PROVEN**: `GetIsPlayer` condition rows at PERK tab-index 2 mean "is
  the entry point's target the player" — the OPPOSITE reading from a
  tab-0/self-gate row, same inversion as Contact-delivery's `subjectIsTarget`
  flag (see **Weapon-intrinsic DoT & OMOD replacement**). Consequence:
  `Wanted_DebtorsDisease_Perk`'s tab-2 `GetIsPlayer` row is a PVP-only −50%
  dbm penalty, correctly resolving `inactive` in this PvE calculator.
- **ESM-PROVEN**: `WornApparelHasKeywordCount` (worn-piece-count tiers —
  Battle-Loader's 1/2/3/4/≥5, Limit-Breaking Armor, Crusaders S.P.E.C.I.A.L.)
  translates to a new `{kind: 'wornPieceCount', keyword, count, orMore?}`
  condition (`conditions.ts`, pattern: `GetGroupTargetCount`). Engine half
  SHIPPED — see "Armor" below.
- **ESM-PROVEN**: Battle-Loader's PERK entry point 199 ("Instant Reload Clip
  On Bash") emits `Function Type: Float, Function: Set Value, Float: 1.0` on
  all 5 tiers — a boolean trigger placeholder, NOT the 15/30/45/60/75% chance
  (that value lives in each tier's own `GetRandomPercent` condition row).
  `mgef.ts` narrowly special-cases this exact shape (pattern: the existing
  EP-172/`Mod Ammo Used Count` case) to emit the real chance into
  `reloadSkipChance`, leaving `GetRandomPercent`/`IsPowerAttacking`/`GetDead`
  as `unresolved` conditions on the extracted modifier. Those are **not**
  harmless: `evalCondition`'s `unresolved` case always returns `null`, so any
  one of them permanently deactivates the modifier regardless of
  `wornPieceCount` — see **Armor** below for the override that drops them.
- `extract-armor.ts` is grounding-only: `{id, formId, name, obtainable}` per
  ARMO record, feeding armor-OMOD obtainability the same way
  `obtainableWeaponFormIds` feeds weapon-OMOD obtainability (`ObtainabilityClassifier`'s
  new ARMO branch, parallel to its WEAP one). No resistances, no mod slots,
  no UI consumer — that's later Phase 3 scope.

## Armor (Phase 3 engine + UI, 2026-07-18)

- **DESIGN**: the Armor checklist (`ArmorSection.tsx`) is
  deliberately slim (worn-piece COUNT per effect, not a per-piece armor/mod
  picker — user decision). `PlayerConfig.armorEffects: Record<effectId,
  count>` is the single source of truth; `resolveLoadout` derives both the
  folded `Modifier[]` list AND `PlayerConditions.wornPieceCounts` from it
  (`src/data/armor-modifiers.ts`) — the UI never sets either downstream field.
- **DESIGN**: per-piece scaling has two shapes, detected structurally (not by
  source name) in `getArmorEffects`/`getArmorEffectModifiers`:
  - Most effects (Unyielding, 2★ SPECIAL, Powered, Active, Healthy,
    Bruiser's/Ranger's, Propelling, PA Misc/Lining/underarmor mods) extract
    as ONE flat per-piece modifier with no `wornPieceCount` condition of its
    own — the checklist count multiplies `value` (or `curveScale` for
    curve-driven ones, e.g. Unyielding's stepped SPECIAL curves) directly.
  - "Self-scaling" effects (any modifier carrying its own `wornPieceCount`
    condition — Battle-Loader's, Limit-Breaking Armor) already extract as N
    pre-tiered modifiers; the checklist count feeds
    `PlayerConditions.wornPieceCounts` instead and the modifiers pass through
    unscaled, letting the condition eval pick the one active tier.
- **Unyielding threshold semantics — GAME-CHANGE-PENDING** (user-confirmed
  2026-07-19): the extracted curve's near-vertical step points (e.g.
  x=0.1999→y=3, x=0.2→y=2 at the 20% break, same shape at 40%/60%) make
  `interpolateCurve`'s linear interpolation (`src/lib/curve-tables.ts`)
  evaluate the +3/+2/+1 SPECIAL tiers on a strict-`<` boundary — exactly
  20%/40%/60% HP reads the LOWER tier, matching the CURRENT game build. An
  announced future patch flips the comparison to `<=` at all three
  thresholds; when it ships, the stepped-curve breakpoints (or the
  step-eval convention itself) need revisiting, not just a data refresh.
- **Battle-Loader's override (ESM-derived, not wiki)**: its extracted
  modifiers carry `unresolved` conditions (`GetRandomPercent`,
  `IsPowerAttacking`, `GetDead`) that permanently deactivate them regardless
  of `wornPieceCount` (see the Armor-pipeline bullet above).
  `src/data/overrides/armor-values.ts` (`armorLegendaryValueOverrides`)
  REPLACES the modifiers, keeping only the `wornPieceCount` tier — the
  baked-in value already IS the `GetRandomPercent` chance (keeping it as a
  gate would double-apply the same probability); `GetDead` has no failure mode
  this calculator models; `IsPowerAttacking` (the real per-bash trigger) is
  dropped as a CONDITION, since bash cadence — how often a bash happens vs. an
  ordinary reload — is still unmodeled. Its bash-ness survives structurally
  via the dedicated `reloadSkipChanceBash` bucket, which carries its own time
  cost (`PlayerConditions.battleLoadersBashSec`) instead of Quick Hands'
  free-skip treatment — see **Reload-skip & free-ammo expected value**.
- **Bruiser's/Ranger's override (ESM-derived)**: both ("Melee/Ranged Weapons
  Deal +5% Bonus Damage, up to +25% on Full Stack" — both fields
  ESM-extracted) type their worn-piece gate as a `weaponKeyword` check on
  `HasLegendary_Armor_{Bruiser,Ranger}` — a keyword the OMOD adds to the ARMOR
  piece, never to a weapon, so the condition can never pass as extracted.
  `armor-values.ts` drops that broken keyword condition (keeping the real
  weapon-class gate) and lets the generic per-piece value×count scaling
  reconstruct the 5/10/15/20/25% ladder from the single 5%-per-piece value.
- **EXCLUDED (data-quality, `hiddenArmorOmodIds`)**: Overeater's (its only
  modifier is a `maxHealth` curve the ESM itself flags zero-magnitude/
  script-scaled; its real DR/ER-per-buff mechanic is incoming-scope,
  unextracted — `#49`) and Punishing (its two
  modifiers are `HasLegendary_Weapon_HealAllies`-gated noise from a shared
  `LegendaryCommonWeaponPerk` chase — same collision class documented under
  Crippling in `legendary-values.ts` — not a real effect; its actual reflect-
  damage mechanic, `ActorValues` on `ReflectMeleeDamage`, never extracted).
- **Limit-Breaking Armor is a sequential multiplier, not a bucket fold**: its
  5-tier `critConsumption` MUL_ADD (−10%..−50%) must NOT fold through generic
  `foldOps` arithmetic alongside Critical Savvy's SET. `foldOps`' "MUL_ADD
  always scales the ORIGINAL base, even past a SET" rule (verified for OMOD
  stat properties) would read "reduces the cost by X%" as a percentage off the
  bucket's abstract 100 base (55 + (−0.5×100) = 5) instead of off whatever
  Critical Savvy already set the cost to (55 × (1−0.5) = 27.5, the
  hand-verified anchor). `crit-meter.ts` therefore detects self-scaling
  `critConsumption` modifiers generically (MUL_ADD + a `wornPieceCount`
  condition) and applies them as a separate sequential multiplier — the same
  "independent stacking multiplier" shape as `foldWholeDamage` — which
  reproduces the 16 LCK + Crit Savvy 3 + 5× Limit Breaking →
  crit-every-2nd-shot anchor exactly. Limit-Breaking is sourced from real OMOD
  data via the Armor checklist; `codec.ts` migrates legacy
  `pc.limitBreakingPieces` payloads (a retired manual toggle) into the
  equivalent checklist selection.
- **ASSUMPTION**: worn-piece maxCount for non-legendary effects (PA Misc,
  armor Lining, underarmor styles) is derived from body-slot tags observed in
  the dedup group's OMOD ids (`Torso`/`Limb`/`Helmet`) rather than real armor-
  slot topology data (none exists in this dataset) — Lining mods (Torso +
  Limb variants) get max 2, single-slot PA Misc/underarmor mods get max 1.
  Legendary-slot effects (`ap_Legendary1-4`) always get max 5 (5 armor
  pieces), including Battle-Loader's/Limit-Breaking (self-scaling — the max
  bounds the checklist count, not a value multiplier). The 5-piece ceiling
  is additionally a shared budget per star tier — see `docs/adr/0004`.

## Known gaps / deferred
- **Follow Through / Taking One for the Team** extract with empty `modifiers`
  (the chain to hidden debuff/companion perks isn't followed) but are not
  inert — see the manual toggle in **Hand-supplied values**. Taking One for
  the Team's companion perk's enemy-DR debuff (**−6/−10/−15/−50** at ranks
  1–4, esm-walk-confirmed, a non-arithmetic progression) IS modeled, via
  `armorPenFlat` — see **Resist mitigation**.
- **Limb targeting** is deferred by plan. Enemy DR/ER and armor pen are **no
  longer** deferred — see **Resist mitigation**. Race-gated damage
  (`enemyType`) is **no longer** deferred — see **Hand-supplied values**'
  DmgVs* row. Range falloff is **no longer** deferred — see **Target distance
  (Close / Far)**.
- **"Mod Incoming Weapon Damage" self-targeted sources** (2026-07-21 sweep,
  triggered by the Grounded fold-shape fix above): `Mutation_EmpathPenalty_Perk`
  (Empath), `UnstoppableMonster_Perk`, `Legendary_Armor_Heavyweight`,
  `BOUNTY_Legendary_Armor_LucidPerk`, `PA_EmergencyProtocols` all fire this
  Entry Point directly on the perk holder (no target redirect) — genuinely
  incoming/defensive, correctly stay "not modeled" (no player-defense model
  exists). Distinct from Follow Through / Taking One for the Team above,
  which redirect the same Entry Point to the struck/attacking actor via a
  spell chain — that's the offensive, `wholeDamage`-modeled half. "Mod
  Incoming Explosion Damage" (the explosion-scoped sibling) has zero
  occurrences in the current ESM dump — nothing to model yet; if one shows
  up, apply the same self-vs-target split, and route a target-applied one to
  `baseDamage` (not `wholeDamage`) for the same component-scoping reason as
  "Mod Player Explosion Damage" (**Mutation penalties & Class Freak**).
- SPECIAL-scaled perk entry points ("Add Actor Value Mult") are skipped and
  noted per-perk.
- A handful of `cr`-prefixed creature/event DoT curves (non-level domain, X
  up to 540) and a few niche unique-mod curves remain unmapped: Pirate Punch
  (below), Eat The Rich (NPC-only reward, not player-obtainable), PA battery
  drain (no DPS/AP/HP impact).
- **Pirate Punch / lockpick skill** (2026-07-13, **deferred — user
  decision**): a real ESM-proven curve ("+5% Damage per Lockpick Skill")
  extracts with zero modifiers because its curve input AV isn't in the
  mapped set. Landing it needs a new `lockpickSkill` CurveInput + an
  aggregation step (Locksmith + Picklock ranks + Master Infiltrator + the
  lockpick magazine/bobblehead, none of which currently route). **Master
  Infiltrator's actual per-rank grant needs ESM verification** before
  implementing — its card text conflicts with a "+1/rank" recollection;
  don't trust either without walking the ESM.
- No magazine/bobblehead buffs remain inert — see **Magazines & bobbleheads**.

## Future DPS streams
User-supplied rationale, 2026-07-07. Perks that look "unjoined/inert" today
but belong to calculation streams not yet modeled:

| Stream | Sources | Notes |
|---|---|---|
| Limb-damage DPS | Scattershot, Modern Renegade, Enforcer | `limbDamage` bucket exists but scenarios never target limbs yet |
| Bash-damage DPS | Bear Arms, Basher | bash attacks unmodeled |
| Kill Streak accrual rate | Overkill | grants a per-kill accrual-RATE AV, distinct from the existing static-slider model — needs new engine design |
| Melee via SPECIAL buffs | Radicool (+STR) | SPECIAL buffs are manual inputs for now |
| DR→unarmed synergy | Barbarian, Bodyguards, Iron Fist | DR increases unarmed/fist damage |
| Deflect/Reflect return damage | Ricochet, Bullet Shield, Reflective 4★ | scales with DR |
| Reload-inclusive sustained DPS | Gun Runner, Rapid | DPS across multiple magazines |
| VATS uptime | Field Surgeon | AP/HP economy modeling |
| Ghoul Glow economy | Breathe It In | feeds Glow spenders, not a direct damage term |
| Low-health damage | Nerd Rage | no ESM family joined yet — locate its current record |
| Incoming DPS / survivability | Unstoppable Monster, Ricochet-class DR | model enemy→player damage (**user request** 2026-07-13) |

- Mutation SPECIAL side-effects (Egg Head etc.) are not applied — SPECIAL is
  a manual input; set it to your buffed values.
