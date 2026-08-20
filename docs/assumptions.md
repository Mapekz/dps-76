# Damage Engine Assumptions

Registry of every engine assertion **not directly proven by ESM data** — each
confirmed or corrected by an in-game golden measurement
(`src/lib/engine/__tests__/golden/`) where possible. Conventions (genre
rules, placement matrix, status vocabulary, why section names below are
load-bearing API): `.claude/skills/docs-writing/SKILL.md`.

## Part A — Unproven claims

One claim per bullet, each tagged with its proof status (**ESM-PROVEN**, **USER-CONFIRMED**, **ASSUMPTION**, **INFERENCE**, **MEASURED**, or **CLOSED**) and a code pointer. Entries retire the moment they're proven or measured — a settled claim is deleted, not marked done.

## Formula structure
Engine: `src/lib/engine/paper-damage.ts`, `resolve.ts`.

```
PaperDamage = Σ_components base(c) × ( dbmFold(c) + Tenderizer + (CritMult−1)[crit]
              + (SneakMult−1)[sneak, non-explosive] + PowerAttackBonus + STR term[melee] )
              × Π wholeDamage × BodyPartMult[non-explosive] × (1 + weakpointBonus)[BodyPartMult>1, non-explosive]
              × PowerAttackRaceMult[melee power attack] × RangeFalloffMult[non-melee]
```

- **Bucket fold** — `result = (last SET ?? base) + (Σ MUL_ADD) × base + Σ ADD`;
  MUL_ADDs always multiply the ORIGINAL base, even under a SET.
  **USER-CONFIRMED.**
- **Explosive/DoT carve-outs** — explosion components skip sneak/body-part/
  weakpoint; DoT (`computeDotDps`) additionally drops crit and has no body
  part in its signature at all. **USER-CONFIRMED, 2026-07-14.**
- **Curve tables override flat magnitudes** wherever both exist. See
  **Single-point curve tables**.
- **STR melee scaling** — STR/20 (1h/2h melee), STR/10 (unarmed).
  **ASSUMPTION** (user-specified, not ESM-confirmed) — rejected GMST
  candidates are in `paper-damage.ts`'s `strengthTerm` doc.
- **Body-part multiplier** resolves from BPTD-extracted per-enemy data (see
  **Body parts (BPTD-extracted)**); manual fallback default 1.5.
- **Range falloff** folds into `outerMult` — see **Target distance (Close /
  Far)**.
- Thrown explosives (grenades, mines) stay excluded. **CLOSED** — vetting-scope
  decision (launchers, not throwables); flagged `projectileOnly`.

## Launcher explosion damage
Engine: `chaseExplosion`, `extract-weapons.ts`.

Chain: WEAP `RGW3."Override Projectile"` ?? AMMO `.DNAM.Projectile` → PROJ
`Data.Explosion` → EXPL `Data`, gated on the PROJ Explosion flag (several
projectiles carry a stale Explosion formid that never detonates).

- **WEAP + EXPL sum per shot** (Fat Man @45: 5 + 1386). **ASSUMPTION**, not
  ESM-proven — pending Pip-Boy card reading (`#65`).
- **Explosive 2★**: always +20% BASE damage pre-DBM; WHICH base depends on
  the weapon's explosion kind (Projectile-Scaling adds to
  `explosionBaseWeaponDamageMult`; Curve-Table instead boosts the
  explosion's own `baseDamage`; Chain-suppressed gets zero). Full
  three-branch logic + rejected alternatives: `effective-weapon.ts`.
  **MEASURED** (user-measured, 2026-07-30).
- **Explosion bonuses are ADDITIVE dbm**: Demolition Expert's
  `STAT_DmgExplosive` routes to `dbm`, scoped `['explosive']`, matching
  `fromExplosion` regardless of elemental type. 'Mod Player Explosion
  Damage' (SCAV!) is a different entry point, routed to `baseDamage` —
  currently inert, no live consumer (`normalize/mgef.ts`).
  **USER-CONFIRMED.**
