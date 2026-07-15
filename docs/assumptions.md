# Damage Engine Assumptions

Registry of every engine assertion **not directly proven by ESM data** — each
confirmed or corrected by an in-game golden measurement
(`src/lib/engine/__tests__/golden/`) where possible.

**Format**: one claim per bullet, tagged **ESM-PROVEN** (kept only as
load-bearing context for a nearby assumption), **USER-CONFIRMED**,
**ASSUMPTION**/**INFERENCE**, or **MEASURED**/**CLOSED**, plus a code pointer
and — where open — a verify link.

**Where things go**: investigation history (how a bug was found, rejected
alternatives, dated narrative) belongs in the **commit message**, not here.
In-game measurement TODOs live in `dps-todos/measurement-backlog.md`. A full
explanation of how a mechanic works — even an ESM-proven one, not an
assumption — belongs in the implementing function's doc-comment, not here.

**Section names below are cited across the codebase by exact text**
(comments, tests, golden-case `source` strings, and ~30 notes baked into
generated `omods.json`) — do not rename or merge a heading or a **bold**
sub-anchor without updating every citation.

## Index

- **Formula structure** — the paper-damage formula, bucket fold, explosive/DoT carve-outs
- **Base damage & components** — per-component curve evaluation, physical-component gate
- **Launcher explosion damage** — WEAP+EXPL chain, the summing assumption
- **Weapon-intrinsic DoT & OMOD replacement** — Contact-delivery `GetIsPlayer` inversion, REM/ADD/SET semantics
- **OMOD-chased launcher payloads** — Lobber/Polar Lobber hazard chase
- **Mixed damage-type OMOD conversion (DamageTypeValues)** — type materialization, twin inheritance
- **Fire rate** — CLOSED
- **Charging weapons** — FPS/FPDM ramp, cadence, extraction still outstanding
- **Sustained DPS** — reload divisor, per-shell reloaders, reload-skip/free-ammo EV, Fast Fighter
- **Crit meter**
- **Value curves** — single-point/null-input curve conventions, cross-family HasPerk gates
- **Hand-supplied values** — the per-legendary-effect model table
- **Consumable stacking & addictions** — same-bonus dispel-key rule, addiction derivation
- **Magazines & bobbleheads**
- **Carnivore's / Herbivore's food scaling**
- **Mutation penalties & Class Freak**
- **Target distance (Close / Far)**
- **VATS AP economy & manual-aim hit rate** — regen model, hydration baseline, Number Cruncher, Conductor's
- **Power attacks & melee cadence** — power-attack race mult, Charged, Thrill-Seeker's
- **Onslaught** — stack counter, max-stack table, the Route-B correction
- **SPECIAL & perk budget**
- **Max HP (derived)**
- **Ghoul Glow**
- **Elemental 2★ effects & enemy-status 4★ rework**
- **Resist mitigation** (dormant scaffolding)
- **Body parts (BPTD-extracted)**
- **CAMP resource generators & consumable chains**
- **OMOD eligibility & recipe chains**
- **Attach-point closure**
- **Unique weapons**
- **Known gaps / deferred**
- **Future DPS streams**

## Formula structure
Engine: `src/lib/engine/paper-damage.ts`, `resolve.ts`.