- **Not modeled**: explosion radius/AoE itself; self-damage. OMOD
  projectile-swap payloads (Hellstorm's tube barrels etc.) ARE modeled —
  see **OMOD-chased launcher payloads**. Radius-to-damage conversion (Bunker
  Buster, Grenadier) is separately modeled — see
  **Explosive-radius-to-damage conversion**.

### Chain lightning (Tesla Cannon's Alternate Current muzzle)
Engine: `explosionIsChain` (`scripts/extract/normalize/explosion.ts`),
`GeneratedOmod.chainSuppressesExplosion`, `effective-weapon.ts`.

The AC muzzle's projectile resolves to a `Chain`-flagged EXPL with zero
damage/mult — chain lightning on direct hit + bounces, not an explosion.
Suppresses the weapon's `explosionBaseWeaponDamageMult` and strips
`explosivePayload` outright (**user-confirmed 2026-07-30**).

- **Not modeled**: the chain damage itself (100% on direct hit, falloff per
  bounce, max 2 bounces). V63-BERTHA adds a bounce and reduces falloff —
  needs a target-count concept the engine doesn't have.
- **Falloff rate is NOT in the ESM** — engine-native, not data.
  `GMST fBouncedProjectilePowerMult` (0x00851143 = 0.7) is Hat Trick's
  ricochet setting, confirmed **NOT** this mechanism. User-reported falloff
  is ~30%/bounce; whether it composes subtractively or multiplicatively is
  **unmeasured**.

### Stream-delivery weapons (Cryolator, Flamer, Plasma Gun/Gatling Plasma with a Thrower Barrel/Nozzle)
Engine: `effective-weapon.ts buildEffectiveWeapon`'s `streamSuppressesExplosion`;
overrides: `weapon-corrections.ts streamDeliveryWeaponIds`,
`omod-corrections.ts streamConvertingOmodIds`.

A continuous stream has no discrete projectile impact to trigger an
explosion, so Explosive 2★ (and any other explosive-family damage) never
applies — same dead-legendary outcome as chain suppression, folded into the
same combined flag so it wins even over a residual `explosionBaseWeaponDamageMult`/
curve-table component on the weapon's own base record. **Not ESM-provable**
— the Explosive omod's own modifier carries `conditions: []` — **USER-CONFIRMED
2026-08-15**.

- **Two directions, hand-maintained by weapon family**: Cryolator and Flamer
  default to stream (`streamDeliveryWeaponIds`, keyed by weapon id); Plasma
  Gun / Enclave Plasma Gun / Gatling Plasma are normal by default and only
  become stream while a specific OMOD is equipped (`streamConvertingOmodIds`
  — the "Thrower Barrel"/"Thrower Nozzle" family).
- **Lifted by a real explosive-conversion barrel**: Cryolator's Polar Lobber
  Barrel (an `explosionChase` OMOD, docs/assumptions.md "OMOD-chased
  launcher payloads") legitimately turns it explosive — matches "the
  calculus changes if an explosive-capable barrel is added first."
- Plasma Caster is **not** in this list — the user's report was specifically
  Plasma Gun's Thrower Barrel and Gatling Plasma's Thrower Nozzle.

### Explosive-radius-to-damage conversion
Engine: `effective-weapon.ts buildEffectiveWeapon`.

`mod_Custom_BunkerBuster`'s `ConvertExplosiveRadiusToDamage` (Boolean,
native DFOB consumer) redirects `STAT_ExplosionRadius` into damage instead
of AoE.

- **Conversion is 1:1**, additive `dbm`, explosive-scoped — radius
  percentage points fold straight into a `dbm` fraction. **ASSUMPTION**, no
  SPEL/PERK/ENCH reads the AV; pending measurement.
- Explosion radius/AoE itself remains unmodeled — Grenadier's own
  `explosionRadiusBonus` is inert unless `explosionRadiusToDamage` is also
  set.

## Weapon-intrinsic DoT & OMOD replacement
Engine: `chaseWeaponEnchantment`/`translateEnchantment` (extract-weapons.ts),
`computeDotDps` (paper-damage.ts).

Some weapons carry an on-hit DoT directly on the WEAP's own `Enchantment`
(Cremator, bladed-melee bleeds, Shishkebab, HarpoonGun), chased via the same
MGEF translation OMOD Enchantments use, gated to Contact-delivery.

- **`GetIsPlayer` inverts for Contact-delivery effects**: `=0` is the
  NPC-target (PvE) branch this calc models — **opposite** of every other
  `GetIsPlayer` reading in this codebase. `conditions.ts`'s
  `subjectIsTarget` flag scopes the flip to Contact-delivery only.
- **Replacement semantics**: `computeDotDps` folds every `kind: 'weapon'`
  `dotDamage` first as the BASE; every OTHER (OMOD/perk) `dotDamage` folds
  on top separately. A plain OMOD ADD stacks with the intrinsic base
  (HarpoonGun + Barbed Harpoon); a SET replaces it (Slow-Burner flips
  ADD→SET for exactly this). **USER-CONFIRMED**, browser-verified.
- `Modifier.durationSec` remains inert — carried for a future DoT model.

## OMOD-chased launcher payloads
Engine: `overrideProjectileModifiers` (`extract-omods.ts`) — full mechanic
(unified PROJ→EXPL chase, REPLACE-vs-ADD, materialization) is in that
function's doc-comment, not repeated here.

Covers 154 `OverrideProjectile` OMODs (mostly cosmetic); real
explosive-family damage: Lightning Gun's Lobber Barrel, Cryolator's Polar
Lobber Barrel, Dom Pedro's Nitro's, Explosive Arrows/Frame, Firework Frame,
Plasma Caster's Signal Dish Barrel, Thirst Zapper mag, Hellstorm's
Napalm/Cryo/Plasma tube barrels, Nuka-Launcher.

- **`explosionBaseWeaponDamageMult` clears to 0 whenever a chase applies**
  (chain-suppressed too) — the intrinsic twin mechanic would be redundant
  with a chase's real components.
- **ASSUMPTION**: HAZD `Target Interval`/`Limit` are NOT modeled — magnitude
  folds as a steady-state DoT for the full `Lifetime`.
- A `Chain`-flagged EXPL is a distinct outcome of this same chase — see
  **Chain lightning**; emits `chainSuppressesExplosion`, not
  `explosionChase`.

## Proc-triggered damage
Engine: `computeProcDps`'s doc-comment (`proc-damage.ts`) covers the fold
mechanic (cadence per trigger kind, per-component damage) in full — not
repeated here. See ADR-0020 for why this is a parallel stream (`Weapon.procs`
/ `ScenarioResult.procDps`), not a `Bucket`.

- **Bypasses dbm/crit/sneak entirely** — same precedent as the
  weapon-intrinsic DoT above: each proc is a separately-cast SPEL, not a
  per-hit component of the paper-damage formula. **USER-CONFIRMED** design
  (PROC_DAMAGE_PLAN.md, issue #42).
- **`reloadCycle`/`lastRound` cadence = `1/(magDumpSec+reloadSec)`** — the
  trigger classification itself is ESM-proven (Electrician's `GetActorGunState`
  reload fan-out; Circuit Breaker's `GetLoadedAmmoCount < 1`, the same shape
  as the `lastRound` condition), but "once per magazine cycle" as the cadence
  model is an **ASSUMPTION** — not measured in-game.
- **`onCripple` cadence is the manual `PlayerInput.procCripplesPerMin` knob**
  (default 0) capped by the granting SPEL's own cooldown — no
  crippling-frequency model exists, same exogenous-knob treatment as
  `killStreak` (**ADR-0009**).
- **AoE components fold as a flat single-target add** (`ProcComponent.isAoe`
  is display/provenance only) — no radius/falloff/multi-target model exists
  for procs. **ASSUMPTION.**
- **Circuit Breaker's stun and VFX-only detonation are not modeled** — its
  first Combat-Hit-Spell effect chases a `Damage: 0.0` EXPL (VFX only,
  nothing to materialize) and its second's `CircuitBreakerEffect_Stun`
  sub-effect (no damage, out of scope) — deliberately unmapped, no damage
  payload to chase in either case.

## DoT/proc resist provenance
Engine: `normalize/mgef.ts` `translate()`'s Damage-archetype branch,
`normalize/proc.ts`'s `decodeInstantDamageComponent` — both document the full
rule at their own site, not repeated here.

- **USER-CONFIRMED 2026-08-20**: the mitigation-relevant type comes from the
  effect record's OWN Resist Value AV or (EXPL-chased) typed `Damage Types`
  entry — never inferred from the parent weapon/OMOD. Neither present →
  `unresisted: true` on the `dotDamage` modifier / `GeneratedProcComponent`
  (mechanically unresisted, expected to capture bleeds naturally — not a
  gap).
- **ESM-validated survey, 2026-08-20**: all 191 `dotDamage` modifiers and all
  7 `procChase` components in live data (weapons/omods/consumables.json)
  resolve to an explicit AV/typed entry today — zero `unresisted` cases yet.
  Bleed example: Assaultron Blade's on-hit ench (`0x0010F3F2` → MGEF
  `0x002387E2`, Resist Value `DamageResist` → `ballistic`). Typed example:
  Electrician's EXPL `0x00799382`'s energy `Damage Types` entry (`dtEnergy`).
- A Resist Value PRESENT but unmapped by `RESIST_AV_DAMAGE_TYPES` stays a
  separate `notes`-only gap (real resist data the map doesn't cover yet), not
  `unresisted`.

## Mixed damage-type OMOD conversion (DamageTypeValues)
Engine: `materializeDamageTypeComponents`'s doc-comment (`effective-weapon.ts`)
covers the missing-type materialization mechanic in full — not repeated here.

- **Fold formula**: `final(X) = max(0, (last SET ?? base(X)) + Σ(MUL_ADD ×
  MUL-base) + Σ ADD)`, clamped to 0. **USER-CONFIRMED.**
- **Twins inherit the parent component's damage type**, not a hardcoded
  `'explosive'`. **USER-CONFIRMED** (Gauss Minigun + Tesla Coil). Generalizing
  beyond ballistic/energy is an **ASSUMPTION** — only Tesla/Science! is
  user-verified.

## Charging weapons
Engine: `src/lib/charge.ts`, `paper-damage.ts`, `fire-rate.ts`,
`effective-weapon.ts`.

Gauss rifle/pistol/shotgun, bows, and tesla/gamma/laser (via charging-barrel
OMODs) ramp damage as the trigger/draw is held. Gate, ramp,
`minimumChargeTime` flooring, the speed-immune cadence formula, explosion-
twin inheritance, the DoT exclusion, and the Gatling Charging-Barrels
naming collision are all documented in `src/lib/charge.ts` and
`src/lib/fire-rate.ts`.

- **Damage ramp** — **USER-CONFIRMED, NOT ESM-proven**: `damage(t) = base ×
  (1 + FPDM × t/FPS)`, linear; only the full-charge endpoint is
  in-game-confirmed, not the linear shape itself.
- **Charging goldens** (6, `expected: null`) are unmeasured, not blocked
  (`#53`).

## Sustained DPS
Engine: `src/lib/engine/sustain.ts`.

- `burstDps = perHitAvg × fireRate`. `sustainedDps = (perHitAvg ×
  shotsPerMag) / (shotsPerMag/fireRate + reloadSec)`.
- **ASSUMPTION**: `reloadSec = Animation Reload Seconds (RGW3) / Reload
  Speed (Data)`. Golden `expected: null` pending a stopwatched cycle;
  divide-vs-time-scale protocol in `#2`.
- **Fold shape (stopwatch-leaning)**: OMOD/legendary `ReloadSpeed` rewrites
  and perk/mutation `WeapReloadSpeedMult` fortifies land in the SAME
  `reloadSpeed` bucket, not an independent layer — backed by in-game A/B
  comparisons, not a pinned golden.
- **Per-shell reloaders** (`AnimsSequentialReload` keyword): repeat the
  reload animation once per round. Keyword is ESM-proven; reading the
  animation time as the per-shell increment is an **ASSUMPTION**.
  Double-Barrel Shotgun is deliberately NOT per-shell
  (`animsDoubleBarrelShotgun`).
- Magazine OMODs map `AmmoCapacity`/`ReloadSpeed` to the same buckets. No
  magazine ⇒ sustained = burst, reload 0.

### Reload-skip & free-ammo expected value
Three sustain-chance buckets (`reloadSkipChance`, `reloadSkipChanceBash`,
`ammoFreeChance`) fold via independent-probability union
(`foldChanceUnion`, `effective-weapon.ts`) and apply as a separate
multiplicative stage on the already-folded reload time/capacity.

- `reloadSec_eff = reloadSec × (1 − reloadSkipChance)`. Sources: Quick
  Hands, Wild West Hands (passive, EP182).
- **Battle-Loader's owns its own channel** (`reloadSkipChanceBash`, EP199
  "Instant Reload Clip On Bash") — a bash swing has a real time cost,
  unlike a passive skip. Full two-channel formula and the "free skip wins
  first" modeling choice: `sustain.ts`'s `sustainTiming` doc-comment.
- **`bashSec`** = `PlayerInput.battleLoadersBashSec` (default 0.75s) —
  **ASSUMPTION, user-approved placeholder** pending an in-game stopwatch
  (`#61`).
- `capacity_eff = capacity / (1 − ammoFreeChance)`. Multiple sources on the
  same channel compose as independent probabilities.
- **Tesla Science 5's 20% `ammoFreeChance` applies to all weapon classes** —
  **USER-CONFIRMED** (2026-08-17): no EP-172 perk in the dump carries a
  weapon-tab condition; the "Heavy guns" card text is prose only. Same
  card-text-vs-data pattern as **Magazines & bobbleheads** (Guns and Bullets
  7). `mgef.ts` EP-172 branch.

### Fast Fighter & the moveSpeedBonus bucket
- Fast Fighter carries **no effects on-record** — "50% of bonus movement
  speed → reload speed" is engine-native, modeled as a hand-authored
  override. **ASSUMPTION** (description-sourced, not ESM-proven): the 50% factor.
- `moveSpeedBonus` reads AV `SpeedMult` at scale 0.01, bootstrap-folded once
  per `buildEffectiveWeapon`.
- **Sprint/swim-gated sources are excluded** (grounded, non-sprint combat
  model); non-sprint sources (Gun Runner, Squad Maneuvers, Portable Power)
  DO feed it. Whether Fast Fighter counts sprint-only bonuses while
  standing still is **unmeasured** (`#69`).
- Emergency Protocols (PA torso mod) feeds this bucket, gated
  `healthBelowPct 20` + `inPowerArmor`.

## Crit meter
Engine: `src/lib/engine/crit-meter.ts` — the `fillPerHit%` formula (GMST +
`CT_LuckVATSCriticalCharge` curve provenance, why `fVATSCriticalChargeMult`
is dead) is fully documented in that module's own doc-comment, not repeated
here.

- Consumption: `fold(critConsumption over 100)` — Critical Savvy SETs
  85/70/55 — × `(1 − 0.10×limitBreakingPieces)` (hand-modeled).
- Steady state: crit every `ceil(cost/fill)+1` shots, max every 2nd.
  **User-verified anchor**: 16 LCK + Crit Savvy 3 + 5× Limit Breaking →
  every 2nd shot.
- Per-weapon Crit Charge Bonus rounding unverified in-game.

## Value curves

Curve-bearing effects (Curve Table + input AV) supply Y at X = a
player/weapon stat, overriding the flat magnitude. Extracted automatically
(`normalize/mgef.ts`, `Modifier.curve`).

- **Single-point curve tables** carry no real input axis — the engine reads
  Y as a flat magnitude directly. Confirmed on three alcohol `dbm` effects
  whose Curve Y matches their flat EFIT magnitude exactly.
- **Null-input DoT curves default to `itemLevel`** when the curve's last
  point is ≤100 (level-shaped domain) — restores ~125 obtainable weapon-mod
  DoTs; MGEFs on a genuinely wider domain (X up to 540+) correctly stay
  dropped.
- **Cross-family `HasPerk` gates → `perkFamilyRank`**: a gate referencing
  another perk family's rank chain (Bullet Storm's reload curve on Lock and
  Load) translates to a runtime condition rather than `unresolved`.
- **Shotgun Champ's projectile-count axis** — **USER-CONFIRMED**:
  projectile count scales the bonus (curve X); crippled-limb presence is a
  binary gate, not a per-limb scale like Bully's.
- **AV pass-through** (issue #44): a zero-magnitude, curve-less effect
  whose Actor Value names a player counter reads its magnitude off that
  counter at runtime — Barbarian (STR) and Mind Over Matter (INT), both
  "+1 per kill on a Kill Streak (Max 10)". Full FormIDs, the guard (must
  route to a `special*` bucket), and the identity-curve synthesis: `mgef.ts`
  (`AV_PASSTHROUGH_DOMAINS`, the `effect.magnitude === 0` branch). Clamp-at-
  10 and decay behavior remain unverified — issue #56.

| Effect | Input (X) | Curve | Notes |
|---|---|---|---|
| Bloodied | current HP fraction | (0.05→+130)…(1.0→0) | linear; clamped below 5% HP |
| Nerd Rage! | current HP fraction | (0.05→80, 0.2→40, 0.8→1, 1.0→0) | perk had zero base magnitude — curve IS the value |
| Junkie's | addiction count | (1→10…10→100) | +10%/addiction to +100% at 10; count itself uncapped in-game |
| Aristocrat's | caps on hand | 0→0…17000→30…29000→50 | up to +50% at 29k caps |
| Juggernaut's (weapon mod) | ABSOLUTE current HP | (0→0, 1000→100) | +0.1%/HP; see **Max HP (derived)** |
| Adrenal (legendary + perk, both) | kill streak | (0→0, 1→10, 10→100) | +10%/stack; curve domain confirms the streak cap of 10 |
| Barbarian (3★ melee legendary) | kill streak | (0→0, 1→1, 10→10) | +1 STR/kill; AV pass-through, see above |
| Mind Over Matter (perk + unique plasma gun) | kill streak | (0→0, 1→1, 10→10) | +1 INT/kill; same AV pass-through shape |
| Polished | equipped weapon condition % | 27-point table, (1.0→0)…(2.0→+60%) | 100% = full condition, 200% = over-repaired max; UI field `weaponConditionPct` 0–200 |

(Berserker's/Iron Fist's WIELDER-DR curve input is documented separately —
see **Berserker's (Damage Unarmored)**. Don't conflate the four Adrenal-family
sources — see `CONTEXT.md`'s Flagged ambiguities.)

## Hand-supplied values
Policy: wiki-sourced values are banned — ESM-derived or in-game-measured only
(`src/data/overrides/`). Effects the ESM can't express stay inert with a
picker badge.

| Effect | Model | Status | Provenance |
|---|---|---|---|
| Furious | Onslaught stack counter (+9 max, +5%/stack dbm) — see **Onslaught** | ESM-PROVEN | granted-perk chase |
| Instigating | +50% dbm while enemy HP ≥ 60% | ESM-PROVEN | — |
| Executioner's | +50% dbm while enemy HP ≤ 40% (default 100 → inactive) | ESM-PROVEN | — |
| DmgVs* family (Hunter's, Exterminator's, Ghoul Slayer's, Assassin's, Troubleshooter's, Zealot's, Mutant Slayer's) | +50% dbm vs matching enemy race/keyword via the Target picker's race | ESM-PROVEN | — |
| Bully's / Tormentor | dbm per crippled limb (+25%/+20%), cap **6** | ASSUMPTION | ESM per-stack value; the 6-stack cap is not ESM-derived |
| Explosive (2★) | See **Launcher explosion damage** § "Explosive 2★" | MEASURED | ESM property; which explosion-kind branch applies was settled by in-game measurement |
| Crippling / Basher's | extracted to `limbDamage`/`bashDamage` — INERT until limb-targeting/bash is modeled | ESM-PROVEN | extracted, inert pending limb-targeting/bash modeling |
| Scaly Skin (+ Chameleon/Grounded ripple) | +DamageResist/+EnergyResist extracted to `damageResistGain`/`energyResistGain` (50/62 normal/Class-Freak) — INERT until wearer-side resist mitigation is modeled | ESM-PROVEN | extracted, inert pending wearer-side resist mitigation |
| Pyromaniac's / Viper's / Severing's | +50% dbm while target has an active fire/poison/bleed status (toggle, default off); Viper's `ImmuneToPoison` gate CONSUMED | ESM-PROVEN | granted-perk chase |
| Last Shot | +100% dbm on the magazine's last round, on a 25% roll (`LGND_LastShotChance`), folded to `procChance / shotsPerMagazine` per shot — see `docs/adr/0019-last-shot-is-a-magazine-cycle-average.md`. Whether `GetRandomPercent` re-rolls per shot or per reload is unproven; both readings give the same steady-state EV (the flag is only read on the one shot where `GetLoadedAmmoCount()==0`), a persists-once-set reading would be higher | INFERENCE | ESM proves the 25% gate; the roll's cadence is not record-proven |
| Encircler's | +10%×N from `enemyGroupCount` tiers; default count **1** | ESM-PROVEN | — |
| Fencer's (melee) | +12.5–50% from exact `teammateCount` tiers; range-check CONSUMED | ESM-PROVEN | — |
| Mutant's / Gourmand's / Lucid | curve-driven on `mutationCount`/**Hunger & thirst tiers**/`feralTier` | ESM-PROVEN | — |
| **Hunger & thirst tiers** | `hungerThirstTier`(0–8) = foodTier + drinkTier | INFERENCE | ESM AV max is proven; the sum decomposition (foodTier + drinkTier) matches Gourmand's behavior but isn't record-proven |
| **Feral meter** names | 8/6–7/4–5/2–3/0–1 banding of 5 tier names over 9 values (display-only) | INFERENCE | tier names are ESM-sourced; the banding over 9 values is ours |
| Two Shot | ×1.75 confirmed (Fixer@50: 103→180.25); extra projectile feeds no damage term yet | USER-CONFIRMED | ESM property; multiplier confirmed in-game |
| Anti-Armor family | −50% target armor via `armorPen`, live (`mitigation.ts`) | ESM-PROVEN | — |
| Bleed/burn/shock mod DoTs | `dotDamage`, refresh-only model (re-applying resets the timer). Exempt from sneak/crit/body-part | INFERENCE | ESM proves total-over-duration; reading it as dmg/sec is ours, not record-proven |
| Adrenal Reaction (mutation) | +5%/stack (+6.25% SiN); below x=1 the curve clamps to its lowest point (standard curve-table convention) | ESM-PROVEN | curve-driven |
| **Tenderizer** | +0.1% dbm/stack, manual 0–1000 (cap +100%), target-side, applied UNCONDITIONALLY | ASSUMPTION | ESM per-stack value; the 0–1000 manual cap (+100%) is not ESM-derived |
| Follow Through / Taking One for the Team | Both `wholeDamage` ×(1+value) target-side debuffs (10/20/30/40%/rank), manual toggle default 0, composing multiplicatively. Both grant a PERK to the struck actor via a spell chain carrying "Mod Incoming Weapon Damage" | ESM-PROVEN | esm-walk-confirmed spell chain |
| **Follow Through / TOftT suggestion sneak gate** | Suggestions offer YOUR OWN card only when it can proc: Follow Through requires `isSneaking`, TOftT requires NOT sneaking (`manualUptimePerkSuggestible`, manual-uptime.ts; variants.ts add+swap-in loops). Knobs stay unconditional — any player's card places the debuff | USER-CONFIRMED | proc gating is card-text/game behavior, not record-proven |
| SPECIAL buffs (Buffout, Bufftats, Mentats, Berry Mentats) | flat unconditional ADDs into STR/LCK; other stats stored-inert until perk-SPECIAL scaling | ESM-PROVEN | — |
| Juggernaut's max-HP input | `maxHealth` is DERIVED (**Max HP (derived)**), read-only | CLOSED | not a hand-supplied value — cross-reference only |
| **Strange in Numbers** | DERIVED: active iff card equipped AND `teammateCount≥1` (teammate mutation status not modeled) | ASSUMPTION | card text is ESM-provable; whether teammate mutation status also matters is an unmodeled project-owner decision |
| Kill-streak slider gating | existence scan over assembled modifiers, unlike Onslaught's dedicated bucket fold; the `0` default is deliberate — `docs/adr/0009` | CLOSED | settled engine-wiring decision, not an open question |
| United Ordeal | Ghoul-only, +1/+2/+3 all 7 SPECIAL, ranks 1–3, while `playerIsGhoul` AND `teammateCount≥1` | ESM-PROVEN | — |
| Public team bonuses | user-selected toggle (None/Casual/Exploration), NOT derived; magnitude `min(teammateCount+1,4)` is a documented bond-score-proxy simplification | ASSUMPTION | the toggle gate is ESM-sourced; the bond-score-proxy magnitude formula is a documented simplification, not ESM-derived |

## Consumable stacking & addictions
Implementation: `src/lib/consumable-rules.ts` (single shared implementation
for build reducer, persistence codec, and picker UI).

Binding rules (**user-specified**): Chem — one active at a time. Alcohol —
one active at a time, independent of chem. Food/non-alcohol drink — stack
freely UNLESS they grant the "same bonus", which displaces.

- **"Same bonus" is derived from ESM data, never hand-authored** —
  `dispelKeys` (resolved KYWD edids of each dispel-flagged MGEF). Two buffs
  collide iff their key SETS are IDENTICAL — exact-set equality, not any
  intersection (every food shares broad non-discriminating keywords).
- **Displacement is item-level, not per-effect** — a collision on any
  single `dispelKeys` entry evicts the WHOLE item. Documented
  simplification of the game's per-effect dispel system.
- **Addiction**: each ALCH's `Effect Data.Addiction` field points directly
  at an `AbAddiction<Name>` SPEL. Catalog is scoped to addictions caused by
  an obtainable, selectable consumable.
- **Suppressors survive the zero-modifier gate**: a record with an
  addiction AND ≥1 `dispelKeys` entry is kept even with zero routed
  modifiers (Med-X, Nukashine) — taking a 0-damage chem still drops a
  Junkie's stack.
- `addictionCount` (Junkie's curve input) is DERIVED: selected addictions
  minus those SUPPRESSED by a currently-active addictive consumable —
  category-agnostic. **CLOSED** (user decision).
- **Withdrawal penalties**: each addiction's own effects are flat
  Detrimental Peak-Value SPECIAL debuffs, uniform across all 12 families
  (no Class Freak gating — verified). Applied at selection-time.

## Magazines & bobbleheads
Engine: `extract-buffs.ts`, `consumable-rules.ts`.

Magazines/bobbleheads are ALCH records carrying dedicated keywords
(`MagazineKeyword`+series, `BobbleheadKeyword`+stat), checked ahead of the
chem/food/drink/alcohol classification.

- SPECIAL bobbleheads are a direct Peak Value Modifier. Combat
  magazines/bobbleheads are a Script-archetype MGEF with a "Perk to Apply"
  grant, auto-chased through the same path a legendary's `AttachedPerk`
  uses.
- **Bonus text** (`describeBuffModifiers`) is derived from the extracted
  `Modifier[]`, deliberately NOT the ESM's card text — the description can
  promise a condition the data doesn't carry (Guns and Bullets 7 says
  "without scopes" but its modifier is unconditional).
- **Stacking**: one magazine and one bobblehead active at a time,
  independent of chem/alcohol/food/drink.
- **Aim-down-sights toggle** (`isAimingDownSights`, default false) gates
  extracted `GetInIronSights()` rows (Fact Finder, Longshot, Awesome Tales
  10).
- **Under-alcohol derived flag** (`underAlcoholEffect`, derived from any
  active alcohol-category consumable) gates Live & Love 5's
  `HasMagicEffectKeyword(AlcoholEffect)` row.
- **Live & Love 5 magnitude (+2 LCK)**: **INFERENCE** — Script-archetype
  MGEF, no extractable Peak Value Modifier; taken from card description
  (`buff-overrides.ts`).
- Live & Love 2 (`dbm` +5%) gates on `teammateCount ≥ 1` — 0% ΔDPS solo is
  correct team-buff behavior, not an extraction gap.

## Carnivore's / Herbivore's food scaling
Engine: `src/lib/diet-mutations.ts`.

`Mutation_Carnivore`/`Herbivore` SPELs grant Script-MGEF perks whose "Mod
Spell Magnitude" entry points rescale ingested food (×2.0 normal / ×2.5
Strange-in-Numbers for matching-type food, ×0 for the opposing type).

- **The asymmetry is real**: Carnivore only ZEROES Vegetable-tagged food —
  pure Herb/Fruit dishes keep their undoubled benefit.
- Only effects carrying `SURV_EffectTypeFood{Buff,Hunger,Healing}` scale —
  audited across all 77 meat/veg foods; sole exception `Moon_Rudy_Pozole`
  (lacks the keyword, exempt in-game).
- **Mixed meat+vegetable dishes** zero for either mutation
  (zeroing-wins) — no damage-relevant record carries both tags today; this
  rule is **shape-derived, NOT measured** in-game.
- Carnivore+Herbivore together is impossible in-game (each cures the
  other); enforced on toggle.
- RadX suppression of mutation effects is NOT modeled — mutation selection
  already IS the active/inactive toggle.

## Mutation penalties & Class Freak
Engine: `src/lib/class-freak-mutations.ts`.

- **Mechanism A (generic keyword scaling)**: every mutation "Reduce" MGEF
  carries `AbilityTypeMutation_NegativeEffect` + `Detrimental`. Class
  Freak's 3 ranks each carry a "Mod Spell Magnitude" entry (×0.75/0.5/0.25)
  gated on that keyword. Tagged set: EggHead, Eagle Eyes, Talons,
  Marsupial, Bird Bones, Herd Mentality, Adrenal Reaction.
- **Mechanism B (per-tier granted perks)**: Grounded's energy-DR-reduction
  perk bakes 4 discrete tiers via `HasPerk(ClassFreak0N)` gates directly.
  "Mod Weapon Attack Damage" routes to `wholeDamage` (a standalone
  multiplier), NOT `dbm` — a genuinely different Entry Point from "Mod
  Weapon DMG Bonus Mult" (the real `dbm` source). Full reasoning: the
  `wholeDamage`/`baseDamage` doc comments (`src/types/modifiers.ts`) and
  `ENTRY_POINT_BUCKETS` (`scripts/extract/normalize/mgef.ts`).
- `classFreakRank` is DERIVED, never stored.
- **The MGEF `Detrimental` flag negates flat value-modifier magnitudes
  globally** — without it, "Reduce" effects extract POSITIVE. DoTs (also
  Detrimental) are exempt.
- `IsSpellTarget(RadX|Serum_*)` rows are CONSUMED (suppression stays
  unmodeled) — this is what un-inerts the SPECIAL penalties.
- **SPECIAL folds are condition-aware** (`derivePlayerStats` folds through
  `foldBucket` with the derived gates).

## Target distance (Close / Far)
Engine: `src/lib/distance.ts` (constants, `rangeFalloffMult`), `resolve.ts`
(`targetDistance`), `effective-weapon.ts` (range-bucket fold),
`scenarios.ts`, `paper-damage.ts`.

- **Close gate = 850 raw units** — GMST `fDistanceForCloseDamage`.
  **ESM-PROVEN.** `STAT_DmgVsClose`/`STAT_DmgVsFar` carry no distance
  rows anywhere — the check is native engine code, not data.
- **Far gate = 1000 raw units (46.875 Pip-Boy units).** **MEASURED** — no
  ESM record gives a number; via the CAMP-foundation method
  (`src/lib/distance.ts`).
- Both gates boundary-inclusive (`d ≤ 850` / `d ≥ 1000`), default 900
  (neither fires). Consumers: Guerrilla family (close), Down
  Ranger/Rifleman family (far), Sniper's legendary (+100%, far).
- **Composite range-falloff model** — **USER-CONFIRMED** reconciliation of
  two ESM-proven pieces (curve `CT_Player_PercentOfMinToMaxRangeDMGMult` +
  the `minRange`/`maxRange`/`outOfRangeDamageMult` WEAP fields). Full
  three-segment formula, the `X = (d−minRange)/(maxRange−minRange)`
  derivation, melee exemption, and degenerate-span guard: `src/lib/distance.ts`.
- **Explosive-component exemption** — **USER-CONFIRMED**: `rangeFalloffMult`
  folds into `outerMult` only; explosive components don't fall off via this
  curve (their own Inner/Outer Radius falloff is a separate, unmodeled,
  spatial mechanic).
- **Sniper's magnitude rides a Global reference**, not the effect's own
  Magnitude field (which reads 0) — narrow field-shape resolution
  (`normalize/mgef.ts`).
- Range OMODs (`weaponMinRange`/`weaponMaxRange`/`weaponOutOfRangeMult`)
  folded in `effective-weapon.ts`, same pattern as `ammoCapacity`/
  `reloadSpeed`.

## VATS AP economy & manual-aim hit rate
Engine: `src/lib/engine/ap-economy.ts` — pool/regen formula, the
race-based %-of-max model, Conductor's refresh-only HoT, the
`AP_REGEN_DELAY_SEC` GMST provenance, and the pool-cycle uptime model are
all documented on that module's own doc-comment, not repeated here.

- **Per-shot VATS AP cost**: WEAP `Data."Action Point Cost"`, rewritten by
  `vatsApCost`. Engine keeps the raw float (16×0.7 = 11.2); Pip-Boy
  displays `round(cost)` — do not round to match it.
- **Instant AP restores are OUT OF SCOPE by design** (mirrors instant
  heals) — one-shot Value-Modifier events have no steady-state meaning.
  Same for on-kill restores (Grim Reaper's Sprint, Inertial).
- **Rejuvenated's low-Rads gate**: its rank-2 AP-regen/max-HP delta is
  ESM-gated on `Rads ≤ 100` (`player-baseline.ts`, `perk-overrides.ts`).
  **ASSUMPTION**: modeled unconditionally (optimal play) — the app doesn't
  track player Rads.
- **Packin' Light** (**Encumbrance**): its `IsOverEncumbered()=0` gate is
  consumed as always-true.
- **Number Cruncher**: routed as `dbm 0.02` scaled by the effective per-shot
  AP cost, in every scenario. **USER-CONFIRMED** it improves free aim too.
- **VATS canonical DPS = `apLimitedDps`**. **CLOSED** (user decision): the card
  headline, headline strip, auto-emphasis, suggestion ranking, and suggestion
  deltas all use the duty-cycle blend `uptime × vatsSustained + (1 − uptime) ×
  freeAimSustained` — during the AP-empty pause the player free-aims
  instead of idling. `effective.sustainedDps`/`ttk` blend the same weights
  via `blendEffectiveDps` (`scenarios.ts`). See `docs/adr/0007`.
- **Passive AP regen during free-aim fallback** (**USER-CONFIRMED** in-game,
  `#75`): keeps ticking at full `regenPerSec` in free aim — sighted, hip,
  and scoped ADS all cost no AP. Exception: holding breath while scoped.
- **Manual-aim hit rate** (`hitRatePct`, 10–100, default 100): Free Aim's
  "does the shot hit at all" share, scaling free-aim SUSTAINED dps only.
  Independent of `bodyPartHitRatePct` — see **Body parts (BPTD-extracted)**.
- **Manual VATS hit rate** (`vatsHitRatePct`, 10–100, default 100): VATS's
  *only* accuracy knob — share of VATS shots landing on the targeted part.
  Auto-computing VATS hit chance from distance/Perception/perks stays
  **permanently out of scope**. Unlike Free Aim, a VATS miss deals **zero
  damage** — no torso fallback (full mechanism: `bodyPartBlendedHit`'s doc
  comment in `scenarios.ts`).

## VATS hit-chance aggregate (display-only)
Engine: `scenarios.ts` (bootstrap fold → `ScenarioSet.vatsHitChanceBonus`).
UI: `TargetSection.tsx` pill next to the VATS hit-rate slider.

- **Aggregation ≠ computation**. **CLOSED** (user decision): the standing "auto-computing
  VATS hit chance is permanently out of scope" ruling bars DERIVING a
  hit-chance number from game state; it doesn't bar summing already-known
  ESM bonus magnitudes for display. `vatsHitChance` (`regime: 'display'`)
  is consumed ONLY by the UI pill — never threaded into any damage term
  (regression-tested). The manual `vatsHitRatePct` slider stays the sole
  authoritative VATS hit-rate input.
- **Fold base is 1, not 0** (unlike `armorPen`): `foldBucket(mods,
  'vatsHitChance', 1, ctx) - 1`.

Modeled sources (all **ESM-PROVEN** unless noted):

| Source | Route | Contribution |
|---|---|---|
| V.A.T.S. Enhanced (OMOD) | flat ADD `STAT_VATSAccuracy` | +0.50 |
| Awareness perk | curve vs Perception AV | +0.05 to +0.50 by rank |
| Eye of the Hunter (Ghoul-only) | `playerIsGhoul` + `targetDistance('far')` — **INFERENCE**, ESM's own gate is a numeric distance threshold, collapsed onto the far-range bucket | +0.20/+0.25/+0.30 |
| V.A.T.S. Matrix Overlay (7 PA helmets) | Multiply Value ×1.1 | MUL_ADD +0.10 |
| Orange Mentats | flat Peak Value Modifier, 300s | +0.10 |
| Hoppy Hunter IPA | Multiply Value ×0.8 (penalty) | MUL_ADD −0.20 |
| Twisted Muscles (Class Freak tiers) | Multiply Value ×0.7/0.77/0.85/0.93 | MUL_ADD −0.30/−0.23/−0.15/−0.07 |

Concentrated Fire does NOT feed this aggregate — its hit-chance half is a
multiplier, not additive; see **Concentrated Fire stacks** below.

- **Concentrated Fire stacks**: the plumbing perk carries EP135 (damage,
  0.01×rank `dbm` ADD) and EP109 (hit-chance, a MULTIPLIER on the game's
  own VATS hit chance — semi ×(1+0.04×rank), auto ×(1+0.01×rank)). Both
  gated `stacks(counter: 'concentratedFire', max: 20)`, the stack count a
  manual slider standing in for the native per-target consecutive-shots
  counter. Full mechanism and the hand-authored-override rationale:
  `overrides/perk-overrides.ts`'s `ConcentratedFire` entry — **must be
  removed in the same commit if EP135/EP109 extraction ever lands**
  (double-stack hazard, `#48`).

## Lifetime challenge completions
Engine: `resolve.ts` (`lifetimeChallengeCompleted`), `ConditionsSection.tsx`.

- **Pipe crafting challenge** (default empty): manual toggle when The Pipe
  is equipped; gates the fourth Licensed Plumber `dbm` rung.
- **Kingfisher Local Legend count** (default 0): manual 0–6 slider; each
  completed challenge is +10% `dbm` via six independent gates — same
  exogenous-counter default convention as kill streak / Concentrated Fire
  — `docs/adr/0009`.

## Power attacks & melee cadence
Engine: `paper-damage.ts`, `scenarios.ts`, `fire-rate.ts`.

- **Power-attack race multiplier** — RACE per-attack-event Damage Mult:
  HumanRace **1.5×**, PowerArmorRace **2.0×**. **Deliberately NOT
  re-extracted as an ESM-derived constant** (`extract-constants.ts`'s
  module doc) — RACE `Attacks[]` is a 32-entry table with no single scalar
  to read; picking "the" generic-melee entry by name risks silently
  extracting a carve-out's value.
- **Race-mult vs PowerAttackDBM split** — **USER-CONFIRMED**: the race
  mult (native, hardcoded) is unrelated to `STAT_DmgPowerAttack`'s additive
  `powerAttackBonus` dbm bucket (Heavy Hitter, Radioactive Strength). Full
  split: `paper-damage.ts`, DFOB pinned at `verify-dfobs.ts`.
- **Melee speed applies relatively** (`1.0 × weapon.speed`). Real
  per-weapon swing timing (`animationAttackSec`) is extracted, not a flat
  stub (`#45` closed).
- **Charged (4★ melee)**: +0.5/+1.5/+3.0 at 1/2/3 charges, multiplying the
  releasing power attack by `(1+y)`. Extracted, not hand-copied — full
  curve chase and the 1-charge-per-light-attack **INFERENCE** at
  `scenarios.ts`.
- **Thrill-Seeker's**: 10 exact kill-streak tiers, `0.03×N` on melee speed
  AND reload speed — relies on `foldWeaponStat` being condition-aware.
- **Action Boy/Girl cross-family rank gate**: the shared ability's tiers
  gate on both gender families' rank formids — a hardcoded
  `GENDER_TWIN_PAIRS` map, since the player owns one gender's card at a
  time.

## Onslaught
Bucket: `Bucket.onslaughtMaxStacks`; engine: `src/lib/engine/onslaught.ts`
(stack counter, max-stack table, Route B, reverse mode — full mechanic in
its module doc-comment), `resolve.ts`'s `effectiveOnslaughtStacks`.

- **Base max = 0 is an INFERENCE** — no record defines a starting cap. The
  app's slider IS the steady-state input. Sentinel `-1` = follow the
  computed max.
- **Splinter's/Chaos Engine's/Tempest's P62 family**: fully modeled but
  never shipped in-game ("The Drifter" encounter never released) — stays
  hidden regardless of what the record graph implies (`weapon-corrections.ts`
  hides the WEAPs; `omod-corrections.ts` hides their identity/special-
  effect/appearance OMODs).
- **Reverse regen/consumption/averaging** — **ASSUMPTION** (each): +1
  stack/sec never interrupted; consumption = `onslaughtHitEventsPerShot`;
  averaging = faithful mag+reload sawtooth. Forward sustained sim is the
  mirror by symmetry (unmeasured) — `forwardOnslaughtAvgStacks`.
- **`targetsHit` input** — **ASSUMPTION**: default 1 (single-target DPS);
  user-set for AoE/cleave under reverse mode only today.
- **Splash-reliant suppression** — **ASSUMPTION**: lobbed splash launchers
  count no physical projectile tick in Onslaught hit-events, both
  directions — curated list `weapon-corrections.ts`
  `splashReliantWeaponIds`; measurement tracked as `#77`.

## Bullet Storm
Buckets: `bulletStormMaxStacks`, `bulletStormMinStacks`,
`bulletStormRetention`; engine: `resolve.ts`'s `effectiveBulletStormStacks`,
`bulletstorm.ts`'s `bulletStormAvgStacks` — accrual formula and the
instant-reload/retention interaction documented on that function.

The stack counter is engine-hardcoded (raw AV `0x0000039B`, no AVIF
record), same shape as Onslaught's. **Base max = 0 is an INFERENCE.**
`bulletStormMaxStacks` sources: Bullet Storm perk +10, Bringing Out the Big
Guns +10 more, Foundation's Vengeance +5 more (`healthBelowPct: 25`,
inclusive `≤`, via Heavy Gunner's `AbPerkHeavyGunner` SPEL gated on
`CustomItemName_FoundationsVengeance` keyword the identity OMOD grants — not
a direct OMOD modifier) — cap ranges 10/20/25 by loadout. `bulletStormMinStacks`
(Resolute Veteran +5) is the same shape as a floor.

- **Sentinel default** `-1` = follow the computed max, same convention as
  Onslaught, clamped `[min, max]`.
- **No-magazine weapons** simplify the sustained average to a flat
  `max` — **ASSUMPTION**, no ramp-up from 0.
- **Bootstrap fold, twice**: like `onslaughtMaxStacks`/`moveSpeedBonus`,
  the max/min are folded once per scenario input AND once in the
  weapon-stat bootstrap fold.
- **Inert siblings**: `bulletStormOnKill` (kills unknowable in
  steady-state), `bulletStormSpinUp` (not modeled), `deflectChance` (no
  incoming-damage model).

## SPECIAL & perk budget
Engine: `src/lib/player-stats.ts`.

Rules (**USER-CONFIRMED**):

- **Base allocation is user-defined**: 1–15/stat, pool of 7 base + 49
  level-ups = **56**. Pool size **ESM-PROVEN** — curve-derived, extracted
  not hand-copied; full derivation and the `PLAYER_LEVEL = 300` modeling
  choice at `player-stats.ts`.
- **Legendary perk slots are curve-derived** — 6 at `PLAYER_LEVEL`;
  `player-stats.ts`'s `legendarySlotsAtLevel`.
- **Legendary SPECIAL cards** add ON TOP of base (may exceed 15) AND grant
  extra perk points — budget per stat is `min(15, base + legendary
  bonus)`.
- **Card point costs are PCRD data, not rank** (`perk-cards.ts`).
- **The PCRD `Perks[]` list is the LIVE shape of a card** (**USER-CONFIRMED**):
  28 rebalanced cards record fewer entries than the family has PERK
  ranks — surplus ranks are dead content. `maxRank` clamps to entry count.
- **Antibiotic / Conductor / Light Meal are NOT live cards**
  (**USER-CONFIRMED**) — unreleased PCRDs, get no PerkId.
- **Blocking**: over-budget slotting refused in-app; N&D imports are NOT
  blocked (shown "over budget" instead).
- **Race-restricted cards**: PCRD "Race Restriction" enum, card-level —
  switching race prunes whatever no longer fits, after a confirm dialog.
- SPECIAL clamps to [1, 100] per the 7 SPECIAL AVIF records' own
  Min/Max Value — extracted (`extract-constants.ts` → `getSpecialClamp`).

## Max HP (derived)
Engine: `src/lib/player-stats.ts`.

- **Base formula: `245 + 5 × effective END`** — **ASSUMPTION** (user-supplied
  convention, not ESM-proven; level-scaling GMSTs weren't chased).
- `maxHealth` bucket: MGEF Peak Value Modifiers on AV `HealthBonus` —
  Lifegiver (END-keyed curve), Nocturnal Fortitude, Spotlight.
- **Lifegiver ranks 2/3 are dead content** — the live card records a
  single rank.

## Ghoul Glow
Glow is the ghoul resource stored in the **Rads** actor value; ghoul perk
effects gate on `GetValue(Rads) ≥ N`.

- **Max Glow = max HP** — **ASSUMPTION** (user-stated convention, not ESM-proven).
- Thresholds are absolute literals + GLOB-resolved spend gates, all
  translate to `{kind:'glowAtLeast', min}`.
- Spend gates are steady-state — Glow drain over time isn't modeled.

## Resist mitigation
Engine: `src/lib/engine/mitigation.ts` (`applyMitigation`) — formula, the
7-GMST exponent/factor/clamp inventory, radiation squaring, the
damage-type→resist-type map, and the Option A pipeline-position rationale
are all documented there. `src/lib/enemy-defenses.ts`, `scenarios.ts`
(bootstrap fold → `armorPenTotal`/`armorPenFlatTotal`). Shipped as Phase 2
— Enemy defenses.

- **Option A divergence — MEASURED** (synthetic, `mitigation.test.ts`):
  applying mitigation once to the blended hit under-states retained damage
  vs. true per-hit-then-blend by **−2.1% to −2.9%** at a 2× crit mult and
  15–45% steady-state VATS crit rates — small enough that Option A ships
  as specified.
- **`armorPen`** (fraction): Incisor/Stabilized/Tank Killer/Anti-Armor,
  76 extracted modifiers, unconditioned flat ADDs.
- **`armorPenFlat`** (resist points): Taking One for the Team's flat DR
  debuff (hidden companion perk, physical-only, magnitudes **6/10/15/50**
  at ranks 1–4; the rank-4 jump is a possible ESM data-entry anomaly,
  modeled as-is) plus Contact-delivered on-hit "Reduce Damage Resist"
  weapon mods — Cosmic Knife Super-Heated (**25** points) and Pipe
  Syringer's Endangerol Barrel (**0.25** points, literal ESM magnitude).
  `mgef.ts` `translate()` routes Peak-Value-Modifier `DamageResist` MGEFs
  with `Detrimental` + `subjectIsTarget` (Contact ENCH/SPEL delivery) to
  this bucket with a positive value instead of `damageResistGain`.
- **DoT is NOT mitigated in v1** — `ScenarioResult.dotDps` stays a
  separate, unmitigated add. Matches the plan.
  - **Design constraint for whenever DoT mitigation lands** (user-flagged
    2026-08-20, re: Holy Fire + Standard/Napalm Tank both being equippable
    at once): multiple simultaneous `dotDamage` sources on one weapon are
    genuinely SEPARATE ticking instances (each its own magnitude/duration),
    not one merged pool. `computeDotDps` sums them into a single steady-state
    number today (harmless while unmitigated), but resist mitigation must
    NOT be applied to that summed total — it has to apply per-source, before
    summing. Reason: FO76's mitigation formula has a flat/non-linear
    component (see `mitigation.ts`'s exponent/factor/clamp), so two separate
    smaller ticks each individually mitigated retain LESS total damage than
    one combined tick of the same total magnitude mitigated once — resist is
    more punitive against split ticks. Get this backwards (sum-then-mitigate)
    and multi-DoT loadouts (e.g. Holy Fire on a Flamer with either tank)
    would over-state damage.
- **Level-slider default = max** (`resolveTargetLevel`): an unset target
  level resolves to the race's `levelMaxGlobal` — **ASSUMPTION**
  ("endgame" use case). Fallback bounds 1–100 when a race has no Renorm
  window at all — also **ASSUMPTION**.

## Berserker's (Damage Unarmored)
Engine: `resolve.ts` (`playerDamageResist` `CurveInput` reader),
`src/types/modifiers.ts`, `scripts/extract/normalize/mgef.ts`
(`CURVE_INPUT_AVS['0x000002E3']`).

The AV is `DamageResist` (0x000002E3) and holds the WIELDER's own value,
never the enemy's.

- **USER-CONFIRMED**: Berserker's (curve (0,50)→(20,30)→(40,17)→(60,5),
  scale 0.01) is FO76's "deals more damage the LESS armored you are"
  effect. Confirmed by a second independent perk reading the same AV with
  the same semantics: Iron Fist ("Your Fists deal more damage based on
  your DR", opposite slope, same AV/axis).
- **No armor-mitigation model exists** to derive this from equipped gear,
  so the curve X is a manual input, default **0 = naked**.

## Creature stat curves & NPC extraction (Phase 2 data)
Engine: `scripts/extract/extract-curvetables.ts`,
`scripts/extract/extract-npcs.ts`, `src/lib/creature-curves.ts`.

- **Curve X-axis = the target's own effective level**: `effectiveLevel =
  clamp(nearbyPlayerLevel + levelOffsetGlobal, levelMinGlobal,
  levelMaxGlobal)`, fed into `CT_Creatures_{Health,Armor}_Universal_Tier<N>`.
  **ESM-PROVEN**: the `Renorm_*` GLOB family and per-AV Curve Table
  attachment are directly observed. **INFERENCE**: the curve's implicit
  input axis is "Level" (no `Level` AVIF record exists) — standard
  Bethesda auto-calc-stats semantics, not provable from the plugin alone.
- **Resist Properties fall back RACE → NPC_, per-AV**, flat-wins on a
  tie — fully documented with worked examples at `extract-npcs.ts`.
- **`zzz`-prefix CURV rename**: a hide-from-CK-browser convention for a
  retired-but-live record; `extract-curvetables.ts` uses a leading `*`
  wildcard to catch it.
- **NPC-perk normalized-level adjustment**: a `crModNormalizedLevel*` PERK
  can Add/Set the level-scaling window independent of the RACE/NPC_ GLOBs —
  full mechanism at `extract-npcs.ts`'s `resolveNormalizedLevelAdjustment`.

### Epic creatures

- **Per-rank HP multiplier — ESM-PROVEN**: `QUST SQ_EpicCreatures` VMAD
  property `EpicRankData` — `HealthMult` 2.0/2.4/3.2/4.0/4.8 at ranks 1–5.
  Scales `hp` only — DR/ER untouched (`epic-creature.ts`).
- **Fixed epic rank for specific bosses** (SBQ, Storm Goliath — both rank
  3), via the summon quest's VMAD. **ESM-PROVEN**. **Earle/Wendigo Colossus
  checked exhaustively and does NOT get a rank** — a circulating informal
  claim to the contrary does not reproduce against a live query
  (`extract-npcs.ts`'s `BOSS_EPIC_RANK_QUESTS`).
- **Loot-list rank ≠ epic creature rank** (UC Titan, Head Hunt, Bigfoot) —
  detail tracked in `#52`.
- **Scorchbeast Queen HP**: the ~32k community figure is the game's OLD
  signed-int HP cap (widened ~2023), not an observed live HP — no
  per-nearby-player boss-HP scaling exists (myth). The ESM-derived value
  (curve HP × epic HealthMult) is authoritative — `epic-creature.ts`.

## Body parts (BPTD-extracted)
Engine: `scripts/extract/extract-bodyparts.ts`.

Per-enemy body-part multipliers are real ESM data (RACE → BPTD → per-part
Damage Mult). No pick = a custom multiplier input (default 1.5, standard
humanoid headshot).

- **`ctx.bodyPart` location is decoupled from the multiplier itself**: the
  `bodyPart` condition category derives from the picked part's BPTD
  `partType`, not the mult's sign — a torso-weakpoint enemy (Deathclaw
  belly ×1.35, `partType: Torso`) counts as BOTH torso and weakpoint
  (fixes Center Masochist on limb/armored-torso hits). **ASSUMPTION**
  (not ESM-proven): `Pelvis`-slot center/belly parts are deliberately NOT
  counted as torso, leaving those parts torso-gate-inactive until measured.
- **Body-part hit rate** (`bodyPartHitRatePct`, default 100%) — **Free Aim
  only**: each hit blends `rate×aimed-part + (1−rate)×torso`, independent
  of free-aim `hitRatePct`. VATS models a missed part as a miss (zero
  damage) via its own `vatsHitRatePct` slider instead.
- Crippled-limbs input caps at the picked race's distinct BPTD limb-AV
  count (10 when no race picked).
- **NoCripple** (zero limb damage) is hand-authored per curated target
  (Blue Devil, Bigfoot, Deathclaw Matriarch) — no BPTD flag encodes it.
- **EN06 Guardian's "torso is damage-immune until the shield breaks" phase
  gate is NOT modeled** — this is a steady-state calc with no phase
  scripting; exposing both parts is the closest approximation.
- Auto-receiver crit/sneak base MUL_ADDs are −20%. **USER-CONFIRMED** — the
  −30% applies to AttackDamage/DamageTypeValues instead, see **Formula
  structure**.

## Unique weapons
Rework basis: `WeaponsUniqueNamedList` FLST, base WEAP + `mod_Custom_*`
OMOD at `ap_customName` — full mechanism at `weapon-corrections.ts`. Legacy
standalone WEAP records are dead for everyone; their stats are stale and
must not be shown.

- **Still-live standalone uniques** (real FLST/grant refs): CombatRifle_Fixer,
  10mm_CircuitBreaker, MoM_BladeOfBastet, MoM_VoiceOfSet_44,
  BlackPowder_Rifle_Dragon. The Fancy Pump Action Shotgun/Revolver are
  script-granted quest rewards, not reworked uniques.
- **Deliberately note-only, no formula bucket** (extracted, badged `inert`,
  never wired): damage-TAKEN perks, `EnableAmmoSpenderOnKill`,
  `STAT_DeflectChance`, sneak/detection AVs, `RefractingProjectileChance`
  (V63 Laser Rifle), and self-delivery ENCH damage (Xerxos's
  `SelfRadDamage` — `enchantmentModifiers` gate keeps self-damage out of
  weapon output).
- **Blade of Bastet** (`mod_Description_MoM_BladeofBastet`): +50% armor pen
  (base `MoM_EyeOfRa` curve tier at X=0) via `armorPen` ADD;
  `scripts/extract/normalize/mgef.ts`. Eye of Ra doubling to +100% **ASSUMPTION,
  unmodeled** — needs armor loadout toggle for `MoMEyeOfRaItemKeyword`.
- **Daisy Cutter**: an 8-step `+20%` dbm ladder gated on
  `radResistAtLeast`, capping at +160% at 8000 — no armor model derives
  player Rad Resistance from gear, so it's a manual knob default 0. Full
  ladder: `src/types/modifiers.ts`.
- **Instance-only target keywords** (~24 unique `ap_customName` mods): the
  game applies a second target keyword at instance-creation via template
  combination — the shared eligibility predicate lets template membership
  bypass the keyword subset check (`omod-eligibility.ts`).
- **Cursed mods** (`ap_curse`, Nuka-World on Tour): real stat payloads on a
  cosmetic naming slot, no `ObjectTypeUnique` — own dedicated attach point
  (`omods.ts`).
- **Dom Pedro**: its Explosive muzzle mods' EXPL payload is hand-supplied
  (right paper number, explosive-only perk interactions aren't modeled).
- **The V.A.T.S. Unknown**: base OMOD SETs `VATSCriticalMultAdjustMin/Max`
  = 0.2/2.0 (unmapped AVs) — **USER-CONFIRMED** a random ×0.2–×2.0 roll on
  the additive crit-damage BONUS only. Hand-supplied via
  `omodModifierAdditions` as a `critDmgBonusScale` MUL_ADD 0.1 (mean of the
  roll), folded in `paper-damage.ts totalCritMult`. **ASSUMPTION**: modeled
  at the roll's mean (exact for expected DPS since the fold is linear);
  exact scaling target still wants an in-game measurement (`#72`). Full
  provenance for its five unreferenced legacy siblings:
  `omod-corrections.ts`.
- **Camden Whacker / Relic Reaper variant containers** (2026-08): both are
  zero-property OMODs whose `Includes` are all `Don't Use All` — the game
  rolls exactly one variant at grant time. `extract-omods.ts` now emits each
  include as its own record (`variantOf` back-pointer) instead of flattening
  the union; the container record itself is never emitted. **ASSUMPTION**:
  default/preset identity = lowest-formId variant (Bleed for Camden,
  CapCollector for Relic Reaper) — the ESM include struct has no chance
  field, so there's no data-backed "correct" default, only a stable one.
  **Known gap**: Camden's Poison/Fire/Radiation variants' `dotDamage` reads
  zero DPS impact today — `paper-damage.ts computeDotDps` only counts a DoT
  whose `damageTypeScope` matches one of the WEAPON's own base component
  types (Commie Whacker is ballistic-only), so a non-ballistic DoT from a
  unique mod is silently dropped by that same pre-existing convention for
  ANY weapon/unique pairing shaped this way, not something this split
  introduced. Bleed (ballistic-scoped) and Cryo/Energy (base-damage
  MUL_ADD conversion, a different mechanism entirely) are unaffected.
  Fixing the general gate is a separate, broader engine change (needs a
  variant's own DoT type to join the effective component set) — filed
  separately, not attempted here.
- **Overkill** (`mod_Custom_Overkill`, formId `0x00685530`): ADDs +5 to
  `KillStreakPerKillCount` AV (`0x00924E31`, DFOB-registered like
  `EnableKillStreak`) — streak maxes in two kills instead of ten. **No paper-
  DPS effect**: `killStreak` is an exogenous slider (`docs/adr/0009`) with no
  per-kill accrual model, so a rate change has no meaning to steady-state DPS.
  Code: `extract-omods.ts` ACTOR_VALUE_BUCKETS note. **Not** The Guarantee —
  that is `mod_Custom_TheGuarantee` (`0x008F0DCC`), already modeled via
  Demolition Expert on its identity OMOD.

## Armor effects (engine + UI)
UI/data flow, per-piece scaling shapes (flat vs self-scaling), and the
picker roster/grouping are documented at `src/data/armor-modifiers.ts`,
`docs/adr/0008`, and `docs/adr/0010` — not repeated here.

- **Unyielding threshold semantics** (**USER-CONFIRMED**, 2026-07-19): the
  extracted curve's near-vertical step points evaluate the +3/+2/+1
  SPECIAL tiers on a strict-`<` boundary, matching the current game build.
  An announced future patch flips the comparison to `<=` — when it ships,
  the step-eval convention needs revisiting, not just a data refresh.
- **Bruiser's/Ranger's overrides**: replace a broken ESM-extracted
  condition with the real mechanic — full per-condition rationale at
  `armor-values.ts`. (Battle-Loader's needed the same treatment until
  2026-08-17; its EP-199 branch now emits the final shape directly.)
- **Excluded** (`hiddenArmorOmodIds`): Overeater's (real DR/ER mechanic is
  incoming-scope, unextracted — `#49`) and Punishing (extracted modifiers
  are chase noise, not the real reflect-damage mechanic) — full detail
  `armor-corrections.ts`.
- **Limit-Breaking Armor is a sequential multiplier, not a bucket fold**:
  its `critConsumption` MUL_ADD must NOT fold through generic `foldOps`
  alongside Critical Savvy's SET — full derivation at `crit-meter.ts`.
- **ESM-PROVEN**: non-legendary piece reach is the plain union of piece
  tags across a name-group's ids/targetKeywords — tag vocabulary and
  derivation at `armor-modifiers.ts`; no specific-beats-generic tie-break
  (Muffled is genuinely arm-capable on BOS Infantry/Robot sets —
  `docs/adr/0010`). Legendary-slot effects keep max 5 as a shared budget
  per star tier — `docs/adr/0004`.
- **USER-CONFIRMED**: piece capacities are body armor torso 1 / arms 2 /
  legs 2 (5 mod-bearing pieces, no helmet slot for these mods) and PA +
  helmet 1 — `armor-modifiers.ts`; the ESM has no armor-slot topology
  record to extract this from.
- **ASSUMPTION**: underarmor (style + functional lining) is worn under
  BOTH body armor and power armor with effects active — no ESM condition
  or keyword distinguishes; none of the 14 underarmor-family records
  carries a PA-gated modifier (`armorType: 'both'`).
- **Power-armor-exclusive gating is app-supplied**: armor OMODs whose
  attach point starts with `ap_PowerArmor*` receive an `{kind:
  'inPowerArmor'}` condition at extraction — not an ESM condition; general
  rule documented at `extract-omods.ts`. Legendary-slot mods
  (`ap_LegendaryN`) don't carry a PA-specific attach point even when
  PA-exclusive, so this rule can't catch them — **Propelling** is a single
  verified override keyed off its COBJ's PA-workbench restriction, not a
  general rule (the `ma_PowerArmorMod` keyword it shares is common to
  thousands of dual-availability records) — full verification:
  `overrides/armor-values.ts`. Roster-side armor-type classification is
  separate from this modifier gating and derives from record presence per
  name, COBJ-verified — `docs/adr/0010`.

## Part B — Deliberate non-modeling & cross-cutting rationale

What the engine intentionally does NOT model (and why), plus extraction/pipeline mechanism explanations that span multiple records or files rather than asserting one unproven claim.

## OMOD eligibility & recipe chains
Engine: `cobj-index.ts`, `isEligible` (`src/data/omods.ts`).

- **A COBJ cannot name a target weapon** — per-weapon gating lives entirely
  in the OMOD. "Recipe exists" (`hasGrantingCobj`) is a diagnostic, never
  an eligibility input.
- **`Learn Recipe From` is polymorphic by `Learn Method`** (plan BOOK /
  explicit scrap source / NOCRAFT dummy stub). `Repair Method 5` is NOT a
  NOCRAFT marker.
- **Mod boxes substitute for recipe knowledge** (**user-clarified**): a
  NOCRAFT-dummy COBJ's mod can still be player-slottable via a matching
  loose-mod/mod-box item — `hasGrantingCobj: false` is correct for these.
- **Picker eligibility**: attach point must be on the weapon;
  keyword-scoped mods use the game's own subset gate; **empty-keyword mods
  match NOTHING by default** — they're offered only via template
  whitelisting or an explicit rescue entry.
- **Picker display policy** (**user decision**): show ALL valid+obtainable
  mods, including zero-DPS ones, badged `inert` rather than hidden. Two
  curated exceptions excluded wholesale (`DEAD_MECHANIC_SLOT_EDIDS`): a
  removed mechanic and pure cosmetic reskins.
- **Weak-evidence review** (**user decision**: flag, never auto-hide): a
  standard-slot mod whose only proof is riding along on its weapon lands
  in `_meta.json reviewFlagged.omodWeakEvidence`.

## Attach-point closure
Engine: `ap-grant-index.ts`, `applyAttachPointClosure`.

A WEAP's own `"Attach Parent Slots"` lists only the bare-frame points —
most real slots are granted through *installed mods'* own `Attach Parent
Slots`. Copying the WEAP field verbatim silently dropped whole slot
families on 136 of 282 weapons.

- `weapons.json.attachParentSlots` is a **fixpoint closure**: seed = WEAP's
  own slots ∪ each default/template mod's own attach point ∪ the slots
  those mods grant, iterated until stable. Eligibility during iteration is
  the shared picker predicate (`omod-eligibility.ts`).
- **The paper model wants the union over all reachable mod configurations**
  — per-configuration availability is deliberately out of scope.
- **Contributor gate is structural only** (dev/junk prefixes, non-weapon
  mods) — full OMOD obtainability can't gate here (circular). Accepted
  residual risk: a real-Name, non-junk but actually-unreleased donor mod
  could open a slot.
- Over-generation is structurally inert: `buildSlots` is OMOD-driven, not
  AP-driven.

## Armor extraction pipeline
Engine: `extract-omods.ts`, `conditions.ts`. Armor/PA OMODs share the same
OMOD record type as weapon mods, gated by `Data."Form Type"`; the
`Properties[].Property` enum, `GetIsPlayer` tab-index-2 inversion, and
`WornApparelHasKeywordCount` → `wornPieceCount` translation are all
ESM-proven and documented at their respective extraction sites.

- Battle-Loader's PERK entry point 199 emits a boolean trigger placeholder,
  not the real 15/30/45/60/75% chance (that lives in each tier's own
  `GetRandomPercent` row) — `mgef.ts` special-cases this into
  `reloadSkipChanceBash`, dropping the consumed roll and the unmodeled
  sanity rows so the modifier isn't born inert (the same shape EP-172 and
  EP-198 use) — see **Armor**.
- `extract-armor.ts` is grounding-only: `{id, formId, name, obtainable}`
  per ARMO record, feeding armor-OMOD obtainability. No resistances, no
  mod slots — later Phase 3 scope.

## Deliberate non-modeling
- **Follow Through / Taking One for the Team** extract with empty
  `modifiers` (the chain to hidden debuff/companion perks isn't followed)
  but are not inert — see the manual toggle in **Hand-supplied values**.
  Taking One for the Team's DR debuff IS modeled via `armorPenFlat` — see
  **Resist mitigation**.
- **Limb targeting** is deferred by plan.
- **Mod Incoming Weapon Damage self-targeted sources**: every current-dump
  occurrence (`Mutation_EmpathPenalty_Perk`, `UnstoppableMonster_Perk`,
  `Legendary_Armor_Heavyweight`, `BOUNTY_Legendary_Armor_LucidPerk`,
  `PA_EmergencyProtocols`) fires directly on the perk holder — genuinely
  incoming/defensive, correctly stays "not modeled" (no player-defense
  model exists), now extracted to an inert `incomingDamageMult` bucket
  rather than dropped as `unresolved`. Distinct from Follow Through /
  Taking One for the Team, which redirect the same Entry Point to the
  struck actor — the offensive, `wholeDamage`-modeled half. Full FormID
  provenance and the routing rule for a future target-redirected
  occurrence: `normalize/mgef.ts`.
- SPECIAL-scaled perk entry points ("Add Actor Value Mult") resolve via the
  `scaledBy` mechanism when the entry point's actor value maps to a known
  player-stat axis in `CURVE_INPUT_AVS` (`scripts/extract/normalize/mgef.ts`);
  only entry points referencing an unmapped AV are still skipped and noted
  per-perk.
- **Stimpak Healing units** — `STAT_HealMultStimpak`'s AVIF carries a
  "Percentage (Scale By 100 In UI)" flag suggesting a stored fraction, but
  every observed ESM magnitude (bobblehead +30, FirstAidBonus curve Y range
  10–100) is a percent-point integer and the game's tooltip token appends a
  literal "%" — modeled as percent points, with the ×0.01 conversion at the
  Medical Malpractice consumer (perk Float 0.01), not at the grant side
  (`FALLBACK_AVIF_ROUTES` `STAT_HealMultStimpak` row in `mgef.ts`).
- **Hacking Skill** — `hackingSkill` is modeled end-to-end (folded,
  threaded, `hasEngineEffect: true`) but has no current consumer; ENCH
  `ench_IntFromHacking` (`0x0091A081`, orphan in the 20260803 dump) is the
  likely future consumer if a hacking-scaled unique ships.
- **Stimpak base-heal unit** — USER-CONFIRMED (2026-08-06): the
  `StimpakRestoreHealth` MGEF (`0x0021DDB8`, Archetype `Stimpak` on AV
  `Health`) has no GMST/curve/AVIF flag stating whether its magnitude is
  flat HP or % of max HP per second — the ESM proves only the per-leg
  numbers (`extract-healing.ts`: Stimpak `[2,20]+[10,2]`, Super exactly 2×,
  Diluted exactly 0.5×, both legs firing concurrently from t=0, no
  sequencing field). Modeled as % of max HP/sec on the project owner's call.
  `stimpakHealMagMult`/`stimpakHealDurationMult` (`src/types/modifiers.ts`)
  are the Field-Surgeon/Doctor's-3★/Healing-Factor-penalty multiplier
  buckets that scale a leg's magnitude/duration independently
  (`src/lib/healing.ts` `resolveStimpakHealing` combines them); no DPS
  consumer yet, same posture as Hacking Skill above.
- A handful of `cr`-prefixed creature/event DoT curves (non-level domain)
  and a few niche unique-mod curves remain unmapped: Eat The Rich
  (NPC-only, not player-obtainable), PA battery drain (no DPS/AP/HP
  impact).
- **CLOSED** (issue #46, 2026-08-19): **Bloody Mess** correctly extracts
  `ranks: [[],[],[]]` (maxRank 1 — 02/03 are cut, not a joining bug). PCRD
  `BloodyMessCard` 0x00073680 lists only rank 1 (`BloodyMess01`
  0x0004A0BB). The mechanic is script-side, not a weapon-damage dbm: MGEF
  `PerkBloodyMessEffect` 0x003C9B9B (Script archetype) → VMAD
  `BloodyMessNearbyScript` → `EXPL ExplosionBloodyMessNearby` 0x001F418C
  (own `CT_Player_Damage_Universal_Tier40` curve), chance from `CURV
  BloodyMessChanceBonus` 0x0084339D (LCK-scaled) — an on-kill AoE
  explosion of bleeding enemies, no formula-bucket effect to extract.
- **CLOSED** (issue #46, 2026-08-19): **BonusDamage x4/x5/x6** raw-ESM
  names (`Burn_Bounty_mod_Custom_ExtraDamage*` 0x0083BD87/0x0083E0F2/
  0x0083F270/0x0083BD89/0x008A5E5F) are live, enemy-NPC Bounty Hunter
  event gear (script-equipped) with zero reverse refs — not player-facing,
  `obtainable: false` is correct. x5 and x6 are byte-identical (`ADD 5.0`
  each) — a genuine ESM copy-paste duplicate, not an extractor bug.
- **Ammo Health (battery/core Health)** — **CLOSED** (issue #46,
  2026-08-19; mechanic corrected 2026-08-20 per user in-game confirmation):
  Entry Point 125 "Mod Ammo Health Mult" is a multiplier on the max
  condition Health of the equipped battery/core ammo item (Fusion Core /
  Plasma Cartridge). Each shot still costs exactly 1 Health, so more max
  Health means more shots fired before the core is expended — an effective
  magazine-capacity increase for core-based weapons, not a change to the
  per-shot cost itself. This matches the granting ENCH's own name
  (`enchMod_Weapon_AmmoCapacity_PlasmaCoreHealth_Tier1/2`
  0x0091B688/0x007B23C8) directly. Reaches this extractor through the exact
  same magazine-mod chase the issue's "no extractable number" claim was
  about (`mod_10mm_Magazine_Ammo` 0x0005E9DB,
  `mod_GatlingGun_Magazine_ExtraLarge` 0x00011C01 → Include
  `_PARENT_mod_WEAPON_GENERIC_AmmoCapacity_Tier1/2` 0x0052440F/0x00524410
  → the ENCH above → Script MGEF → "Perk to Apply" → this entry point,
  Float 0.5). Three independent direct-PERK sources corroborate the
  mechanic and its weapon scope: Power User (`PowerUser01-03`
  0x0027A873/74/75, card text "Fusion Cores now last 30/60/100% longer" —
  itself a shots-before-empty framing, Float 0.3/0.6/1.0), the Repair
  Bobblehead (`Bobblehead_RepairPerk`), and Tesla Science Magazine #4 — all
  three gate this SAME entry point on `WornHasKeyword(ma_GatlingLaser |
  ma_Ultracite_GatlingLaser)` and grant it ALONGSIDE a sibling MGEF
  reducing "PA Battery Damage Rate" (a separate Power-Armor
  fusion-core-drain mechanic, not this one). Extracted to its own
  `ammoHealthMult` bucket (`hasEngineEffect: false`, `ENTRY_POINT_BUCKETS`
  in `normalize/mgef.ts`) rather than folded into `ammoCapacity` — the
  "GENERIC" magazine-mod template this chain lives on is shared by every
  standard-ammo weapon's Large Magazine family (10mm Pistol, ballistic
  Gatling Gun, Combat Rifle, Hunting Rifle, …), and those weapons don't
  track a Health-based ammo pool at all, so the entry point is a genuine
  no-op for them there — folding it into `ammoCapacity` unconditionally
  would double-count against the ALREADY-correct direct `AmmoCapacity`
  OMOD-property fold present on the exact same records.

  **Wired into effective capacity 2026-08-20** (user-confirmed: "plasma/
  fusion core max base health can be obtained from AMMO records... with
  Power User 3 you can get 1000 gatling laser ammo with a full health
  fusion core"). AMMO `AmmoFusionCore` 0x00075FE4 (shared by both Gatling
  Laser 0x000E27BC and Ultracite Gatling Laser 0x002EF66E — no separate
  Ultracite core exists) carries `DNAM/Health = 500`, and both weapons'
  own `weapon.capacity` is independently extracted as 500 — the AMMO
  record's Health field and `weapon.capacity` are the same "shots per
  core" quantity 1:1, so no new core-weapon concept was needed: 500 ×
  (1 + 1.0 from Power User 3) = 1000 exactly, confirming the arithmetic.
  The Power User/Repair Bobblehead OR-group above previously fell to
  `unresolved` because `isWeaponTypeKeyword` (`normalize/conditions.ts`)
  didn't recognize `ma_GatlingLaser`/`ma_Ultracite_GatlingLaser` as
  weapon-identity keywords — widened to include exactly those two EDIDs
  (not a blanket `ma_` prefix; other `ma_` keywords are armor-material
  gates, a different Function), which resolves the OR-group to a real
  `weaponKeywordAny` condition instead. `effective-weapon.ts`'s capacity
  fold now additionally admits `ammoHealthMult` modifiers carrying a
  `weaponKeywordAny` gate that includes `ma_GatlingLaser` — relabeled to
  `ammoCapacity` and folded alongside the weapon's own OMOD capacity —
  which can never reach the ungated magazine-mod GENERIC-template
  instance (still correctly inert) or the unrelated, also-ungated
  `Legendary_AmmoCapacityx4Perk` (0x0072F409, ADD 3 — an NPC/hidden-only
  effect with no weapon gate at all, unaudited, unaffected either way).
  Tesla Science Magazine #4's variant of the same entry point is a
  THREE-way OR mixing `ArmorTypePower` in with the two weapon keywords —
  a different shape `weaponKeywordAny` can't represent (it's "worn armor
  type OR weapon keyword", not a pure weapon-keyword OR-group) — still
  correctly `unresolved`, left as a known follow-up. Full doc comment:
  `src/types/modifiers.ts`'s `ammoHealthMult` Bucket entry.

## Bash-triggered buff uptime

Love Tap (`E09C_mod_Custom_LoveTap`, PERK `LoveTapPerk` 0x008F2AEB, EP173
"Apply Combat Melee Spell": "Bashing Grants +30% Damage for 30 Seconds")
grants its `dbm` bonus through a combat-triggered Function-Type-5 Spell
Item chase (issue #42's proc-damage machinery, `chaseGrantedSpell`) —
e93dcc6 (2026-08-19) correctly gated this behind the generic `unresolved`
timedBuff marker rather than folding it unconditionally, since no
bash-frequency model existed. **User-directed 2026-08-20**: rather than
leave it permanently unmodeled, a manual `PlayerInput.onBashBuffUptime`
knob (0–100%, default 0 — an honest zero, same ADR-0009 exogenous-knob
precedent as `procCripplesPerMin`) lets the player state the uptime they
intend to sustain by bashing on cooldown. `resolve.ts`'s `bashBuffUptime`
condition scales the dbm value by that fraction directly; the paired
`bashUptimeDowntimeFraction` derives bashesPerMinute = 60 ×
(uptime/100) / buffDurationSec and reuses `battleLoadersBashSec` (the
existing Battle-Loader's bash-time knob, `sustain.ts`) as the per-bash
time cost, reducing `sustainedDps` only (never `burstDps`) by
uptimeFraction × bashAnimationSec / durationSec — the same "downtime,
sustained-only" convention reload time already uses. Scoped narrowly to
EP173 specifically (`MgefTranslationDeps.bashTriggered`, set only when
the granting perk's entry-point name is literally "Apply Combat Melee
Spell") — Holy Fire's buff (`mod_custom_HolyFire_Effect`, EP184 "Apply
Friendly Hit Spell") triggers on trigger-pull/hit rather than strictly on
bash (user-clarified 2026-08-20) and is a support/healing-oriented effect
whose dbm/DR terms don't need modeling here, so it stays on the generic
`unresolved` gate untouched; its separate `dotDamage` fire modifier
(Contact-delivered, unconditional) is a distinct on-hit burn, not part of
this timed buff, and is unaffected either way. NOT a generalized
combat-trigger-uptime model — a future bash/hit/kill/cripple-triggered
timed buff needs its own scoping decision, not an automatic opt-in.