```
PaperDamage = Σ_components base(c) × ( dbmFold(c) + Tenderizer + (CritMult−1)[crit]
              + (SneakMult−1)[sneak, non-explosive] + PowerAttackBonus + STR term[melee] )
              × Π wholeDamage × BodyPartMult[non-explosive] × (1 + weakpointBonus)[BodyPartMult>1, non-explosive]
              × PowerAttackRaceMult[melee power attack]
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
- **Body-part multiplier** — resolves from BPTD-extracted per-enemy data when
  a target/part is picked (see **Body parts (BPTD-extracted)**); the manual
  input is a fallback only, default 1.5 (a standard humanoid headshot).

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
  separately-authored halves). **ASSUMPTION, not ESM-proven** — pending
  Pip-Boy card reading (Fat Man, Missile Launcher goldens).
- **EXPL "Base Weapon Damage Mult"** (Gauss family 0.15, Tesla Cannon 0.10) is
  modeled as the intrinsic BASE of the `explosivePayload` twin fold;
  Explosive 2★ legendary (+0.2) ADDs on top. **ASSUMPTION** (additive
  stacking unconfirmed in-game).
- **Explosion bonuses are ADDITIVE dbm** (June 2026 patch, **user-reported**):
  Demolition Expert and 'Mod Player Explosion Damage' (SCAV!) route to `dbm`
  with `damageTypeScope: ['explosive']`, folding in the same parenthesis as
  Bloodied/Adrenal (0.9+0.5+0.6 → ×3.0, not the pre-patch ×3.84). The
  'explosive' scope matches `fromExplosion` regardless of elemental type.
- **Not modeled**: OMOD projectile overrides swapping the explosion (a mod
  pointing at a different EXPL keeps the base explosion's numbers); explosion
  radius/AoE; self-damage.
- Gamma Gun graduated out of the `noDamage` bucket 2026-07-13 — its only
  damage IS the explosion (`fromExplosion` radiation component, tier 18
  curve), now modeled. (Supersedes any older note elsewhere calling it
  unmodeled/excluded.)

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
Engine: `overrideProjectileModifiers`, `extract-omods.ts`.

Some weapon OMODs carry `OverrideProjectile` (154 in the dump) swapping the
fired projectile — mostly cosmetic, but two convert a beam weapon into a
lobbed explosive: Lightning Gun's Lobber Barrel, Cryolator's Polar Lobber
Barrel.

- **Chase**: PROJ (same Explosion-flag gate as launcher weapons) → EXPL's own
  direct damage, PLUS a hop EXPL `Placed Object` → HAZD → HAZD `Effect`
  (SPEL) → Damage-archetype MGEF, damage type from the MGEF's own Resist
  Value AV.
- **Materialization**: EXPL direct typed damage → `baseDamage` ADD (instant,
  itemLevel-scaled). The HAZD's tick damage → `dotDamage`, NOT `baseDamage` —
  a lingering field is semantically the same "refresh-only, magnitude=dps"
  convention as any other DoT, a deliberate bucket choice (not just a
  SET-collision workaround).
- **Direct EXPL damage only materializes when a HAZD (Placed Object) hop ALSO
  exists** — filters cosmetic re-skins (Cremator's flame-color receiver mods
  point at re-skinned EXPLs with the same damage as its own on-hit ench;
  walking both would double-count). Without a hazard, a `note` records the
  value rather than dropping or double-counting.
- **Launcher-family guard** (`explosiveFamilyKeywords`): a barrel OMOD's
  materialization is skipped (note-only) when the weapon already carries its
  own weapon-level `fromExplosion` component (BOS Rocket Launcher's elemental
  barrels vs. the Hellstorm's own baseline explosion) — avoids adding a
  number on top of an already-separate, unreconciled baseline. **Known gap**:
  OMOD-level projectile swaps still don't suppress/replace the weapon's stale
  baseline component generally.
- **ASSUMPTION, unconfirmed**: HAZD `Target Interval` (re-tick rate) and
  `Limit` (max simultaneous targets) are NOT modeled — the hazard's magnitude
  folds like any other steady-state DoT, which may over/understate a lobbed
  payload's real contribution.
- **NOT modeled: EXPL "Base Weapon Damage Mult"** (Polar Lobber 1.0) —
  ambiguous whether it means "double the EXPL's own damage" or "twin the
  weapon's original beam damage" (the Polar Lobber replaces the Cryolator's
  firing mode entirely, unlike the Gauss case). Extracted but left unmodeled
  pending a user decision + in-game measurement; a `note` records the value.

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
Engine: `src/lib/fire-rate.ts`.

- **Formula**: auto = `speed / 0.11`; semi = `speed / Attack Delay Seconds`;
  melee = 1.0/s stub (melee timing is the one open scope —
  `dps-todos/melee-cadence.md`).
- **CONFIRMED** against 30+ in-game Pip-Boy readings (live + PTS dumps):
  `Pip-Boy Fire Rate = (effectiveSpeed / cycleConstant) × 10`, rounded —
  `cycleConstant` = 0.11 (auto) or the weapon's own Attack Delay Seconds
  (semi).
- The historical 0.8248 "physical" multiplier and every per-family
  automatic-receiver Speed change is `SET`/`MUL_ADD Speed` on OMODs, resolved
  through ordinary `Includes`-chain flattening — never hardcoded. Confirmed
  across many weapon families.
- **Bug found and fixed**: `isAutomatic` was wrongly derived from the
  `WeaponTypeAutomatic` **keyword** (drives perk conditions only, not real
  fire mode — Combat Shotgun's Automatic Receiver sets
  `HasRepeatableSingleFire`, never `IsAutomatic`, yet carries the keyword).
  **Fixed**: `isAutomaticFlag` now reads the base WEAP `Data.Flags`
  "Automatic" bit; the fold only ORs in an OMOD's real `IsAutomatic SET`.
- V63 Carbine/Meltdown's reduced fire rate comes entirely from its base WEAP
  `Speed 0.8` — no automatic-receiver override exists for it.
- **Confirmed exceptions — real alternate animation-cycle constants** (no ESM
  property encodes these; hand-maintained `animDurationSec` overrides in
  `overrides/corrections.ts`): **Gatling Gun 0.5s** (own `AnimsGatlingGun`
  keyword, distinct from Minigun's standard-cycle `AnimsMinigun`);
  **Gatling Laser Charging Barrels ≈0.1667s (1/6s)** (two independent
  effective-Speed readings back-solve to the same constant). Minigun/Gatling
  Laser (Speed 2.0) and Gauss Minigun (Speed 1.0) all fit the flat 0.11
  formula in their base states — the shared `Charging Attack` WEAP flag does
  NOT by itself imply a custom cycle.
- **False-positive "exceptions" needing no fix** (process gaps, not ESM
  limitations): **Submachine Gun** — no true semi mode exists; every receiver
  incl. "Standard" pulls the same automatic-init template, so the raw
  unmodified Speed is never a real achievable state. **Railway Rifle** — the
  "matches neither dump" finding was from checking PTS readings against the
  live dump; both live and PTS separately match the ordinary formula exactly.
- Stock weapons use base WEAP stats — fine except when a weapon has no true
  semi/auto choice (Submachine Gun above), where the "Standard" option may
  still carry a real override that must be walked.

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
  pending a stopwatched mag-dump+reload cycle.
- **Fold shape RESOLVED (stopwatch-leaning, 2026-07-15)**: OMOD/legendary
  `ReloadSpeed` record rewrites and perk/mutation `WeapReloadSpeedMult` AV
  fortifies land in the SAME `reloadSpeed` bucket (`base + ΣMUL_ADD×base +
  ΣADD`) — NOT an independent `×(1+ΣADD)` layer on top. In-game A/B stopwatch
  comparisons (Fixer, Gatling Plasma across several stack combos) sided with
  the single-fold reading; not a pinned golden (qualitative call, no exact
  seconds recorded).
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

### Reload-skip & free-ammo expected value (2026-07-15)
Two **sustain-chance** buckets (`reloadSkipChance`, `ammoFreeChance`) fold via
independent-probability union (`foldChanceUnion`, `effective-weapon.ts`) and
apply as a SEPARATE multiplicative stage on the already-folded reload
time/capacity — not inside the additive folds (would wrongly stack with
Quad/reload-speed mods).

- `reloadSec_eff = reloadSec × (1 − reloadSkipChance)`. Sources: Quick Hands,
  Wild West Hands.
- `capacity_eff = capacity / (1 − ammoFreeChance)`. Sources: Tesla Science 5,
  Dom Pedro Fortunate magazine mods.
- Multiple sources on the same lever compose as independent probabilities:
  `1 − Π(1 − chanceᵢ)`.
- Fortunate's "add a round past max clip" proc is ignored in the EV
  amortization (same treatment as "don't consume ammo").
- **Tesla Science 5's heavy-gun gate is DESCRIPTION-sourced** — the ESM
  effect carries only a random-percent roll, no weapon-class condition; the
  `weaponClass: ['heavy']` gate is hand-supplied (`buff-overrides.ts`), not
  ESM-proven.

### Fast Fighter & the moveSpeedBonus bucket (2026-07-15)
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
  still is **UNMEASURED** (`dps-todos/move-speed-sources.md`).
- A net move-speed penalty grants nothing (curve clamps at 0,0) — direction
  unverified in-game.

## Crit meter
Engine: `src/lib/engine/crit-meter.ts`.

- `fillPerHit% = (5 + 1.5×LCK) × weaponCritChargeBonus` (GMSTs
  `fVATSCriticalChargeBase`/`Mult`).
- Consumption: `fold(critConsumption over 100)` — Critical Savvy SETs 85/70/55
  — × `(1 − 0.10×limitBreakingPieces)` (hand-modeled).
- Steady state: crit every `ceil(cost/fill)+1` shots, max every 2nd.
  **User-verified anchor**: 16 LCK + Crit Savvy 3 + 5× Limit Breaking → every
  2nd shot.
- Per-weapon Crit Charge Bonus semantics and rounding unverified in-game.

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
| Explosive (2★) | `explosivePayload` spawns an explosive twin per component; folds dbm/crit/PA/wholeDamage but NOT sneak/body-part (see **Formula structure**) | ESM property |
| Crippling / Basher's | extracted to `limbDamage`/`bashDamage` — INERT until limb-targeting/bash is modeled | ESM |
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
| **Follow Through / Taking One for the Team** | Both `wholeDamage` ×(1+value) target-side debuffs, exact card-description match (10/20/30/40%/rank). Both are conditional 10s-window procs, so each is a manual 0/10/20/30/40% toggle (default 0), applied UNCONDITIONALLY, composing multiplicatively | esm-walk-confirmed |
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
- **Known-inert entries** (extracted, selectable, 0% ΔDPS — pre-existing
  `conditions.ts` gaps): U.S. Covert Ops 8 (`ma_*` weapon-archetype keywords
  aren't recognized by the `WeaponType*`-only prefix match), Big Guns
  bobblehead (mixed HasKeyword/IsTrueForConditionForm OR-group), Awesome
  Tales 10 (`GetInIronSights()`), Live & Love 2/5
  (`IsMemberOfAPlayerTeam`/`HasMagicEffectKeyword`). See **Known gaps /
  deferred**.

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
  app-side expansion needed). **Fold-shape ASSUMPTION**: "Mod Weapon Attack
  Damage" routes to `dbm` as MUL_ADD (float−1), additive inside the
  parenthesis like every other fold — whether the engine instead multiplies
  finished damage is unprovable from static data.
- `classFreakRank` is DERIVED, never stored (reads the equipped card's rank).
- **The MGEF `Detrimental` flag now negates flat value-modifier magnitudes
  globally** — before this fix every extracted "Reduce" effect shipped
  POSITIVE (EggHead read +3 STR). DoTs (also Detrimental) are exempt — their
  magnitude IS the damage amount.
- `IsSpellTarget(RadX|Serum_*)` rows are CONSUMED (suppression stays
  unmodeled — mutation selection IS the toggle). This is what un-inerts the
  SPECIAL penalties.
- **SPECIAL folds are condition-aware** (`derivePlayerStats` folds through
  `foldBucket` with the derived gates) — before this fix, any conditioned
  SPECIAL modifier was silently dropped from net stats.

## Target distance (Close / Far)

- **Native-code gate**: `STAT_DmgVsClose`/`STAT_DmgVsFar` carry NO distance
  condition rows anywhere in ESM — the actual range check happens in native
  engine code, not data. Only GMST `fDistanceForCloseDamage` = 850 units
  (≈12m, not cross-checked in-game) exists on record; the far threshold has
  no record at all.
- Modeled as a manual three-way `targetDistance` input (`'close'|'none'|
  'far'`, default none) — **deliberately a player judgment call**, not
  derived/measured, since the real check is opaque.
- Consumers: Guerrilla family (close), Down Ranger/Rifleman family (far),
  Sniper's legendary (+100%, far).
- **Sniper's magnitude rides a Global reference**, not the effect's own
  Magnitude field (which reads 0) — a narrow, field-shape-specific
  resolution, confirmed absent from other zero-magnitude effects (which are
  genuinely script-driven).

## VATS AP economy & manual-aim hit rate
Engine: `src/lib/engine/ap-economy.ts`.

- **AP pool**: `MaxAP = 60 + 10×AGI` (GMSTs `fAVDActionPointsBase`/`Mult`).
- **Per-shot VATS AP cost**: WEAP `Data."Action Point Cost"`. Verified:
  Fixer 16, Minigun 8, Super Sledge 52. Only rewrite is the `vatsApCost`
  bucket (V.A.T.S. Optimized, MUL_ADD −0.35).
- **Regen — race-based %-of-max model, CORRECTED 2026-07-15**: base rate
  lives on RACE `Properties` AV `ActionPointsRate` (**HumanRace 6.0,
  PowerArmorRace 3.0** — ESM-proven; the player's race swaps in power armor,
  halving regen). The value reads as **percent of Max AP regenerated per
  second** (**user-confirmed semantics**, not record-typed): `regenPerSec =
  maxAp × (raceBase + Σ apRegenFlat)/100 × (1 + Σ apRegen)`. Flat sources
  (Company Tea, Nukashine, magazines) ADD onto the race base; percent sources
  (Action Boy/Girl, Lone Wanderer, hydration) stack additively into ONE
  multiplier. Consequence: regen is pool-proportional (AGI/apMax fortifies
  raise absolute regen). **Golden-case TODO**: 5 null goldens pin this
  (`measurement-backlog.md`).
- **Max AP fortifies** (`apMax` bucket, 2026-07-15): Peak Value Modifiers on
  AV `ActionPoints` — food/alcohol/magazines, Scaly Skin's −50 penalty,
  Civil Unrest's +50 identity mod. `maxAp = 60 + 10×AGI + Σ apMax`.
- **Instant AP restores are OUT OF SCOPE by design** (2026-07-15, mirrors
  instant heals) — one-shot Value-Modifier events have no steady-state
  meaning.
- **Hydration AP regen** (baseline, 2026-07-15 esm-walk): a hidden ability
  grants +35% AP-regen to every fully-hydrated non-ghoul with NO perk
  required. Modeled as a **default-ON** toggle. **ASSUMPTION**: lower
  hydration tiers are NOT modeled — all-or-nothing, optimal play = fully
  hydrated. **Rejuvenated** layers hand-authored deltas on top
  (`perk-overrides.ts`); its rank-2 ESM tier also requires Rads ≤100 —
  assumed true (optimal play).
- **Packin' Light** (**Encumbrance**): its `IsOverEncumbered()=0` gate is
  consumed as always-true — the calculator assumes the player is never over
  encumbered.
- **Number Cruncher** ("+2% damage per AP cost"): routed as `dbm 0.02` scaled
  by the EFFECTIVE (post-OMOD-fold) per-shot AP cost, in every scenario —
  **user-confirmed** it improves free aim too. Stock Fixer (16 AP) → +32%.
- **On-kill AP restores are OUT OF SCOPE** — need enemy TTK modeling
  (phase 3).
- **Conductor's** (hand-supplied): crit restores `apPerCrit 10` +
  `apCritHot 20 AP/s over 5s`. The HoT is **REFRESH-ONLY** — a new crit
  restarts the window rather than stacking (**user-confirmed** in-game
  2026-07-15, mirrors the dotDamage convention): steady-state HoT =
  `20 × min(1, 5 × critsPerSec)`, saturating at +20 AP/s under fast crit
  cadence.
- **Passive regen does NOT tick during sustained VATS fire, but DOES tick
  during the reload window** (**user-confirmed**, both halves, 2026-07-15) —
  starts `AP_REGEN_DELAY_SEC` (1.0s, from GMST `fDamagedAVRegenDelay`) after
  firing stops. The AP-specificity of that GMST is an **INFERENCE** matching
  the user-observed ~1s.
- **Steady-state model**: `apGainPerSec = apPerCrit×(shotsPerSec/
  shotsPerCrit) + Σ hot.rate×min(1, hot.durationSec×critsPerSec) +
  reloadRegenPerSec`; `drainPerSec = apCost×shotsPerSec`; `uptime =
  clamp(apGainPerSec/drainPerSec, 0, 1)`. `shotsPerSec` reuses the same
  reload-inclusive cadence as `sustainedDps`.
- **Considered, NOT implemented** (**user decision** 2026-07-15): crediting
  full passive regen during the AP-forced pause (the duty-cycle form) —
  physically defensible but would raise `apLimitedDps` for every
  AP-constrained build; revisit against a measurement.
- Display: AP breakdown always shown when `ScenarioResult.ap` exists; ranged
  weapons only (melee/VATS-melee AP costs are out of scope).
- **Manual-aim hit rate** (`hitRatePct`, 10–100, default 100): scales
  free-aim **SUSTAINED** dps only — never per-hit, burst, or VATS (VATS
  accuracy is assumed 100%, permanently out of scope).

## Power attacks & melee cadence
Engine: `paper-damage.ts`, `scenarios.ts`, `fire-rate.ts`.

- **Power-attack race multiplier** — RACE per-attack-event Damage Mult on
  Power-Attack-flagged events: HumanRace **1.5×**, PowerArmorRace **2.0×**
  (the PA race swap IS the multiplier). Multiplies the whole melee hit
  outside the dbm parenthesis. **Carve-outs proven in the same RACE records**
  (stays 1.0): automatic "power tool" melee (Ripper/Auto Axe), gun bashes
  (unmodeled), and UNARMED (not even Power-Attack-flagged).
- **Melee speed applies relatively** (`1.0 × weapon.speed` instead of a flat
  1.0) — so `fireRateSpeed` OMOD/AV rewrites have an effect on melee.
  Absolute swing timings remain unmeasured (`dps-todos/melee-cadence.md`).
- **Charged (4★ melee)**: damage curve gives **+0.5/+1.5/+3.0** at 1/2/3
  charges (max 3), multiplying the releasing power attack by `(1+y)`.
  **1-charge-per-light-attack is an INFERENCE** — no rate field exists in
  ESM for this mechanic. Modeled as a steady-state cycle: 3 normal hits + 1
  full-charge detonation, averaged into `burstDps`/`sustainedDps`. **Applies
  regardless of the `isPowerAttacking` toggle** — a deliberate choice so DPS
  reflects real steady-state play (**not derived from data**).
- **Thrill-Seeker's**: 10 exact kill-streak tiers, `0.03×N` on melee speed
  AND reload speed. Required `foldWeaponStat` to become condition-aware
  (previously summed all 10 tiers unconditionally — a bug this fixed before
  shipping).
- **Action Boy/Girl cross-family rank gate**: the shared ability spell's
  tiers gate on BOTH gender families' rank formids
  (`OR[HasPerk(ActionBoy02)|HasPerk(ActionGirl02)]`) — resolved via a small
  hardcoded `GENDER_TWIN_PAIRS` map (not substring inference), since the
  player owns one gender's card at a time.

## Onslaught
Bucket: `Bucket.onslaughtMaxStacks`; engine: `resolve.ts`'s
`effectiveOnslaughtStacks`.

The Onslaught stack counter is engine-hardcoded (raw AV `0x00000395`, no
AVIF record at all) — MESG text documents +1 stack/hit, −1/sec, entirely
engine-native (nothing to model). **The app's Onslaught-stacks slider IS the
steady-state input**, standing in for "whatever the counter settles at
during sustained play" (same convention as `adrenalineStacks`/
`bulletStormStacks`). **Base max = 0 is an INFERENCE** — no record defines a
starting cap.

**Max-stack contributors** (Perk Entry Point 190 "Mod Max Consecutive Hits
Allowed" ADDs a flat cap; `ScenarioSet.onslaughtMaxStacks` exposes the fold
to the UI slider):

| Source | Max | Per-stack bonus |
|---|---|---|
| Guerrilla Expert | +3 | +1%/stack reload speed (ranged) |
| Guerrilla Master | +5 | +5%/stack dbm at close range (ranged) |
| Gunslinger Expert | +3 | +1%/stack weak-spot damage (ranged) |
| Gunslinger Master | +10 | none — EP190 is its only effect |
| Furious | +9 | +5%/stack dbm |
| Pounder's | +10 | +10%/stack dbm |
| Splinter's Special Effect | +10 | +10%/stack dbm (P62 content — see below) |
| Whacker Smacker | +0 (grants none) | +5%/stack power-attack damage — needs an external max-stack source |

- **Route B per-stack value — CORRECTED 2026-07-15** (was: modeled as
  `Float` alone, +1%/stack; **user-reported** Furious was only granting +9%
  at full stacks when it should be +45%). Furious/Pounder's/Splinter's EP189
  reads `Float × value(a private referenced AV)` — that AV's **Default
  Value IS the real per-stack step** (Furious's private AV: Default 5.0 =
  the EP190 cap ÷ 9 stacks, so `0.01×5=0.05` → +5%/stack, **confirmed
  in-game**; Pounder's/Splinter's Default 10.0 → +10%/stack). The AVIF
  Maximum (Default × stack cap) had been wrongly dismissed as "authoring
  boilerplate."
- **Sentinel default**: `onslaughtStacks = -1` means "follow the computed
  max" (assume full stacks, the app's existing assume-max convention). A
  non-negative value is an explicit user selection, clamped to the current
  max at read time.
- **Splinter's/Chaos Engine's/Tempest's P62 family**: fully modeled but
  **never shipped in-game** ("The Drifter" encounter never released) —
  stays hidden regardless of what the record graph implies; same verdict for
  the P62 weapon-side legendaries and Combo-Breaker's.
- **Guerrilla Expert's reload-speed bonus is functionally wired**
  (2026-07-14): perk/legendary-perk/mutation/consumable modifiers are
  gathered BEFORE `buildEffectiveWeapon`, so weapon-stat buckets fold from
  OMOD + loadout sources together. Two assumptions: (1) evaluates against
  RAW player conditions, not buff-derived SPECIAL (no known source needs it,
  avoids a `resolveLoadout` ordering cycle); (2) Onslaught-curve inputs read
  a stack cap bootstrap-folded the same way `scenarios.ts` does.
- **`GetWeaponAnimType()` gate mapped** (Martial Artist's melee gate): FO76
  uses only anim types 0/1/5/6/9/10, so `≤6` = melee/unarmed exactly,
  **except** the gun-animated melee oddities Paddle Ball and War Shrike (anim
  9, melee keywords) — correctly NOT buffed, modeled as a dedicated
  `weaponAnimTypeMax` condition rather than a keyword/class translation.
- **`SmallGun_Actor_Condition` gate mapped** (Ground Pounder's reload gate):
  decodes to `(Rifle OR Shotgun OR Pistol) AND NOT HeavyGun` — the extractor
  now inline-expands standalone condition-form references when they
  translate completely.

## SPECIAL & perk budget
Engine: `src/lib/player-stats.ts`.

Rules (**user-confirmed** 2026-07-12, superseding an earlier
derive-from-perks experiment):

- **Base allocation is user-defined**: 1–15/stat, from a pool of 7 base + 49
  level-ups = **56**.
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
  extract.
- **Pyromaniac's/Viper's/Icemen's/Severing** (4★) reworked from ENCH
  properties to plumbing AVs (+50% dbm gated on the enemy's active status).
  Icemen's is a REAL balance change: pre-patch was +20% cryo-scoped damage;
  now +50% vs frozen targets.

## Resist mitigation (dormant scaffolding)
- `DamageResistMult = clamp((dmg × 0.15 / resist)^0.365, 0.01, 0.99)` —
  clamps to [1%, 99%] of paper damage (**user-confirmed**), so paper damage
  is never fully realized nor fully negated. Dormant — paper damage v1 has
  no enemy mitigation.

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
- **Body-part hit rate** (default 100%): while aiming, each hit blends
  `rate×aimed-part + (1−rate)×torso`. Independent of free-aim `hitRatePct`.
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
  `STAT_DeflectChance`, sneak/detection AVs.
- **Doctor's Orders** (audited 2026-07-15): grants a revive-cooldown-reset
  chance — pure self/team support, never touches outgoing damage/DR/crit.
  Deliberately unmodeled, consistent with the existing non-combat
  convention.
- **Crowd Control** (audited 2026-07-15, user report "does bleed now"):
  confirmed CORRECT as extracted — bleed routes through the generic
  physical-DR bucket (there's no separate bleed `DamageType` in FO76); the
  user's observation is accurate, it just isn't a distinct engine bucket.
- **Pyro-Technician's**: looks craftable from static ESM data (a real recipe
  + scripted attach mechanism exist) but **user-confirmed 2026-07-15 it is
  NOT actually craftable in-game** — hidden from the picker; re-check on
  every re-extract in case Bethesda backfills the missing Attach Point
  field.
- **Gamma Gun**: its own weapon-level explosion IS now modeled
  (`fromExplosion`, graduated out of `noDamage` 2026-07-13 — see **Launcher
  explosion damage**). Xerxo's Gamma Ray Gun variant is separately
  unobtainable in-game and hidden.
- **Instance-only target keywords** (~24 unique `ap_customName` mods): the
  game applies a second target keyword at instance-creation via template
  combination, which the base WEAP never has — the shared eligibility
  predicate lets template membership bypass the keyword subset check.
- **Unnamed identity effects** (Holy Fire, Cultist Piercer, Elder's Mark,
  ...) were silently dropped by the no-Name filter — rescued when
  template-member + has properties + sits on an identity attach point.
- **Cursed mods** (`ap_Item_Description`, Nuka-World on Tour): real stat
  payloads on a cosmetic naming slot, no `ObjectTypeUnique` — surfaced by
  the same modifiers+template-membership gate, labeled "Cursed".
- **Dom Pedro**: its Explosive muzzle mods' EXPL payload is hand-supplied
  via `omodModifierAdditions` as a ballistic-scoped ADD curve (right paper
  number, but explosive-only perk interactions aren't modeled — the engine
  has no OMOD-conditional explosive component).

## Known gaps / deferred
- **Follow Through / Taking One for the Team** extract with empty
  `modifiers` (the chain to hidden debuff/companion perks isn't followed)
  but are no longer inert — see the manual toggle in **Hand-supplied
  values**. Taking One for the Team's companion perk ALSO applies an enemy
  DR debuff to the attacker (**-6/-10/-15/-50** at ranks 1-4,
  esm-walk-confirmed, a non-arithmetic progression) — not modeled (no enemy
  DR/ER mitigation exists yet; scoped to `dps-todos/phase-3-enemies.md`).
- Enemy DR/ER, armor pen, range falloff, limb targeting: deferred by plan.
  Race-gated damage (`enemyType`) is **no longer** deferred — see
  **Hand-supplied values**' DmgVs* row.
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
- A handful of magazine/bobblehead buffs are extracted but currently inert —
  pre-existing `conditions.ts` translation gaps, see **Magazines &
  bobbleheads**.

## Future DPS streams
User-supplied rationale, 2026-07-07. Perks that look "unjoined/inert" today
but belong to calculation streams not yet modeled:

| Stream | Sources | Notes |
|---|---|---|
| Limb-damage DPS | Scattershot, Modern Renegade, Enforcer | `limbDamage` bucket exists but scenarios never target limbs yet |
| Bash-damage DPS | Bear Arms, Basher | bash attacks unmodeled |
| Bullet Storm peak DPS | Bringing Out the Big Guns, Foundation's Vengeance, Valkyrie | raises max stacks 10→20; per-OMOD keyword+HP-gated cap-raises aren't extractable yet (no `bulletStormMaxStacks` bootstrap bucket) |
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
