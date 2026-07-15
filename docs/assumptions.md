# Damage Engine Assumptions

Everything the calculator asserts that is not directly proven by ESM data.
Each item should eventually be confirmed or corrected by an in-game golden
measurement (`src/lib/engine/__tests__/golden/`).

## Formula structure (user spec, engine: `src/lib/engine/paper-damage.ts`)

```
PaperDamage = Σ_components base(c) × ( dbmFold(c) + Tenderizer + (CritMult−1)[crit]
              + (SneakMult−1)[sneak, non-explosive] + PowerAttackBonus + STR term[melee] )
              × Π wholeDamage × BodyPartMult[non-explosive] × (1 + weakpointBonus)[BodyPartMult>1, non-explosive]
              × PowerAttackRaceMult[melee power attack]
```

Explosive components (launcher `fromExplosion` payloads and Explosive-legendary
twins) are carved out of the sneak term and both body-part factors (2026-07-14,
user spec): an explosive payload lands its flat damage on whatever part it
strikes rather than a targeted shot, and isn't a stealth attack. It still
scales with dbm, crit, power-attack, and whole-damage multipliers. See
"Launcher explosion damage" below.

- **Bucket fold** (`resolve.ts`), user-confirmed:
  `result = (last SET ?? base) + (Σ MUL_ADD) × base + Σ ADD`.
  Multiple MUL_ADDs stack additively with each other, and MUL_ADD always
  multiplies the ORIGINAL base — even when a SET replaced it (Speed base 2.0
  with SET 0.8248 / MUL_ADD 0.3 / ADD 0.5 → 0.8248 + 0.6 + 0.5 = 1.9248).
- **Curve tables override hardcoded values**: any OMOD property or MGEF effect
  carrying a curve table ignores its flat value. OMOD-property curves
  (`extract-omods.ts`) always default their input to `itemLevel` — never
  dropped. MGEF/ENCH effect curves (`normalize/mgef.ts`) need a resolvable
  input axis (an Actor Value the engine can read); an unresolvable one drops
  the whole modifier with a `_meta.json` note, EXCEPT a curve with no Actor
  Value at all (`curveInputAv: null`) whose X domain looks level-shaped
  (≤100) also defaults to `itemLevel` (2026-07-13 — see "Value curves" below).
  Remaining drops (~9 records, `_meta.json`) are genuinely unmodeled axes:
  a handful of `cr`-prefixed creature/event DoTs with a non-level domain
  (X up to 540+), a lockpicking-tier gimmick mod, a caps-scaled hidden mod,
  and PA battery drain (non-damage).
- `DamageTypeValues` on dtPhysical ≡ `AttackDamage` (both phys-only; the
  former is rare).
- **Base-damage scaling** (`baseDamage` bucket): `AttackDamage` and
  `DamageTypeValues` MUL_ADDs on OMODs multiply the component's BASE damage
  before the dbm parenthesis (user-confirmed). Automatic receivers: −30% on
  the physical component and each damage type. Verified golden: Fixer +
  Powerful Automatic Receiver = 103 × 0.7 × 1.25 = 90.125.
- **Classification caveat**: the ESM plumbing (`STAT_DamagePerk` et al.)
  informs bucket routing, but the game exe may diverge — per user instruction,
  confirm additive-vs-multiplicative classifications with the user for
  everything EXCEPT "Mod Weapon DMG Bonus Mult" (always additive).
- **Crit/sneak composition**: weapon base mult adjusted by MUL_ADD/SET OMODs
  first, then additive bonuses stack (e.g. automatic receivers MUL_ADD −0.2 on
  both crit and sneak base). Per user spec; ESM-consistent.
- **Weakpoint bonus** multiplies whole damage and only activates when the
  body-part multiplier exceeds 1.0 (confirmed: "Mod Weak Body Part Damage
  Mult | Multiply 1 + AV×0.01" in `STAT_DamagePerk`).
- **STR melee scaling**: STR/20 for 1h/2h melee, STR/10 for unarmed (user spec).
- **Body-part multiplier** is a user input (default ×2.0). Per-enemy BPTD
  extraction is deferred (paper-damage v1).
- **Explosive damage is exempt from sneak and body-part multipliers**
  (2026-07-14, user spec): explosive components (`isExplosion`/`fromExplosion`
  payloads and Explosive-legendary twins) skip `(SneakMult−1)` and both
  `BodyPartMult` and `weakpointBonus` — it deals its flat payload to whichever
  part it strikes and is never a sneak attack. Crit, power-attack, and
  whole-damage multipliers still apply. `src/lib/engine/paper-damage.ts`'s
  `explosiveOuterMult` implements the body-part carve-out; the breakdown UI
  (`MultiplierChainTable.tsx`) hides/qualifies the shared sneak/body-part rows
  on a weapon that has any explosive component so the panel keeps reconciling.
- **DoT is exempt from sneak, crit, AND body-part/weakpoint multipliers**
  (2026-07-14, user spec) — a stricter carve-out than explosive damage above
  (which keeps crit). `computeDotDps` (`paper-damage.ts`) folds only the
  `dotDamage` bucket into a flat steady-state dmg/sec line
  (`ScenarioResult.dotDps`), entirely outside the paper-damage formula above:
  it never enters the `(CritMult−1)`/`(SneakMult−1)` parenthesis or the
  `BodyPartMult`/`weakpointBonus` outer factors, and its signature doesn't
  even accept a body part. This is structural (not a per-component flag like
  `isExplosion`) and is pinned by invariance tests in `engine.test.ts`. See
  "Weapon-intrinsic DoT & OMOD replacement" below.

## Base damage & components

- Per-component damage = that component's inlined level curve evaluated at
  min(itemLevel, levelCap); levelCap = max Eligible Level.
  Confirmed: Fixer tier-24 y(50)=103.
- A physical component exists IFF the weapon has a main `Damage Curve`
  (user-confirmed) — regardless of the legacy `Base Damage` field. All plasma
  weapons deal phys + energy (Gatling Plasma 28+28 despite Base Damage 0);
  Laser/Flamer have no main curve → typed damage only. Shishkebab dual
  full-curve validated by golden: (64×1.75)×2 = 224 at its level-45 cap.
- Item level clamps to the weapon's max Eligible Level (Shishkebab 45 — a
  "level 50" variant would give 252; confirm no such drop exists in-game).
- Thrown explosives (grenades, mines) stay excluded per the 2026-07-12
  vetting-scope decision (launchers, not throwables); flagged
  `projectileOnly` in `_meta.json`. Launchers are covered below.

## Launcher explosion damage (2026-07-13 — `chaseExplosion`, extract-weapons.ts)

Explosive launchers carry a token WEAP `Base Damage` (Fat Man 5, M79 3); the
real payload rides the projectile's explosion. ESM-proven chain: WEAP
`RGW3."Override Projectile"` (M79/Cremator/Hellstorm) ?? AMMO(`Data.Ammo`)
`.DNAM.Projectile` → PROJ `Data.Explosion` → EXPL `Data`.

- **Gate**: the PROJ `Data.Flags` "Explosion" bit. Several projectiles carry a
  stale Explosion formid that never detonates — ProjectilePlasmaLarge points
  at the missile-shell EXPL (968 @50) without the flag; chasing unflagged
  projectiles would give every plasma weapon phantom missile damage.
- **EXPL damage mirrors the WEAP shape**: main "Damage Curve Table" → an
  `explosive` component; typed "Damage Types" entries → elemental components
  (Cremator's fire ball tier 13; Gamma Gun's radiation + energy tier 18).
  All are flagged `fromExplosion`.
- **WEAP + EXPL sum per shot** (ASSUMPTION, not ESM-proven): the engine adds
  the token impact damage and the explosion (Fat Man @45 cap: 5 + 1386;
  Hellstorm: WEAP tier-46 curve 379 + EXPL tier-46 curve 379 = 758 — its two
  halves are authored separately). Whether the in-game Pip-Boy card shows the
  sum needs the pending golden-case measurements (cases.json: Fat Man,
  Missile Launcher).
- **EXPL "Base Weapon Damage Mult"** (Gauss family 0.15, Tesla Cannon 0.10):
  fraction of the weapon's own damage dealt again as explosion — modeled as
  the intrinsic BASE of the `explosivePayload` twin fold, so the Explosive 2★
  legendary (+0.2) ADDs on top (additive stacking is an ASSUMPTION; the AV
  fold shape supports it but no in-game measurement yet).
- **Explosion bonuses are ADDITIVE dbm (June 2026 patch, user-reported
  2026-07-13)**: Demolition Expert's STAT_DmgExplosive AV (magnitudes
  20/40/60, scale 0.01 — previously an unmapped-AVIF gap that left the perk
  with zero modifiers) and the 'Mod Player Explosion Damage' entry point
  (SCAV! magazine) route to `dbm` with a `damageTypeScope ['explosive']`
  condition. They fold in the same parenthesis as Bloodied/Adrenal etc.:
  0.9 + 0.5 + 0.6 → ×3.0, NOT the pre-patch (1+0.9+0.5)×(1+0.6) = ×3.84.
  The old separate-multiplier `explosionMult` bucket was removed with this
  change. The 'explosive' scope matches `fromExplosion` components
  regardless of their elemental type
  (`ResolveContext.componentIsExplosion`, resolve.ts) — explosion damage
  keeps its element for future enemy-resist routing while still counting as
  an explosion for perk scoping.
- **Flat-amount components** (no tier, no curve — the token launcher impact
  values) adapt to a constant one-point curve (`src/data/live/weapons.ts`);
  the old tier -1 lookup warned and computed 0.
- **Not modeled**: OMOD projectile overrides swapping the explosion (Fat Man
  MIRV's extra projectiles ride `projectileCount`, but a mod pointing at a
  DIFFERENT EXPL record would keep the base explosion's numbers); explosion
  radius/AoE (Grenadier extracts nothing damage-relevant); self-damage.
- Gamma Gun graduated from the `noDamage` excluded bucket (its only damage is
  the explosion); the toy/NPC records the chase also rescued
  (ToyFireworkLauncher_*, artillery, orbital strike) stay hidden via
  obtainability or `hiddenWeaponIds`.
- **Sneak and body-part multipliers do not apply** (2026-07-14, user spec):
  `fromExplosion` components skip the sneak term and both `BodyPartMult` and
  `weakpointBonus` in `computePaperDamage` — an AoE payload lands on whatever
  part it strikes rather than a targeted/stealth shot. Crit, power-attack, and
  whole-damage multipliers are unaffected. Same carve-out applies to the
  `explosivePayload` twin (Explosive 2★) below.

## Weapon-intrinsic DoT & OMOD replacement (2026-07-14 — `chaseWeaponEnchantment`/`translateEnchantment`, `computeDotDps`)

Some weapons carry their own on-hit damage-over-time effect directly on the
WEAP record's `Enchantment` field (distinct from an OMOD's `Enchantments`
property) — Cremator's built-in fire DoT, bladed melee weapons' innate bleed
(Machete, Tomahawk, Throwing Knife, ChineseOfficerSword, MeatCleaver, Sickle,
WarGlaive/Oathbreaker, GuitarSword, HogSplitter, CultistBlade,
RevolutionarySword, GrognakAxe, UltraciteTerrorSword, MTR05_MeteoriteSword,
MTNS04_NailerSword, ...), Shishkebab's burn+bleed, HarpoonGun's bleed. This was
entirely unchased before 2026-07-14 (extract-weapons.ts never read
`WEAP.Enchantment` at all).

- **Chase**: `chaseWeaponEnchantment` (extract-weapons.ts) reads the WEAP's own
  `Enchantment` field and walks it through `translateEnchantment`
  (normalize/mgef.ts) — the same MGEF translation OMOD `Enchantments`
  properties use. Gated to Contact-delivery (`Effect Data."Target Type"` =
  "Contact") — every WEAP.Enchantment reference in the 20260710 dump (29
  distinct ENCHs across 50 weapons) is Contact/Fire-and-Forget; a
  Self-delivery weapon enchantment would be a permanent stat buff and is
  deliberately out of scope. Materialized onto `GeneratedWeapon.modifiers`
  (always present, empty by default), sourced `kind: 'weapon'`
  (`src/types/modifiers.ts`).
- **GetIsPlayer inversion for Contact-delivery effects**: a Contact/Fire-and-
  Forget ENCH or SPEL's Effects apply to the STRUCK TARGET (`Run On:
  Subject` in the ESM, verified on Cremator's own ench and every bleed ench
  sampled), not the wielder. `GetIsPlayer(Subject)` rows therefore split an
  NPC-target branch (`=0`, the PvE case this calculator always models) from a
  PVP-only player-target branch (`=1`) — the OPPOSITE of every OTHER
  GetIsPlayer reading in this codebase (perk/legendary self-gates, where
  `=1` means "granted to the player" and is unconditionally consumed).
  `conditions.ts`'s `subjectIsTarget` context flag (set by
  `translateEnchantment` when the record's own Delivery is Contact) flips
  just that one case; every other caller (perk effects, granted-ability
  chases) is unaffected. Before this fix, the NPC branch of every
  Contact-delivery on-hit DoT ench was wrongly marked `'inactive'` (dropped
  entirely) while a same-record PVP-only branch (when present) was wrongly
  treated as unconditionally active — Cremator's Slow-Burner receiver showed a
  flat 3-damage/6s fire DoT in `omods.json` (that record's PVP branch) instead
  of its real tier-17 curve/12s NPC DoT, and HarpoonGun-family bleed enchants
  extracted ZERO modifiers at all (their sole branch is NPC-only, so the old
  code marked the whole effect inactive). `GetIsPlayerGhoul` was NOT touched —
  no co-occurrence with this pattern was found in the dump; revisit if one
  appears.
- **OMOD REM of an Enchantments property is now skipped, not walked**
  (extract-omods.ts): the OMOD `Enchantments` property carries three
  functionTypes (ADD/SET/REM) with NO functionType check previously — a REM
  (an OMOD removing the base weapon's own ench, e.g. Slow-Burner REMs
  Cremator's `CrematorFXEnchFireHit`) was walked exactly like an ADD, which is
  how the Slow-Burner's wrong 3/6s entry came from the REM'd base ench's own
  PVP branch. REM now emits a `removes enchantment <edid>` note instead.
- **Replacement semantics**: an OMOD that REMs the base weapon's ench and ADDs
  its own (Cremator + Slow-Burner) needs its own dotDamage contribution to
  REPLACE the weapon-intrinsic one, not stack with it — the in-game mechanic
  is exclusive (one chemical-type receiver at a time). `computeDotDps`
  (paper-damage.ts) folds every `kind: 'weapon'`-sourced `dotDamage` modifier
  FIRST, on its own, to derive an intrinsic per-damage-type BASE; every OTHER
  (OMOD/perk) `dotDamage` modifier then folds ON TOP of that base via a
  SEPARATE `foldBucket` call — mirroring the base-vs-modifier split
  `effective-weapon.ts` already uses for weapon-stat rewrites (Speed, reload,
  ...), applied here because `dotDamage` has no intrinsic weapon FIELD of its
  own to hold the base. Consequence: a plain OMOD **ADD** stacks with the
  intrinsic base (HarpoonGun's own bleed + the Barbed Harpoon magazine's
  additional bleed both apply, matching two independent ENCHs on record), while
  a **SET** replaces it outright (`overrides/legendary-values.ts`'s
  `mod_Cremator_Reciever_SlowBurner` entry flips the OMOD's extracted ADD to
  SET for exactly this reason) — verified that a SET only overrides the
  `foldBucket` call's `base` argument, not sibling ADD entries within the SAME
  fold, so it cannot wipe an unrelated same-type dotDamage source stacked
  alongside it (each weapon/component-type pair is its own `foldBucket` call
  in the first place, so cross-weapon interference isn't possible either).
- **`durationSec` remains inert** (`Modifier.durationSec` — "carried for the
  future DoT model, unused by the engine"): the weapon-intrinsic and
  OMOD-level fixes above don't change the existing refresh-only
  magnitude-as-dps convention; only the op (ADD vs SET) and condition
  (subjectIsTarget) semantics changed.

## OMOD-chased launcher payloads (2026-07-14 — `overrideProjectileModifiers`, extract-omods.ts)

Some weapon OMODs carry an `OverrideProjectile` property (154 in the
20260710 dump) that swaps the fired projectile for a different one — the
overwhelming majority are cosmetic (suppressors, focusers) whose PROJ/EXPL
carry no damage, but two convert a beam weapon into a lobbed-explosive
barrel: the Lightning Gun's Lobber Barrel and the Cryolator's Polar Lobber
Barrel. Both previously extracted zero damage-relevant modifiers (the property
was in `PROPERTY_IGNORED`).

- **Chase**: PROJ (gated on the `Data.Flags` "Explosion" bit, same gate
  `chaseExplosion` uses for WEAP-level launchers — the Destructible-stage
  Explosion field is a shot-down fallback and must never be chased) → EXPL's
  own direct damage (main curve / flat `Damage` / typed `Damage Types`) —
  shared field-decoding (`decodeExplosionDamage`, `normalize/explosion.ts`)
  with `chaseExplosion` so the two callers don't duplicate the EXPL shape.
  PLUS a NEW hop this OMOD chase adds: EXPL `Data."Placed Object"` → HAZD →
  HAZD `Data.Effect` (a SPEL, not an ENCH — same "Effects" list shape,
  `translateEnchantment` is signature-agnostic) → Damage-archetype MGEF
  magnitude/curve/damage-type, exactly like any other Damage-archetype
  translation (the damage TYPE is derived automatically from the MGEF's own
  `Resist Value` AV, same `RESIST_AV_DAMAGE_TYPES` lookup every other DoT
  uses — no new type-inference code needed: the Lobber's hazard resolves
  `EnergyResist` → energy, the Polar Lobber's resolves `FrostResist` → cryo).
- **Materialization**: EXPL's own direct typed damage → `baseDamage` ADD
  (itemLevel curve, damage-type-scoped) — an instant, dbm-scaled hit, same
  shape as any `DamageTypeValues` property (Polar Lobber's cryo impact, tier
  40, 86@lvl1–285@lvl50). The HAZD's own tick damage → `dotDamage` (NOT
  `baseDamage`) — a deliberate bucket choice, not just a SET-collision
  workaround: a HAZD tick is a lingering, non-instant field, semantically the
  SAME "refresh-only, magnitude=dps" DoT convention used everywhere else
  (see the section above), so `dotDamage` is the honest bucket regardless of
  whether it would also avoid colliding with the Lobber's existing
  `baseDamage SET 0` energy-scoped modifier (which zeros the Lightning Gun's
  normal beam when this barrel is equipped) — landing the hazard in a
  SEPARATE bucket (`dotDamage`) sidesteps that question entirely rather than
  relying on `foldOps`' SET-only-overrides-`base` behavior to save it.
  `durationSec` on the resulting modifier is overridden with the HAZD's own
  `Data.Lifetime` (how long the lingering field persists — 7s Lobber, 6s
  Polar Lobber) rather than the SPEL's own per-tick Effect Item Data duration
  (1s Lobber, 12s Polar Lobber); inert metadata either way today.
- **Direct EXPL damage is gated on a "Placed Object" (HAZD) hop also
  existing** — found 2026-07-14 while validating the fix: Cremator's
  flame-color Receiver mods (Chemical_BlueFire/GreenFire/PinkFire) EACH carry
  their own `OverrideProjectile` SET pointing at a re-skinned
  "ExplosionCrematorFireball_&lt;Color&gt;" EXPL with the SAME typed fire
  damage (tier 13, 10@lvl1–32@lvl50) as Cremator's own on-hit Enchantment —
  purely a VFX re-skin (Cremator's chemical colors are cosmetic in-game; the
  RedFire/default color's own EXPL carries zero damage) that would otherwise
  silently ADD an extra ~10-32 fire hit for 3 of the weapon's 4 color choices
  only, on top of the correctly-modeled weapon-intrinsic DoT (the "Fix 1"
  section above). Every non-cosmetic OverrideProjectile OMOD chased so far
  (Lobber, Polar Lobber) pairs its direct EXPL damage with a lingering hazard
  (`Placed Object`); every cosmetic re-skin found doesn't. Direct EXPL damage
  (`baseDamage`) is therefore only materialized when a hazard ALSO exists;
  without one a `note` records the value when non-zero rather than silently
  dropping or double-counting it. The SAME investigation also caught a REM
  bug mirroring the Enchantments one above: these color mods REM
  `ProjectileCremator` (the shared default projectile) before SETting their
  own — walking the REM identically to the SET (the pre-fix state of this
  code) double-chased the removed AND the added projectile. `OverrideProjectile`
  REM is now skipped (note-only), exactly like `Enchantments` REM.
- **Launcher-family guard (`explosiveFamilyKeywords`)**: found while
  validating the fix on the BOS Rocket Launcher's Napalm/Cryo/Plasma tube
  barrels — the Hellstorm Missile Launcher WEAP already carries its own
  `fromExplosion` component (`chaseExplosion`, weapon-level, keyed off the
  WEAP's OWN `RGW3.Override Projectile` — a fixed field independent of which
  barrel is equipped). A barrel OMOD's `OverrideProjectile` swaps which
  projectile ACTUALLY fires, but nothing removes the weapon's now-stale
  baseline component (chaseExplosion's own doc comment already calls this out
  as a pre-existing, accepted gap: "OMOD projectile overrides swapping the
  explosion... not modeled") — so materializing this OMOD's own EXPL/HAZD
  damage would ADD an extra number on top of an already-wrong baseline rather
  than fixing it. `extract-weapons.ts` now returns
  `explosiveFamilyKeywords` (every keyword of every weapon with a
  `fromExplosion` component); `extractOmods` checks each omod's own
  `targetKeywords` against it and — when they intersect — skips the
  OverrideProjectile chase's materialization entirely (note-only, mirroring
  the no-hazard cosmetic case), regardless of whether a hazard exists. Lobber
  Barrel / Polar Lobber are unaffected: Lightning Gun and Cryolator are pure
  beam weapons with NO `fromExplosion` component to conflict with. This is a
  narrower fix than properly reconciling OMOD-level projectile swaps with the
  weapon's baseline explosion (which would need the OMOD chase to also
  suppress/replace the weapon's own component) — that reconciliation is out
  of scope here and stays a known gap for launcher-family barrel swaps
  generally (BOS Rocket Launcher's 3 elemental barrels now correctly extract
  NOTHING new, same as before this whole fix, rather than a wrong number).
- **ASSUMPTION, unconfirmed in-game**: HAZD `Target Interval` (how often the
  field re-ticks a target within it, 0.3s for both) and `Limit` (max targets
  simultaneously affected, 20/12) are NOT modeled at all — the engine's
  existing DoT convention has no per-tick-interval or per-target-limit
  concept, so the HAZD's magnitude is folded exactly like any other
  extracted DoT (steady-state damage/sec while continuously engaged), which
  may over- or under-state a lobbed-grenade's real sustained contribution
  relative to a direct-hit weapon's bleed/burn. Queued for in-game
  confirmation.
- **NOT modeled: EXPL "Base Weapon Damage Mult"** (Polar Lobber's EXPL
  carries 1.0 — a launcher payload "worth 100% of the weapon's own damage
  again"). The existing `explosivePayload` mechanic (Gauss family) is a
  WEAPON-FIELD base (`weapon.explosionBaseWeaponDamageMult`) that OMOD
  modifiers fold on top of, not an OMOD-originated value itself — and unlike
  the Gauss case (a kinetic slug PLUS a separate explosive charge), the Polar
  Lobber's barrel entirely REPLACES the Cryolator's normal firing mode (no
  separate "primary hit" coexists once OverrideProjectile swaps the
  projectile type to a Missile), so whether BWDM 1.0 means "double the EXPL's
  own direct damage" or "twin the weapon's original beam damage" is
  genuinely ambiguous from static data alone. Extracted but deliberately left
  unmodeled — a single `note` records the value per omod
  (`EXPL <edid> Base Weapon Damage Mult <n> — not modeled`) rather than
  guessing; needs a user decision (and ideally an in-game measurement) before
  it's wired to any bucket.

## Mixed damage-type OMOD conversion (DamageTypeValues) (2026-07-13 — `materializeDamageTypeComponents`, effective-weapon.ts)

OMODs like the Gauss Minigun's Tesla Coil Capacitor convert/add damage types
(`baseDamage MUL_ADD −0.2` ballistic-scoped, `+0.5` energy-scoped). The +0.5
used to silently no-op — `paper-damage.ts` only folds `baseDamage` per
EXISTING weapon component, and a ballistic-only weapon has nowhere for an
energy-scoped bonus to land.

- **Fold formula** (user-confirmed): `final(X) = max(0, (last SET ?? base(X))
  + Σ(MUL_ADD × MUL-base) + Σ ADD)`. `foldOps` (resolve.ts) already implements
  the SET/MUL/ADD ordering; `paper-damage.ts`'s per-component `baseDamage`
  fold clamps the result to 0 (a component driven negative contributes
  nothing rather than flipping the parenthesis sign).
- **Missing-type materialization**: a `baseDamage` modifier scoped to a type
  the weapon doesn't already deal synthesizes a NEW component instead of
  no-op'ing. `scale` = Σ POSITIVE MUL_ADD values only — a NEGATIVE MUL_ADD on
  a missing type multiplies that type's own (zero) base and contributes
  nothing, DROPPED per-modifier rather than netted against positives. This is
  what keeps the ~54 real "−30% on all six damage types" blanket
  automatic-receiver/barrel OMODs (344 individual scoped MUL_ADD values
  counted in `omods.json` — Powerful Automatic Receiver et al.) from spawning
  five phantom components on e.g. the ballistic-only Fixer.
- `flatBonus` = `(last SET ?? 0) + Σ ADD` — flat and absolute, NO
  weapon-level curve scaling (these are literal game-data numbers, not curve
  inputs; SET/ADD-shaped `DamageTypeValues` properties). MUL-derived
  materialized damage DOES level-scale, via the fallback component's curve.
- A type materializes only when `scale > 0 || flatBonus > 0`. The new
  component borrows its curve (tier/levelCap/curvePoints) from the
  **fallback**: the weapon's first non-`fromExplosion` ballistic component,
  else its first non-`fromExplosion` component — never `weapon.damageType`,
  which would misroute explosive-first launchers. `fromExplosion` components
  (launcher EXPL payloads) never count as "the weapon already deals this
  type" and never serve as the fallback base — they're a separate damage
  stream. A weapon with no eligible fallback (Gamma-Gun-shaped, entirely
  `fromExplosion`) materializes nothing.
- Every `baseDamage` modifier that fed a materialized type's scale/flatBonus
  — including its dropped negatives — is CONSUMED (removed before the
  modifier list reaches the resolver), so the ordinary per-component fold in
  `paper-damage.ts` can't apply it a second time. Modifiers scoped to types
  the weapon ALREADY deals are left untouched — the existing per-component
  fold already handles boost/ADD/SET/clamp correctly for those.
- **Twins inherit the parent component's damage type** instead of the old
  hardcoded `'explosive'` (`paper-damage.ts`), keeping
  `componentIsExplosion: true`. User-confirmed via the Gauss Minigun + Tesla
  Coil Capacitor + its intrinsic `explosionBaseWeaponDamageMult` (0.15,
  unconditional): the explosive tick deals a phys twin off the ballistic
  component AND an energy twin off the materialized energy component (the
  "Tesla Gauss 15% tick = phys + energy" case). Demolition Expert
  (`explosive` scope) still matches via `componentIsExplosion`
  (resolve.ts's existing dual-match); Science! (`energy` scope,
  `damageTypeScope ['energy']`) now also reaches the energy twin the same
  way. Generalizing this to damage types beyond ballistic/energy is an
  ASSUMPTION — only the Tesla/Science! combination is user-verified.

## Fire rate (`src/lib/fire-rate.ts`) — CLOSED 2026-07-13

- Auto: `speed / 0.11`; semi: `speed / Attack Delay Seconds`; melee: 1.0/s stub
  (melee timing is the only open scope left, `dps-todos/melee-cadence.md`).
- **Confirmed** against 30+ user-supplied in-game Pip-Boy Fire Rate readings
  across base weapons and weapon+mod combos, across both the live
  (2026-07-02) and PTS (2026-07-10) dumps: Pip-Boy Fire Rate =
  `(effectiveSpeed / cycleConstant) × 10`, rounded. The overwhelming majority
  use `cycleConstant = 0.11` (auto) or the weapon's own `Attack Delay
  Seconds` (semi), exactly as implemented. Full weapon-by-weapon tables lived
  in `dps-todos/fire-rate.md`, deleted 2026-07-13 when the ranged scope
  closed — recover via git history if ever needed.
- The historical 0.8248 "physical" multiplier (and every other per-weapon-family
  automatic-receiver Speed change) is `SET`/`MUL_ADD Speed <value>` on OMODs,
  resolved through the existing `Includes`-chain flattening into a
  `fireRateSpeed` bucket — never hardcoded. Confirmed across many weapon
  families and barrel/receiver combos (Combat Rifle, Assault Rifle, Handmade,
  Alien Disintegrator, Combat Shotgun, Minigun barrels, Gauss Minigun barrels,
  MG42/LMG receivers, Railway Rifle). The recurring
  `_PARENT_mod_WEAPON_GENERIC_AntiScorchBeast` piece (`Speed MUL_ADD −0.10`,
  plus minor AimModel/range/value tweaks) is the shared "Prime" mod tax
  across weapon families.
- **Bug found and fixed**: `isAutomatic` was derived from the
  `WeaponTypeAutomatic` **keyword** (`gw.keywords.includes('WeaponTypeAutomatic')`
  in `weapons.ts`; `keywords.includes(...)` in `effective-weapon.ts`).
  User-confirmed: that keyword drives perk conditions only, not real fire
  mode — some OMODs add it without the weapon actually being full-auto.
  Combat Shotgun's Automatic Receiver is the concrete case: it sets
  `HasRepeatableSingleFire` (a hold-to-repeat semi mechanic, same as Auto
  Grenade Launcher's base record), never `IsAutomatic`, yet its include
  chain still adds the `WeaponTypeAutomatic` keyword — so the app was
  computing its fire rate via the flat 0.11 divisor (wrongly predicting 118)
  instead of its own `Attack Delay Seconds` with the boosted Speed (1.3/0.5×10=26,
  confirmed exactly in-game). **Fixed**: `GeneratedWeapon.isAutomaticFlag`
  now comes from the base WEAP's `Data.Flags` "Automatic" bit
  (`extract-weapons.ts`); `effective-weapon.ts`'s `isAutomatic` fold no
  longer ORs in any keyword check — only the base flag + an OMOD's real
  `IsAutomatic SET` property. Re-extracted (`pnpm extract --only weapons`,
  2026-07-02 dump); `pnpm test` 204 passed.
- V63 Carbine/Meltdown does **not** get an automatic-receiver `SET Speed`
  override — it has no automatic-receiver mod at all (always-auto by base
  Flags; its mod slot uses "Capacitor" variants instead of a receiver swap).
  Its reduced, ballistic-like fire rate comes entirely from its base WEAP
  `Speed` of `0.8` (vs. the typical energy-weapon 1.0), already read by the
  plain extractor — no override needed.
- **Confirmed exceptions — two real alternate animation-cycle constants**,
  each shipped as a hand-maintained override (`src/data/overrides/corrections.ts`,
  new `animDurationSec` modifier bucket folded in `effective-weapon.ts`
  exactly like `fireRateSpeed`; no ESM property encodes these, Havok
  animation timing isn't parseable):
  - **Gatling Gun — 0.5s** (`weaponCorrections.GatlingGun.animDurationSec`).
    Confirmed via a dedicated `AnimsGatlingGun` ESM keyword — distinct from
    every other weapon's own bespoke `Anims*` keyword (e.g. Minigun's
    `AnimsMinigun`, which uses the standard 0.11s cycle) — proving this is a
    real, intentional per-weapon animation resource, not a coincidental or
    buggy shared override. In-game: base Speed 1.0, Pip-Boy 20 (1.0/0.5×10=20).
  - **Gatling Laser Charging Barrels — 1/6s ≈ 0.1667s** (`omodModifierAdditions`,
    an additive override mechanism distinct from `legendaryValueOverrides`'s
    replace semantics, since this OMOD's `Speed MUL_ADD −0.75` was already
    correctly extracted — only the animation-cycle piece needed adding).
    Confirmed with two independent effective-Speed readings landing on the
    same constant: Charging alone (0.5 effective) → Pip-Boy 30; Charging +
    Prime Receiver (0.3 effective) → Pip-Boy 18 — both back-solve to 1/6s
    exactly. All 8 Charging Barrel variants (4 regular + 4 Ultracite) share
    the underlying `_PARENT_mod_WEAPON_GatlingLaser_Super` include and get
    the same addition.
  - Minigun, Gatling Laser (both Speed 2.0), and Gauss Minigun (Speed 1.0,
    despite carrying the same `Charging Attack` WEAP flag as Minigun/Gatling
    Laser) all fit the flat `0.11` formula exactly in their base/receiver-only
    states — the `Charging Attack` flag does not by itself imply a custom
    `animDurationSec`; Pip-Boy Fire Rate reflects the weapon's resting cycle,
    not any in-combat rev-up/charge behavior.
- **False-positive "exceptions" that turned out to need no fix** (both were
  process gaps — not walking a weapon's own default/base-state Includes
  chain with the same rigor as its divergent variant — not ESM limitations):
  - **Submachine Gun**: its "Standard Receiver" was assumed Speed-neutral by
    analogy with Combat Rifle/Assault Rifle (where the semi/default state
    genuinely has no Speed override) — but Submachine Gun has no semi mode
    at all (always-automatic natively), and *every* receiver option,
    including "Standard," pulls in the same shared
    `_PARENT_mod_WEAPON_Receiver_AutomaticInit` template (`IsAutomatic SET
    True` + `Speed SET 0.8248`) that Combat Rifle/Alien Disintegrator use.
    The raw, truly-unmodified WEAP Speed (1.61) is never a real achievable
    in-game state. Both readings (75 stock, 60 Prime) match the ordinary
    Speed fold exactly, standard 0.11 divisor — no override.
  - **Railway Rifle**: the earlier "10-vs-25, matches neither the ESM"
    finding was because it was checked against the wrong dump. The user's
    numbers came from a **PTS** client (`FO76-Tools/esm/Data/20260710/`),
    which has different base stats (`Speed 1.0`, `Attack Delay Seconds 0.4`)
    than the live 2026-07-02 dump (`Speed 0.5774`, `Attack Delay Seconds
    1.0`). All 6 PTS readings (25 semi/Standard, 45 Automatic Piston
    Receiver, 25 Shotgun/Splitter Receiver, 22 Prime + Prime Shotgun, 36
    Prime Automatic Piston) match the ordinary formula exactly on that dump.
    (This app currently only ships a live dataset — `dps-todos/pts-toggle.md`.)
- Stock weapons with no receiver selected use the WEAP record's base stats —
  verified this is generally fine EXCEPT when a weapon has no true semi/auto
  choice at all (Submachine Gun above); in that case its "Standard" receiver
  option may still carry a real Speed override and must be walked, not assumed.

## Sustained DPS (`src/lib/engine/sustain.ts`)

- `burstDps = perHitAvg × fireRate` (mag-dump, no reload) — the old "sustained
  DPS" renamed to what it actually was.
- `sustainedDps = (perHitAvg × shotsPerMag) / (shotsPerMag / fireRate + reloadSec)`
  with `shotsPerMag = floor(Capacity / Ammo used per shot)`.
- **ASSUMPTION (unverified in-game):** `reloadSec = Animation Reload Seconds
  (RGW3) / Reload Speed (Data)`. Fixer: 3.20 / 1.1765 ≈ 2.72 s. Pinned by a
  `expected: null` golden case until someone stopwatches N full
  mag-dump+reload cycles vs a target dummy.
- Magazine OMODs: `AmmoCapacity`/`ReloadSpeed` properties map to the
  `ammoCapacity`/`reloadSpeed` buckets and rewrite the effective weapon's
  capacity/reload speed (`effective-weapon.ts`), same fold as Speed.
- No magazine (melee/unarmed, `Capacity 0`): sustained = burst, reload 0.
- Weapons extracted before the reload field landed lack `animationReloadSec`
  → treated as zero-cost reload (sustained = burst) rather than guessing.

## Crit meter (`src/lib/engine/crit-meter.ts`)

- `fillPerHit% = (5 + 1.5 × LCK) × weaponCritChargeBonus` from GMSTs
  `fVATSCriticalChargeBase`/`fVATSCriticalChargeMult` (20260702 ESM).
- Consumption: `fold(critConsumption over 100)` — Critical Savvy SETs 85/70/55
  (extracted) — times `(1 − 0.10 × limitBreakingPieces)` (armor mod, hand-modeled).
- Steady state: crit every `ceil(cost/fill) + 1` shots, max every 2nd shot.
  Anchor (user-verified): 16 LCK + Crit Savvy 3 + 5× Limit Breaking → every 2nd.
- Per-weapon `Crit Charge Bonus` semantics and rounding unverified in-game.

## Value curves (extracted — magnitudes ARE in the ESM)

Curve-bearing magic effects (Curve Table + input Actor Value on the effect)
supply Y at X = a player stat; the curve overrides the flat magnitude.
Extracted automatically (`normalize/mgef.ts`, `Modifier.curve`):

**Single-point curve tables** (exactly one `{x, y}` pair) carry no real input
axis — interpolating one point always returns that Y regardless of X, so
it's an authored constant rather than a curve. `normalize/mgef.ts` uses the Y
value directly as the effect's magnitude in this case, bypassing the usual
`curveInputAv` resolution (which would otherwise drop the modifier with a
"curve with unmapped input AV null" note, since a single-point curve has no
reason to carry a resolvable input AV at all). Confirmed on three alcohol
`dbm` effects whose Curve Table Y exactly matches their flat EFIT magnitude:
Ballistic Bock (`BallisticBock_BallisticDMG.json`, {1→15}), High Voltage Hefe,
Hoppy Hunter IPA — all +15% dbm, previously dropped entirely (2026-07-13).

**Null-input DoT curves default to `itemLevel`** (2026-07-13): weapon-mod
bleed/burn/shock/poison DoTs (Damage-archetype MGEFs, `dotDamage` bucket) are
delivered via ENCH→MGEF with a multi-point curve and NO Actor Value at all
(`curveInputAv: null` — there's no AVIF for "item level" as an effect-level
input, so the engine reads it straight off the equipped weapon, same as OMOD
property curves). Confirmed item-level (X = 1→50) on every sampled weapon-mod
DoT, e.g. `EnchWeapMod_HarpoonGunBleed` (X 1→50, Y 10→32 — genuinely
level-scaled) and the **Bleeding legendary** (`ench_LegendaryWeapon_Bleed`,
flat magnitude 0, all damage in the curve, Y 5→17 — previously 0 bleed DoT).
`normalize/mgef.ts` defaults these to `itemLevel` when the curve's last point
is ≤100 (a level-shaped domain), restoring 125 obtainable weapon mods
(12 of which had dropped to a fully empty modifier list). The guard matters:
some MGEFs sharing the same effect edid (e.g. `dtPoisonEffectChanceAlways`)
are ALSO used on creature/event effects with a genuinely different, much
wider domain (`PoisonStingwingBite`, X up to 540; the `cr`-prefixed
"Poison Frame"/"Radscorpion Venom" mod variants, same wider domain) — those
correctly stay dropped with a note rather than being misread as item level.

**SPECIAL-scaled damage axes** (2026-07-13): `strength` and `charisma` join
`endurance`/`intelligence` as buff-folded SPECIAL `CurveInput`s. The Debilitator
(`limbDamage`, X = STR, routed via `STAT_DmgLimbs`) and Peace Maker (`dbm`
explosive-scoped, X = CHA, routed via `STAT_DmgExplosive`) both had their AVIF
route already mapped — only the curve's input axis (AV `0x000002C2`/`0x000002C5`)
was missing, so each was a clean single-gap fix (no route ambiguity). Mapping
CHA also incidentally un-dropped **Lone Wanderer**'s `apRegen` curve (same AV
— "AP regen based on your CHA while not on a team"), correctly extracted but
still inactive: its `IsMemberOfAPlayerTeam()=0` gate is an `unresolved`
condition (team membership isn't modeled), so the modifier is skipped at
runtime same as any other unresolved-condition modifier.

**Bullet Storm / Heavy Gunner's ammo-spent stacks** (2026-07-13): a new
`bulletStormStacks` `CurveInput`, AV `0x0000039B`, no AVIF record (hardcoded
slot, same pattern as Onslaught) — mirrors the existing `bulletStorm`
StackCounter reader (same underlying `PlayerConditions.bulletStormStacks`
field; a separate CurveInput entry is needed only because `ValueCurve.input`
is typed as `CurveInput`, not `StackCounter`). Restores Bullet Storm's `dbm`
curve (+3/6/9%/stack ×10 stacks, verified: curve Y 90/180/270 at X=30,
interpolated at X=10 × route scale 0.01 = 30/60/90%) plus sibling
reload-speed/bash-damage/charge-up-speed curves on the same AV (though those
are further gated on `HasPerk(...)` conditions the extractor doesn't resolve,
so they stay inactive — only the ungated `dbm` curve currently applies).

**Shotgun Champ's projectile-count axis + the `STAT_DmgVsCrippled` route**
(2026-07-13, user-confirmed mechanic): `abPerkFortifyDmgCrippled`
("+10%/projectile to crippled targets") looked like a single-axis gap but
needed two: a new `projectileCount` `CurveInput` (AV `0x00000398`, no AVIF
record — reads the effective, OMOD-folded weapon's projectile count,
`ctx.weapon.projectileCount`), AND a `FALLBACK_AVIF_ROUTES` entry for
`STAT_DmgVsCrippled` (previously entirely unmapped, unlike the already-routed
`STAT_DmgPerCrippled` used by Bully's/Tormentor). User-confirmed semantics:
the projectile count SCALES the bonus (curve X); crippled-limb presence is a
binary GATE, not a per-limb-count scale like Bully's — expressed by reusing
`perCrippledLimb` with `max: 1` (clamps the scale factor to exactly 0 or 1,
vs. Bully's `max: 6` which scales continuously by limb count). The redundant
`GetValue(0x00000398)≥1` condition row ("fires ≥1 projectile", always true)
is dropped during condition translation (`conditions.ts`), mirroring the
existing killStreak-≥1 redundant-gate handling. The same route fix also
un-dropped **Slugger** (+10/20/30% dmg vs crippled, melee, same boolean gate)
and **Deal Sealer** ("+10% damage per impairment your target has" — crippled
was the missing impairment component; bleed/fire/poison/cryo already worked).

| Effect | Input (X) | Curve | Notes |
|---|---|---|---|
| Bloodied | current HP fraction (AV 0x392) | (0.05 → +130) … (1.0 → 0) | linear between points; clamped below 5% HP |
| Nerd Rage! | current HP fraction | (0.05→80, 0.2→40, 0.8→1, 1.0→0) | perk had zero magnitude — curve is the value |
| Junkie's | addiction count (AV 0x1EB998) | (1→10 … 10→100) | +10%/addiction up to +100% at 10; the addiction COUNT itself is uncapped in-game (an active chem suppresses its own addiction — consumables-overhaul work) |
| Aristocrat's | caps on hand (AV 0x393) | 0→0 … 17000→30 … 29000→50 | up to +50% at 29k caps |
| Juggernaut's (`mod_Legendary_Weapon1_DamageViaHealth`) | ABSOLUTE current HP (AV 0x2D4) | (0→0, 1000→100) | linear +0.1%/HP; max HP is derived (see "Max HP"), the 300 fallback only feeds synthetic engine tests |
| Unarmored-target (`mod_Legendary_Weapon1_DamageUnarmored`) | enemy DamageResist (AV 0x2E3) | extracted | INERT: curve input reads 0 until enemy defenses land |
| Adrenal (legendary weapon, `mod_Legendary_Weapon1_Adrenal`) | kill streak (AV 0x399) | (0→0, 1→10, 10→100) | +10%/stack; curve domain confirms the kill-streak cap of 10 |
| Adrenaline (perk, `Adrenaline01`) | kill streak (AV 0x399) | (0→0, 1→10, 10→100) | +10%/stack — same trigger as the mutation/legendary, own value |
| Polished (`mod_Legendary_Weapon4_Polished`) | equipped weapon condition fraction — engine function `GetEquippedWeaponHealthPercent`, NOT an AVIF (curve input AV is null in the MGEF; mapped via an edid-keyed override on `Legendary_Weapon_PolishedPerkApplyEffect`, proven by the cut `DEL_Legendary_Weapon_PolishedPerk` → `DEL_Legendary_Weapon_PolishedSpell` predecessor, which gates the SAME base effect 0x007B9459 with a `GetEquippedWeaponHealthPercent` condition row) | 27-point table (1.0→0) rising to (2.0→60) | 100% = full condition (stock, no bonus), 200% = over-repaired max (+60% dbm); UI field `weaponConditionPct` (0–200 step 10, default 100). "Tarnished" (mirror damaged-weapon effect) is CUT content (`HTO_` dev-only records, not in the live dataset) — reference-only, not implemented |

**The four Adrenal-family sources** (same kill-streak trigger, don't conflate):
Adrenaline perk (+10%/stack dbm), Adrenal Reaction mutation (+5%/stack dbm,
+6.25 super), Adrenal legendary WEAPON mod (+10%/stack dbm), and the Adrenal
legendary ARMOR mod (`mod_Legendary_Armor1_Adrenal`) which scales **DR+ER**,
stacking once per armor piece up to 5 — defensive, out of scope until armor
modeling (feeds the DR→unarmed synergy stream). Redundant `GetValue(killStreak)≥1`
gates on curve effects are consumed by extraction (curves are 0 at 0 stacks).

## Hand-supplied values (script-computed, no curve — `src/data/overrides/`)

Policy (2026-07 overhaul): wiki-sourced values are banned from overrides —
ESM-derived or in-game-measured only. Effects the ESM can't express stay
inert with a picker badge (`corrections.ts omodBadgeOverrides`).

| Effect | Model | Source |
|---|---|---|
| Furious | RESOLVED 2026-07-12 (was: INERT, badged 'pendingMechanic') — real mechanic is the shared Onslaught stack counter: +9 max stacks, +1%/stack dbm. See "Onslaught" below. Old wiki override (+5%/hit, max 9) stays deleted — the ESM value is +1%/stack, not +5% | ESM granted-perk chase: PERK `Legendary_Weapon_DmgConsecutiveHits`, EP190 +9 / EP189 +0.01 |
| Instigating | +50% dbm while enemy HP ≥ 60% (override DELETED 2026-07-10 — the old +100%-at-full-health value came from description text and is stale post-rework) | ESM granted-perk chase: PERK Legendary_Weapon_DamageFirstBlood, dbm +0.5, target GetHealthPercentage ≥ 0.6 |
| Executioner's | +50% dbm while enemy HP ≤ 40% (`enemyHealthBelowPct`; enemy HP defaults to 100 → inactive until set) | ESM granted-perk chase: LegendaryExecutePerk +0.5, threshold GLOB LGND_ExecuteHealthThreshold = 0.4 |
| DmgVs* family (Hunter's, Exterminator's, Ghoul Slayer's, Assassin's, Troubleshooter's, Zealot's, Mutant Slayer's) | +50% dbm vs matching enemy types via `enemyTypeAny` conditions — INERT until enemy typing lands, badged 'needsEnemyDefenses'. Values ride flat itemLevel curves (1→50, 100→50) on `ActorValues` OMOD properties routed through the STAT_DamageVsPerk plumbing | ESM (extracted 2026-07-10) |
| Bully's (and Tormentor perk) | dbm per crippled enemy limb (Bully's +25%, Tormentor +20%), `perCrippledLimb` cap **6** (limb count from `EnemyConditions.crippledLimbCount`, default 0 → inactive) | ESM STAT_DmgPerCrippled; the 6-limb cap is ours (max humanoid/creature limbs) |
| Explosive (2★) | `explosivePayload` (0.2 = 20% of damage as explosive) spawns an explosive twin PER damage component, folded through dbm/crit/power-attack/whole-damage — but NOT sneak or the body-part multipliers (2026-07-14, user spec: an explosive payload lands on whatever part it strikes and isn't a stealth attack). Explosive-scoped dbm modifiers (`damageTypeScope: ['explosive']` — Demolition Expert, SCAV! magazine) add into the twin's dbm parenthesis (June 2026 additive semantics; the old `explosionMult` bucket is gone). Twins sum into today's totals; each stays a separate component so it can face its own resist once enemy mitigation lands (Stage A1, `paper-damage.ts`) | ESM LGND_ExplosivePayload OMOD property; Demolition Expert extracts since 2026-07-13 (STAT_DmgExplosive route) |
| Crippling / Basher's | values extracted to `limbDamage` / `bashDamage` buckets — INERT until limb targeting / bash attacks are modeled | ESM STAT_DmgLimbs / STAT_DmgBash |
| Pyromaniac's / Viper's / Severing's | +50% dbm while the target has ≥1 active fire / poison / bleed effect (`enemyHasActiveEffect`; Target section status toggles, default off). Viper's `HasPerk(ImmuneToPoison)=0` target row is CONSUMED — a generic target is assumed vulnerable to poison. Severing's (4★, `SDOW_mod_Legendary_Weapon4_Severing`) was silently dropped pre-2026-07-12 by the `sdow_` junk-prefix filter (same class of bug as `p62_`); its `HasKeyword(SDOW_HasLegendary_Weapon_Severing)` self-gate resolves like the other HasLegendary_* self-gates. A "Frozen" toggle maps `DamageTypeCryo` → `isFrozen` but NO extracted effect consumes it yet (Icebreaker is "Cryo Slow On Bash" — it applies a slow, it doesn't benefit from one) — forward-looking UI only | ESM granted-perk chase (fire/poison 2026-07-11, bleed 2026-07-12) |
| Last Shot | +100% dbm while firing the magazine's last round (`lastRound` from `GetLoadedAmmoCount()=0` + `IsNextClipLastShot`; UI checkbox, default off). Steady-state DPS does NOT model the once-per-magazine cadence — the toggle shows the boosted hit | ESM granted-perk chase (conditions wired 2026-07-11) |
| Encircler's | +10%×N dbm from `enemyGroupCount` tiers (==1..4, ≥5 → +50%). `EnemyConditions.groupTargetCount` defaults to **1** (the target itself counts as a group of one → +10% baseline), matching `GetGroupTargetCount`'s minimum for an engaged target | ESM granted-perk ability spell (conditions wired 2026-07-11) |
| Fencer's (melee) | +12.5%–50% dbm from exact `teammateCount` tiers (==0..3). The ESM's `GetDistance < 2500` (~35m) rows on Potential Players are CONSUMED — teammates are assumed in range when the count is set | ESM granted-perk ability spell (conditions wired 2026-07-11) |
| Mutant's / Gourmand's / Lucid | curve-driven dbm on new inputs: `mutationCount` (derived from the selected mutation list), `hungerThirstTier` (DERIVED, see below), `feralTier` (UI slider, 0–8 ghoul meter, default 0). Gourmand's is human-only (`playerIsGhoul` false gate from GetIsPlayerGhoul()=0; the Character section's exclusive Human/Ghoul toggle, default human) | ESM curves; input AVs MutationCount / HungerThirstTier / GHL_FeralTier |
| Hunger & thirst tiers | `hungerThirstTier` (0–8) = `foodTier` + `drinkTier`, two 0–4 UI sliders labeled with the game's threshold names (SURV_NewHungerThreshold_Msg_0..4 "Fully Fed"…"Hungry", SURV_NewThirstThreshold_Msg_0..4 "Fully Hydrated"…"Thirsty"; msg index 0 = fullest = tier 4). The SUM decomposition is an INFERENCE from the AV's 0–8 max (0x006D37DC) against two 5-state meters — matches Gourmand's "each 25% of both meters" behavior but is not record-proven | ESM AVIF HungerThirstTier (max 8) + threshold MESG/GLOB records; composition rule is ours |
| Feral meter names | The feral slider labels its 0–8 tier with GHL_SURV_FeralThreshold_Msg_0..4 names ("Wonderful"/"Normal"/"Odd"/"Losing it"/"Feral") banded 8 / 6–7 / 4–5 / 2–3 / 0–1. Tier 8 = "Wonderful" (well-fed end — Lucid's curve peaks there); the intermediate cutoffs are an INFERENCE (5 names over 9 tiers), display-only | ESM MESG records; banding is ours |
| Two Shot | extracted ENCH values flow through: dbm +0.75 and projectileCount +1. The extra projectile feeds NO damage term yet (per-projectile modeling deferred), so displayed effect = flat +75%. RESOLVED 2026-07-10: user-confirmed ×1.75 (Fixer @50: 103 → 180.25), golden case `Two Shot Fixer @50` asserts it; the old wiki +25% claim was wrong | ESM ENCH (extracted 2026-07-02) + user confirmation |
| Anti-Armor (`mod_Legendary_Weapon1_ArmorPenetration`-family) | −50% target armor via OMOD property `ActorValues ADD ArmorPenetration 50.0` → `armorPen` bucket (0.5). INERT until enemy DR lands, badged 'needsEnemyDefenses' | ESM OMOD property |
| Bleed/burn/shock mod DoTs | Damage-archetype MGEFs → `dotDamage` bucket with magnitude, `durationSec`, element from the MGEF Resist Value. **Refresh-only model** (user-confirmed, Stage A2): re-applying resets the timer rather than stacking, so the steady-state contribution while continuously attacking is the summed magnitude — INTERPRETED as damage/sec, NOT ESM-proven (the ESM only proves the total-over-duration magnitude, not a per-second rate). Displayed as a separate "DoT +X/s" line; burst per-hit and sustained DPS are unchanged. Folded per weapon-component damage type (every extracted entry carries exactly one `damageTypeScope` type) so it only counts on a weapon that actually deals that type. **Exempt from sneak, crit, and body-part/weakpoint multipliers** (2026-07-14, user spec) — `computeDotDps` never enters the paper-damage formula's multiplier chain; see "Formula structure" above | ESM (extracted); dmg/sec interpretation + refresh-only rule are ours |
| Adrenal Reaction (mutation) | +5% dbm per KILL STREAK stack (+6.25%/stack with Strange in Numbers), extracted directly as ESM curves (Mutation_Adrenal_Normal/_Super, x:1→20). Below x=1 (the kill-streak slider's minimum, 0) the curve clamps to its lowest point (5%/6.25%) rather than reading 0 — this is the SAME endpoint-clamp convention the game's own curve tables use (compare `legendarymods/armor_resistancesperkill.json`, no x=0 point, vs `weapon_damageperkill.json`, explicit x=0→0), not an engine bug; no special-case zero floor is added | ESM curves (RETIRED the hand-carried `buff-overrides.ts` entry 2026-07-13 once the esm-CLI curve↔effect mis-association was fixed at the parser level — see decode.rs) |
| Tenderizer | +10% dbm per stack, manual stack input 0–1000 | ESM magnitude 0.1 (PerkTenderizer01Spell); stacking cap per user spec |
| Follow Through / Taking One for the Team | Both are `wholeDamage` ×(1+value) target-side damage-taken debuffs, esm-walk-confirmed exact match to the card description (10/20/30/40% per rank — no wiki-vs-ESM mismatch). Both are conditional 10s-window procs (Follow Through: after a ranged/thrown sneak hit; TOftT: on a teamed player being attacked) that aren't steady-state-computable, so each is modeled as a manual 0–40% uptime slider (`followThroughPct` / `takingOneForTheTeamPct`, default 0) representing the player's own assumption, independent of which card rank is equipped — NOT a rank-locked lookup. Slider only renders/applies while the corresponding legendary card is equipped; composes multiplicatively with the other via `foldWholeDamage`'s existing Π(1+value) (1.0×–1.4× each, up to ~1.96× if both maxed) | ESM chase 2026-07-14: Follow Through card → `Apply Combat Hit Spell` (IsStealthed + WeaponTypeThrown/Ranged) → SPEL → MGEF (`Perk to Apply`) → hidden debuff PERK `FollowThroughDamageDebuffPerk0{1-4}` (0x005A5D6D–70), `Mod Incoming Weapon Damage` ×1.1/1.2/1.3/1.4, unconditional 10s. TOftT's visible card (0x005A59C7–CA) is a pure gate (`GetPlayerTeammateCount()>0` + `IsMemberOfAPlayerTeam()`); real magnitude lives on hidden companion `LGN_TakingOneForTheTeam_DamageIncrease_Perk` (0x005B01AE–B1, `hasCard: false`, granted to the attacker), same `Mod Incoming Weapon Damage` ×1.1/1.2/1.3/1.4 mechanism |
| SPECIAL buffs (Buffout +2 STR/+2 END, Bufftats +3 STR/+3 END/+3 PER, Mentats +2 INT/+2 PER, Berry Mentats +5 INT) | flat unconditional ADDs folded into player STR/LCK in `resolveLoadout` (STR → melee term, LCK → crit meter); PER/END/CHA/INT/AGI stored-inert until perk-SPECIAL scaling. Selection-level stacking/exclusivity (one chem/alcohol at a time, same-bonus food/drink displacement) is enforced in `src/lib/consumable-rules.ts` — see "Consumable stacking & addictions" below | ESM Peak Value Modifier magnitudes (extracted) |
| Juggernaut's max-HP input | `PlayerConditions.maxHealth` is DERIVED (see "Max HP") and shown read-only in the Character section — the old editable Conditions field was dead (resolveLoadout always overwrote it); the 300 default only feeds synthetic engine tests | derivation 2026-07-12; dead input removed with the Character section |
| Strange in Numbers | DERIVED gate, not a stored toggle: active ⇔ the StrangeInNumbers card is equipped AND `teammateCount` ≥ 1 (the +25% mutation boost needs a mutated teammate; teammate mutation status isn't modeled, so any teammate counts — user-decided 2026-07-12). Mutations header shows an active/inactive badge; legacy URLs carrying the old stored flag decode to the derived value | card description + user decision |
| Kill-streak slider gating | The Character section's kill-streak slider disables when no equipped source reads the counter — detection is an existence SCAN over assembled modifiers (`curve.input: killStreak`, `killStreakCount` conditions, `stacks: adrenaline`), unlike Onslaught's `onslaughtMaxStacks` bucket fold: kill-streak sources attach to arbitrary buckets, there is no dedicated bucket to fold (`ScenarioSet.hasKillStreakSources`) | engine wiring 2026-07-12 |

## Consumable stacking & addictions (2026-07-13 consumables overhaul)

Binding rules (user-specified 2026-07-10), enforced
in `src/lib/consumable-rules.ts` (the ONE implementation shared by the build
reducer, the persistence codec, and the picker UI):

- **Chem**: only one active at a time — selecting a new chem displaces
  whichever chem is currently active.
- **Alcohol**: only one active at a time, independent of chem.
- **Food / non-alcohol drink**: stack freely UNLESS they grant the "same
  bonus", in which case the new item displaces the old one.

**"Same bonus" is derived from ESM data, never hand-authored.** Each
dispel-flagged MGEF effect (ALCH `Magic Effect Data.Data.Flags` includes
"Dispel with Keywords") resolves to `GeneratedBuff.dispelKeys`: one key per
dispel-flagged effect, the effect's own resolved KYWD edids, sorted and
joined with `|`. Two buffs share a bonus iff they carry an IDENTICAL key —
**exact keyword-SET equality, not any-keyword intersection**. Intersection is
provably wrong: every food effect carries the same broad, non-discriminating
`FoodEffect` + `SURV_EffectTypeFoodBuff` keywords regardless of what it
actually buffs, so an intersection test would collide a Strength food with an
Endurance food. Each dispel-flagged effect ALSO carries exactly one
discriminating keyword (`FoodDispelEffect_Strength`, `StackBuffStrength`,
`StackPsychoStrength`, `StackAlcoholStrength`, ...) — the exact-set test is
what actually isolates same-bonus pairs. Proof point: `FortifyStrengthFood`
is the shared Base Effect on 18 ALCH records spanning BOTH food and drink
(e.g. `Milk_Chally`, a drink) — same-bonus collision is genuinely
cross-category, which is why the collision check runs on `dispelKeys` for
food/drink regardless of category, and separately on category equality for
chem/alcohol (some chems/alcohols carry no dispel-flagged effect at all —
e.g. flat-HP-only items — but "one at a time" still applies to them by
category).

**Displacement is item-level, not per-effect**: a collision on any single
`dispelKeys` entry evicts the WHOLE colliding item, not just the matching
effect. This is a deliberate simplification of the game's real per-effect
dispel system (documented tradeoff, not an oversight) — revisit only if a
build genuinely needs partial multi-effect items to partially stack.

**Addiction**: each ALCH record's `Effect Data.Addiction` field (when
non-null) points directly at an `AbAddiction<Name>` SPEL — no AVIF chase
needed. `GeneratedAddiction` catalogs these
(`src/data/live/generated/addictions.json`), scoped to addictions caused by
an OBTAINABLE, in-app-selectable consumable (`causedBy`) — an unobtainable
chem's addiction (e.g. Jet, confirmed unobtainable in FO76) drops out of the
catalog automatically, no special-casing needed.

**Suppressors survive the damage gate** (2026-07-13). The consumables list
normally keeps only records with ≥1 routed modifier, but a record with an
addiction AND ≥1 `dispelKeys` entry is kept even at zero modifiers
(`extract-buffs.ts`). Rationale: taking a chem suppresses its own addiction,
dropping a Junkie's stack — so a 0-modifier chem is still a real (negative)
damage lever. Med-X buffs nothing this engine models (its only effect is
`FortifyDamageResistMedX`, unrouted), but taking it costs a Med-X-addicted
Junkie's build a stack; gating on modifiers alone dropped it entirely and left
`AbAddictionMedX` in the catalog with an empty `causedBy` and no selectable
suppressor. The `dispelKeys` half of the test is what separates a real
suppressor from a look-alike: it holds one entry per dispel-flagged MGEF, i.e.
per chem/alcohol effect actually applied. Med-X has one
(`StackMedXDamageResist`) and Nukashine has one (`AlcoholEffect`); the
unfermented-mash records (`Brew_*Ferm`) and SCORE boosters merely *reference*
an addiction while applying only rads/disease/thirst, carry no dispel-flagged
effect, and so cannot suppress anything. Net effect of the clause: Med-X +
three Nukashine variants, nothing else.

`PlayerConfig.addictions` is the player's free-form "I have this addiction"
picker selection (independent of category — any addictive item, chem or
alcohol or food/drink, can cause an addiction). `PlayerConditions.
addictionCount` (Junkie's curve input) is DERIVED, never stored:
`deriveAddictionCount` (`src/lib/player-stats.ts`) = selected addictions
minus those SUPPRESSED by a currently-active addictive consumable
(`getSuppressedAddictions`, `src/data/buffs.ts`) — suppression is
**category-agnostic** (an active chem, alcohol, food, or drink all suppress
their own addiction equally; grill-session decision, 2026-07-13) and checked
by consumable id membership in `GeneratedAddiction.causedBy`, not by
category. `resolveLoadout` overrides `addictionCount` unconditionally — the
stored `PlayerConditions.addictionCount` field only feeds synthetic engine
tests that bypass `resolveLoadout` (mirrors `hungerThirstTier`/
`strangeInNumbers`).

**Withdrawal penalties (2026-07-14)**: each addiction SPEL's own effects are
flat `Detrimental` Peak Value Modifiers on SPECIAL AVs
(`abReduce<SPECIAL><Family>Addiction`, e.g. Alcohol Addiction −1 AGI −1 CHA;
uniform across all 12 catalog families, no Class Freak gating — verified in
the 20260710 dump), extracted onto `GeneratedAddiction.modifiers` through the
same MGEF pipeline mutations use. Two bookkeeping effects are skipped by edid
(`abAddictionCount` — computed app-side by `deriveAddictionCount`;
`CA_AddictionEffect` — a no-op Script marker). Med-X/Psycho additionally
carry `abReduceDamageResistAddiction` (player DR taken) — out of scope, same
dormant-survivability category as `damage-formulas.ts`, surfaced as a note.
**Application is selection-time, not condition-time**: `assemble()`
(`src/lib/loadout.ts`) spreads `getAddictionModifiers(mode,
countedAddictions)` into the modifier list only for selected-and-unsuppressed
families — the same suppression derivation Junkie's uses — so the modifiers
themselves stay unconditional.

## Magazines & bobbleheads (2026-07-13 — `extract-buffs.ts`, `consumable-rules.ts`)

Magazines and bobbleheads are ALCH records, same as chems/food/drink/alcohol,
but carry their own dedicated keywords instead of an `ObjectType*` one —
verified live against `Magazine_GunsAndBullets07_Potion` (`MagazineKeyword`
0x001D4A70 + a per-series `MagazineType*` keyword) and
`BobbleHead_Strength_Potion` (`BobbleheadKeyword` 0x00135E6C + a per-stat
`BobbleheadType*` keyword). `classifyConsumableCategory` checks these two
keywords ahead of the chem/food/drink/alcohol ones (no observed overlap).
Every other stage of the pipeline — `buildConsumable`, obtainability, the
`isRelevant` damage/SPECIAL gate, `getBuffModifiers`, diet scaling (a no-op:
magazines/bobbleheads carry no `ingredientKeywords`) — is unchanged and fully
category-agnostic, so no new plumbing was needed beyond the keyword check.

**How the buff value resolves**, reusing existing machinery with zero new
code: SPECIAL bobbleheads (Strength, Perception, Endurance, Charisma,
Intelligence, Agility, Luck) are a direct `Peak Value Modifier` MGEF on the
plain SPECIAL AV — same `FALLBACK_AVIF_ROUTES` entry food/chems already use.
Combat magazines/bobbleheads (Small/Big Guns, Energy Weapons, Melee, Unarmed,
Explosive; Guns and Bullets, Tesla Science, Astonishing Tales, Grognak the
Barbarian, U.S. Covert Ops, Awesome Tales issues, ...) are a `Script`-archetype
MGEF with a "Perk to Apply" grant — `translateMagicEffect` already
auto-chases this into `translateGrantedPerk` (mgef.ts), the same path
`extract-omods.ts` uses for a legendary's `AttachedPerk` property. The
class-scoped weapon-damage AVs these carry (`STAT_DmgBallistic`,
`STAT_DmgHeavyGuns`, `STAT_DmgEnergy`, `STAT_DmgMeleeWeapons`,
`STAT_DmgMeleeUnarmed`) already route through `STAT_DamagePerk` (the shared
plumbing-perk mechanism); `STAT_DmgExplosive` is an existing
`FALLBACK_AVIF_ROUTES` entry. Result: 31 magazine issues and 26 extracted
bobbleheads (13 base + 13 `GHL_Glowing*` ghoul-mode duplicates, verified
mechanically identical to their base counterpart — e.g.
`GHL_GlowingBobbleHead_SmallGuns_Potion` resolves the same +20% ballistic dbm
as `BobbleHead_SmallGuns_Potion`) with a working `dbm`/`special*` modifier on
the 2026-07-13 (20260710 ESM dump) run; everything else (recipes, XP, carry
weight, crafting, hacking guesses, lockpicking, fusion-core longevity, ...)
has no route and correctly drops via the `isRelevant` gate — "DPS-relevant
only" per user decision, no hand-curated allowlist needed. The 13 `GHL_Glowing*`
duplicates are hidden from the picker via `hiddenConsumableIds`
(`overrides/corrections.ts`, 2026-07-13 user request) — being mechanically
identical, listing both is pure clutter; the base 13 stay visible.

**Sorting**: pickers order by `name.localeCompare(..., { numeric: true })`
(2026-07-13) — plain string sort put "...10" before "...2" for numbered
magazine issues; the numeric collator option sorts the embedded issue number,
not the string.

**Bonus text**: each row shows a small muted line describing what the item
actually does (`describeBuffModifiers`, `src/lib/buff-description.ts`,
2026-07-13), derived from the extracted `Modifier[]` — deliberately NOT from
the ESM's own perk/card description text, which can promise a condition the
data doesn't carry (Guns and Bullets 7's card text says "without scopes" but
its modifier is unconditional). Known-inert entries (see below) say so
inline ("— not modeled yet, no effect") rather than showing a bonus that
silently does nothing.

**Stacking**: one magazine and one bobblehead active at a time (2026-07-13,
matching the game's real buff-duration slots), independent of each other and
of chem/alcohol/food/drink — `sharesBonus` (`consumable-rules.ts`) checks
category equality alone, the same shape as the existing chem/alcohol rule
(some magazines/bobbleheads carry no dispel-flagged effect to key off of).
UI: `MagazinesSection`/`BobbleheadsSection` (`BuffsSections.tsx`), a shared
`SingleSelectBuffSection` radio-group component — the chem/alcohol radio
contract from `ChemsSection`, minus the addiction ledger those two don't need.

**Known-inert entries** (extracted, selectable, but currently 0% ΔDPS —
pre-existing `conditions.ts` gaps, not introduced by this feature; same
category as the already-shipped Hoppy Hunter IPA `enemyType` case above):
U.S. Covert Ops 8 (`ma_Knife`/`ma_Switchblade` aren't recognized by
`isWeaponTypeKeyword`'s `WeaponType*`-only prefix match), Big Guns bobblehead
(mixed `HasKeyword`/`IsTrueForConditionForm` OR-group — its now-hidden glowing
twin carries the identical gap), Awesome Tales 10 (`GetInIronSights()` — same
gap as the existing `STAT_DmgScoped` route), Live & Love 2
(`IsMemberOfAPlayerTeam()`) and Live & Love 5
(`HasMagicEffectKeyword(AlcoholEffect)`). See "Known gaps / deferred" below.

## Carnivore's / Herbivore's food scaling (2026-07-13 — `src/lib/diet-mutations.ts`)

ESM-proven end to end: `Mutation_Carnivore` / `Mutation_Herbivore` SPELs
grant Script-MGEF perks whose **"Mod Spell Magnitude"** entry points
(function Multiply Value) rescale ingested food effects:

| Perk | Spell keyword gate (tab 1) | Float |
|---|---|---|
| `Mutation_EatAllTheMeat_Perk` | `IngredientTypeMeat` | ×2.0 normal / ×2.5 SIN (`Mutation_Check_UseNormal/SuperVersion`) |
| `Mutation_EatNoVeggies_Perk` | `IngredientTypeVegetable` | ×0 |
| `Mutation_EatAllTheVeggies_Perk` | `IngredientTypeVegetable` OR `Herb` OR `Fruit` | ×2.0 / ×2.5 SIN |
| `Mutation_EatNoMeat_Perk` | `IngredientTypeMeat` | ×0 |

- **The asymmetry is real**: Carnivore only ZEROES Vegetable-tagged food —
  pure Herb/Fruit dishes keep their (undoubled) benefit under Carnivore.
- **Effect-level gate (tab 3)**: only effects whose MGEF carries
  `SURV_EffectTypeFood{Buff,Hunger,Healing}` scale — captured at extraction
  as `GeneratedBuff.foodScalableModifierIds`. Audited across all 77 meat/veg
  damage-relevant foods (2026-07-13): every `Fortify*Food` MGEF qualifies;
  the ONE exception is `Moon_Rudy_Pozole`, whose plain `FortifyCharisma`/
  `FortifyLuck` effects lack the keyword and are exempt in-game. Drinks are
  naturally exempt (their effects carry DrinkBuff-family keywords), so no
  category check is needed.
- **Engine model**: `applyDietScaling` (called from `getBuffModifiers`)
  emits ×2.0/×2.5 variants conditioned on the existing `strangeInNumbers`
  condition kind (the SIN gate is literally the same UseNormal/SuperVersion
  condition forms every mutation uses), and drops zeroed modifiers. The UI
  badges active foods (×2 diet / struck-through "no effect").
- **Mixed meat+vegetable dishes**: both entry points would apply and
  compose ×2 × ×0 = 0 for either mutation (modeled as zeroing-wins). No
  damage-relevant record carries both tags today (pinned by test) — the
  rule is shape-derived from entry-point composition, NOT measured in-game.
- **Carnivore + Herbivore together** is impossible in-game (each serum
  cures the other); the build reducer enforces the exclusivity on toggle. A
  hydrated share-URL that somehow carries both zeroes all tagged food
  (the multiplicative composition), which is the degenerate-but-consistent
  reading.
- RadX suppression of mutation effects (the `IsSpellTarget(RadX)` rows on
  the mutation SPELs) is NOT modeled — mutation selection is already the
  app's active/inactive toggle (same stance as every other mutation).

Old share URLs carrying a manual `addictionCount` in `conditions` are decoded
with that key explicitly SKIPPED (with a warning) — there's no way to map a
bare count back to specific addiction ids, so it's dropped rather than
silently winning over the (now addiction-less) picker state.


## Mutation penalties & Class Freak (2026-07-14 — `src/lib/class-freak-mutations.ts`)

ESM-proven via two parallel mechanisms (both verified in the 20260710 dump):

- **Mechanism A — generic keyword scaling** (the Carnivore's/Herbivore's
  shape again): every mutation "Reduce" MGEF (`Mutation_ReduceStrength`,
  `Mutation_ReduceMaxHealth`, the `*_Hidden` Herd Mentality set, ...) carries
  keyword `AbilityTypeMutation_NegativeEffect` (0x00391F0F) + the
  `Detrimental` flag. Class Freak's own rank PERKs (ClassFreak01/02/03 =
  0x00391F0E/0x00391F11/0x00391F12) each carry one **"Mod Spell Magnitude"**
  entry point (Multiply Value, Float 0.75/0.5/0.25) gated
  `EPAlchemyEffectHasKeyword(0x00391F0F)=1`, each rank also gated
  `HasPerk(next rank)=0` so exactly one factor applies. Extraction tags the
  affected modifiers (`GeneratedBuff.penaltyModifierIds` — keyword AND flag
  required; the keyword alone also sits on non-stat UI dummies);
  `applyClassFreakPenaltyScaling` expands each into 4 `classFreakRank`-
  conditioned variants ×1/×0.75/×0.5/×0.25 (`CLASS_FREAK_TIER_FACTORS`, the
  ESM floats with rank 0 prepended). Tagged set in this dump: EggHead (−3
  STR, −3 END), Eagle Eyes (−4 STR), Talons (−4 AGI), Marsupial (−4 INT),
  Bird Bones (−4 STR), Herd Mentality (−2 all SPECIAL while solo), Adrenal
  Reaction (−50 max HP).
- **Mechanism B — per-tier granted perks**: Grounded's
  `Mutation_ReduceEnergyDamage_Perk` bakes 4 discrete tiers ("Mod Weapon
  Attack Damage", Multiply 0.5/0.63/0.75/0.88) gated by
  `HasPerk(ClassFreak0N)` rows, scoped `WeaponTypeEnergy OR
  WeaponTypeAlienBlaster`. These extract directly: the HasPerk rows translate
  to `classFreakRank` range conditions (`=1` → rank ≥ N, `=0` → rank < N;
  ANDed rows form exact tiers), no app-side expansion. **Fold-shape
  assumption**: "Mod Weapon Attack Damage" routes to `dbm` as MUL_ADD
  (float−1), i.e. additive inside the dbm parenthesis like every other fold —
  whether the engine instead multiplies finished damage is unprovable from
  static data. Out-of-scope Mechanism B penalties: Empath (damage TAKEN),
  Twisted Muscles/Eagle Eyes accuracy, Speed Demon hunger/thirst drain,
  Healing Factor chem-effectiveness (a second-order Mod-Spell-Magnitude on
  other consumables), Bird Bones fall damage — all remain extraction notes.
- **`classFreakRank` is derived, never stored**: `deriveClassFreakRank`
  (`src/lib/player-stats.ts`) reads the equipped ClassFreak card's rank;
  `assemble()` threads it (with the derived `strangeInNumbers`) into the
  effective-weapon fold, the SPECIAL/max-HP folds, and the engine context.
- **The MGEF `Detrimental` flag now negates flat value-modifier magnitudes**
  globally (`normalize/mgef.ts`) — before 2026-07-14 every extracted
  "Reduce" effect shipped POSITIVE (EggHead read +3 STR; alcohol +1 INT).
  Damage-archetype DoTs (also flagged Detrimental) are exempt: their
  magnitude is the damage amount. A Detrimental + multi-point-curve
  combination doesn't occur in this dump and would surface as a note, not a
  silent sign guess.
- `IsSpellTarget(RadX | Serum_*)` condition rows are now CONSUMED (`=0` →
  always true, `=1` → effect dropped): RadX/serum suppression stays
  unmodeled per the existing stance that mutation selection IS the
  active/inactive toggle. This is what un-inerts the SPECIAL penalties —
  they previously carried these rows as `unresolved`.
- `IsMemberOfAPlayerTeam` translates to `teammateCount` conditions ("in a
  team" ≈ ≥1 teammate, consistent with the Strange in Numbers derivation).
  Herd Mentality's suffixed check form
  (`Mutation_Check_UseNormalVersion_HerdMentality` = generic normal check
  AND in-team) expands through the existing `IsTrueForConditionForm`
  inline-expansion path once that row translates.
- **SPECIAL folds are condition-aware** (`derivePlayerStats` now folds
  SPECIAL buckets through `foldBucket` with a context carrying the derived
  gates): penalties, Herd Mentality's team-gated bonuses, and SiN-boosted
  SPECIAL variants all reach net SPECIAL. Before 2026-07-14 ANY conditioned
  SPECIAL modifier was silently dropped from net stats (EggHead's +6 INT
  never applied).

## Target distance (Close / Far, Stage A3)

- **Native-code gate**: AVIF `STAT_DmgVsClose` / `STAT_DmgVsFar` are consumed
  by Peak Value Modifier MGEFs (`abPerkFortifyDmgClose` / `abPerkFortifyDmgFar`)
  with NO distance condition rows anywhere in ESM data — the actual close/far
  range check happens in native engine code, not in data. The only threshold
  on record is GMST `fDistanceForCloseDamage` = 850 units (≈12m, approximate —
  not cross-checked against a measured in-game range); the far threshold has
  no GMST or record at all.
- Modeled as a manual three-way `EnemyConditions.targetDistance` input
  (`'close' | 'none' | 'far'`, default `'none'`) — deliberately a player
  judgment call (eyeball whether the target reads as close-range vs far),
  not a derived/measured value, since the actual range check is opaque.
- Consumers routed to `dbm` with a baked `targetDistance` condition: Guerrilla
  family (+10/15/20%, ranged weapons only, close), Down Ranger / Rifleman
  family (+10/15/20%, far, no weapon-type gate in the ESM data), Sniper's
  legendary OMOD (+100%, far).
- **Sniper's GLOB-valued magnitude**: `BOUNTY_ench_LegendaryWeapon_Snipers`
  carries its magnitude on a Global reference (`BOUNTY_SnipersBonus` = 100),
  a separate field from `Effect Item Data`'s own Magnitude (which reads 0 for
  this effect). `parseMagicEffects` now also captures that top-level
  `Magnitude` GLOB reference and `translateMagicEffect` resolves the Global's
  `Value` before translation — a narrow, field-shape-specific fix (only
  applies when the ESM record actually carries this GLOB reference, confirmed
  absent from other "zero magnitude" effects like the Recon scopes / Move
  Speed Sights, which are genuinely script-driven with no static value).
- **Guerrilla Master was excluded from this route** at the time this stage
  shipped: its `abPerkFortifyDmgClose` effect curve-scales off the Onslaught
  stack count (AV 0x00000395), not a flat magnitude. **RESOLVED 2026-07-12**
  by the Onslaught work — see "Onslaught" below for the full curve + max-stack
  contribution.

## VATS AP economy & manual-aim hit rate (Stage B, `ap-economy.ts`)

- **AP pool**: `MaxAP = fAVDActionPointsBase (60) + fAVDActionPointsMult (10) × AGI`
  (GMSTs, 20260702 ESM).
- **Per-shot VATS AP cost**: WEAP `Data."Action Point Cost"` (extracted as
  `Weapon.apCost`). Verified: Fixer 16, Minigun 8, Super Sledge 52. No
  standard OMOD modifies it; the only rewrite is the `vatsApCost` bucket
  (V.A.T.S. Optimized, MUL_ADD −0.35, OMOD property `AttackActionPointCost` —
  previously silently dropped by `PROPERTY_IGNORED`).
- **Regen — NOT ESM-proven**: `regenPerSec = fActionPointsRestoreRate (4.0) ×
  (1 + Σ apRegen)`. The GMST is confirmed as a constant, but whether it's a
  flat AP/sec or itself scaled by the ActorValue `ActionPointsRateMult`
  (default 100, reads as a percent) is engine-side and cannot be confirmed
  from static ESM data alone. MODELED here as perk bonuses being a percent
  multiplier on the flat base rate. **Golden-case TODO**: no `expected` value
  exists yet — pin this with an in-game stopwatch measurement of AP regen
  with vs without Action Boy/Girl before trusting the absolute regen number
  (the relative uptime/apLimitedDps comparisons are unaffected by this
  ambiguity either way).
- **Action Boy/Girl**: the AV route IS correct — `AbPerkActionBoyGirl` (SPEL
  0x0004D871) is a plain Peak Value Modifier on `ActorValues` AV
  `ActionPointsRateMult` (0x00000359, Default Value 100.0), magnitude
  15/30/45 per rank, mapped via a `FALLBACK_AVIF_ROUTES` entry to `apRegen`
  at scale 0.01. As shipped in Stage B, the shared ability spell's per-tier
  gating cross-referenced the paired **ActionGirl** family's own rank records
  and came back `unresolved` (`conditions.ts`'s per-family rank-gate
  simulation had no concept of a sibling gender-variant family), so the
  modifier extracted with the right value but never fired. **FIXED in
  Stage C4** — see "Power attacks & melee cadence" below for the
  `pairedFamilyFormIds` mechanism that resolves it.
- **On-kill AP restores** (Grim Reaper's Sprint, Conductor's kill-half) are
  OUT OF SCOPE — need enemy TTK (phase 3 enemy modeling) — not computed.
- **Conductor's** (hand-supplied, `overrides/legendary-values.ts`): "Critical
  Hits Restore 10 Health & Action Points instantly and 100 more over 5
  seconds" = 110 AP per VATS crit (`apPerCrit` bucket, unconditional ADD).
  Script-computed — verified chain: OMOD `mod_Legendary_Weapon4_Conductors`
  0x007ACB0B → ENCH 0x007ACB05 → PERK `Legendary_Weapon_Conductors` → PERK
  `Legendary_Weapon_ConductorsPlayerPerk` ("Apply Combat Hit Spell" entry
  point, gated `GetLastHitCritical()=1`, not extractor-modeled) → SPEL
  `Legendary_Weapon_ConductorsPlayerRestoreSpell` 0x007ACB0D. No on-kill
  component exists on this effect (verified).
- **Steady-state model** (`computeApEconomy`): `apGainPerSec = regenPerSec +
  apPerCrit × (shotsPerSec / shotsPerCrit)` (crit AP restores scaled by crit
  cadence from the existing crit meter, `crit-meter.ts`); `drainPerSec =
  apCost × shotsPerSec`; `uptime = clamp(apGainPerSec / drainPerSec, 0, 1)`
  when drain exceeds gain, else 1 (AP is not the constraint).
  `secondsToEmpty = maxAp / (drainPerSec − apGainPerSec)` when uptime < 1.
  `shotsPerSec` reuses the SAME reload-inclusive cadence that produces
  `SustainResult.sustainedDps` (`shotsPerMag / (magDumpSec + reloadSec)`,
  `effectiveShotsPerSecond`) rather than the raw burst fire rate — AP
  continues regenerating during reload downtime even though no shots are
  draining it.
- **Display**: VATS scenario card gains an "AP-limited" line + uptime % only
  when `uptime < 1` (100% uptime means AP was never the bottleneck, so the
  line is hidden rather than shown as a no-op). Ranged weapons only —
  melee/VATS-melee AP costs and accuracy are out of scope (uptime is
  undefined for melee, so `ScenarioResult.ap` stays unset).
- **Manual-aim hit rate**: `PlayerConditions.hitRatePct` (10–100, default
  100) scales free-aim **SUSTAINED** dps only — never per-hit, never burst,
  never VATS (VATS accuracy is assumed 100%; hit-chance modeling is
  permanently out of scope — closed-box formula, see `dps-todos/ap-regen.md`).
  Models realistic misses (movement, target size): a missed shot still costs
  the time/ammo but deals no damage, so scaling the steady-state dps by the
  landed fraction is equivalent to modeling individual misses without adding
  per-shot state.

## Power attacks & melee cadence (Stage C, `paper-damage.ts` / `scenarios.ts`)

- **Power-attack race multiplier** (`powerAttackRaceMult`, `paper-damage.ts`):
  RACE-record per-attack-event "Damage Mult" on Power-Attack-flagged events —
  HumanRace **0x00013746 = 1.5**, PowerArmorRace **0x0001D31E = 2.0** (the PA
  race swap IS the multiplier; no separate perk/MGEF grants it). Multiplies
  the whole melee hit as a factor outside the dbm parenthesis, distinct from
  the additive `powerAttackBonus` bucket (Heavy Hitter's). Carve-outs proven
  in the SAME RACE records (Damage Mult stays 1.0): automatic "power tool"
  melee (`WeaponTypeAutomaticMelee` keyword — Ripper/Shredder/Auto Axe), gun
  bashes (unmodeled — no bash mechanic), and UNARMED attacks (unarmed power
  events aren't even Power-Attack-flagged in the RACE data).
- **Melee speed applies relatively** (`fire-rate.ts`): the melee fire-rate
  stub is now `1.0 × weapon.speed` instead of a flat `1.0`, so `fireRateSpeed`
  OMOD/AV rewrites (Thrill-Seeker's melee-speed AV, pre-existing "Cursed"
  event melee mods) have an effect; stock melee weapons carry `speed: 1.0` so
  unmodified behavior is unchanged. Absolute swing timings are still
  unmeasured (`dps-todos/melee-cadence.md`).
- **Charged (4★ melee, `mod_Legendary_Weapon4_Melee_Charged` 0x00885C6A)**:
  has NO enchantment — its whole payload is 4 ADDed keywords, the mechanic
  trigger being `WeaponHasSecondaryCharging` (KYWD 0x0089A83D), engine-native
  via Default Objects (no extractor change needed: `effective-weapon.ts`
  already merges OMOD `addedKeywords` onto `weapon.keywords`). Damage curve
  CURV 0x008A3B85 (`misc/curvetables/json/legendarymods/weapon_chargedmeleeattack.json`):
  charges 1/2/3 → **+0.5/+1.5/+3.0** damage bonus (multiply the releasing
  power attack by `(1 + y)`), max 3 charges; the detonation VFX itself deals
  0 damage. **1-charge-per-light-attack is an INFERENCE** — no rate field
  exists anywhere in ESM data for this mechanic. Modeled as a steady-state
  cycle (`scenarios.ts`, like the crit meter): 3 normal (non-power-attack)
  hits + 1 full-charge detonation hit (full power-attack treatment ×
  `(1 + 3.0)`), averaged over the 4-attack cycle and fed into `burstDps` /
  `sustainedDps` (melee has no magazine, so they're the same number); the
  displayed `perHit` stays the plain non-cycle hit (simplest defensible
  split — a "per hit" number can't represent an average-of-two-hit-types
  cleanly). **Applies regardless of the `isPowerAttacking` toggle** — the
  cadence IS the optimal play pattern for a Charged weapon, a deliberate
  choice (not derived from data) so the DPS reflects real steady-state play
  rather than requiring the player to also flip the power-attack toggle.
- **Thrill-Seeker's** (`RA_mod_Legendary_Weapon4_ThrillSeeker` 0x00863AA2):
  ENCH 0x008AF3A6 carries 10 exact-match tiers,
  `GetValue(killStreak=0x00000399) Equal To N` for N=1..10, magnitude
  **0.03×N** on two parallel AVs — `weaponSpeedMult` (melee attack speed) and
  `WeapReloadSpeedMult` (reload speed), both routed via `FALLBACK_AVIF_ROUTES`
  (`mgef.ts`) to `fireRateSpeed`/`reloadSpeed` at scale 1 (the magnitude is
  already the decimal fraction). The Equal-To tiers translate to a new
  **`killStreakCount` condition**, evaluated against
  `PlayerConditions.adrenalineStacks` (the app's kill-streak counter) — the
  SAME counter the Adrenal-family curves use, since FO76 has one kill-streak
  stat, not a separate "Thrill-Seeker's tracker". An always-on
  `abEnableKillStreak` effect (AV `EnableKillStreak`) contributes no number
  and stays note-only/unrouted. Because `fireRateSpeed`/`reloadSpeed` are
  normally UNCONDITIONAL weapon-stat rewrites (receiver stats — see "Fire
  rate" above), `effective-weapon.ts`'s `foldWeaponStat` had to become
  condition-aware (Stage C3) — it now shares `resolve.ts`'s `effectiveValue`
  instead of reading `m.value`/`m.curve` directly, so the exact-count tiers
  gate correctly instead of summing all 10 unconditionally (a bug this stage
  fixed before it could ship). `buildEffectiveWeapon` gained optional
  `player`/`enemy` parameters (defaulted via `createDefaultPlayerConditions`/
  `createDefaultEnemyConditions`) threaded from `resolveLoadout`.
- **Action Boy/Girl cross-family rank gate** (`conditions.ts` /
  `extract-perks.ts`, Stage C4 — resolves the Stage B leftover): the shared
  ability SPEL `AbPerkActionBoyGirl` (0x0004D871) grants 3 magnitude tiers
  (15/30/45), each gated by HasPerk rows spanning BOTH families' own rank
  formids (verified 20260702 dump — e.g. rank-1's tier-2 gate is
  `OR[HasPerk(ActionBoy02)=1 | HasPerk(ActionGirl02)=1]` AND
  `HasPerk(ActionGirl03)=0`). `ConditionTranslationContext` gained an
  optional `pairedFamilyFormIds` list; a HasPerk row on it — single or inside
  an OR-group — resolves **as if the paired family's rank mirrors the rank
  being simulated** (the player owns ONE gender's card at a time). Pairing is
  a small hardcoded map (`GENDER_TWIN_PAIRS` in `extract-perks.ts`:
  `ActionBoy ↔ ActionGirl`) rather than inferred from "Boy"/"Girl" substring
  matching (fragile) — Party Boy/Girl is the only other such pair in the dump
  and produces zero modifiers today (its "double/triple alcohol effects"
  mechanic isn't bucket-routed), so it needs no pairing. Result: each rank now
  emits exactly ONE unconditional `apRegen` modifier (0.15/0.30/0.45), not
  the previous 3-tiers-all-unresolved-and-inert shape — verified in
  `generated/perks.json` after re-extraction.

## Onslaught (shared stack mechanic, 2026-07-12)

The Onslaught stack counter is engine-hardcoded: raw actor value **0x00000395**
has no AVIF record at all (no name, no default/min/max — a bare slot the
engine reads/writes directly). MESG `HelpOnslaught` 0x007EE004 documents the
build/decay rule in player-facing text: **+1 stack per direct hit, −1 stack
per second**, engine-native — NOT modeled here (there's nothing to model: no
formula, no GMST, just an engine counter ticking). The app's Onslaught-stacks
**slider IS the steady-state input**, standing in for "whatever the counter
settles at during sustained play" the same way `adrenalineStacks`/
`bulletStormStacks` already stand in for their own kill-streak/steady-state
counters. **Base max = 0 is an INFERENCE** (no record defines a starting cap;
every contributor is a positive ADD, and the counter is clearly worthless with
no cap at all) — not ESM-proven, flagged here per policy.

**Max-stack mechanism**: Perk Entry Point 190 "Mod Max Consecutive Hits
Allowed" (function "Add Value") is identical across every contributor — it
ADDs a flat amount to the shared cap. New IR: `Bucket.onslaughtMaxStacks`
(base 0), folded ONCE per scenario input (`scenarios.ts`) and carried on
`ResolveContext.onslaughtMaxStacks`; exposed on `ScenarioSet.onslaughtMaxStacks`
for the UI slider. All ten contributors, verified against the 20260702 dump:

| Source | Chain | Max | Per-stack bonus |
|---|---|---|---|
| Guerrilla Expert (PERK `GuerrillaExpert01` 0x0031AF04 → SPEL `AbPerkGuerrillaExpert` 0x0031BE56) | +3 | curve (0,0)(1,0.01)(100,1.0) on 0x395 → +1%/stack reload speed (`AbPerkFortifyReloadSpeedMult` → `WeapReloadSpeedMult` → `reloadSpeed` bucket); gated `WeaponTypeRanged` |
| Guerrilla Master (PERK `GuerrillaMaster01` 0x0031AF08 → SPEL `AbPerkGuerrillaMaster` 0x0031BE57) | +5 | curve (0,0)(1,5)(100,500) on 0x395 → +5%/stack dbm at close range (`abPerkFortifyDmgClose` → `STAT_DmgVsClose` → `dbm` + `targetDistance:'close'`); gated `WeaponTypeRanged`. Previously left **unresolved** in `_meta.json` ("curve with unmapped input AV 0x00000395") — resolved by the new `onslaughtStacks` CurveInput |
| Gunslinger Expert (PERK `GunslingerExpert01` 0x0031AEFD → SPEL `AbPerkGunslingerExpert` 0x0031BE53) | +3 | curve (0,0)(1,1.0)(100,100.0) on 0x395 → +1%/stack weak-spot damage (`AbPerkFortifyDmgWeakSpot` 0x007C92C6 → AV `STAT_DmgVsWeakSpot` 0x007C92C5, already routed to `weakpointBonus` scale 0.01 for Pin-Pointer's — no new route needed); gated `WeaponTypeRanged` |
| Gunslinger Master (PERK `GunslingerMaster01` 0x0004A09F) | +10 | NONE — EP190 is its ONLY effect. Its "gain stacks over time / spend on attack" behavior (per its own in-game description) is engine-opaque script logic with no other ESM footprint — max contribution only |
| Furious (OMOD `mod_Legendary_Weapon1_DmgConsecutiveHits` 0x004F577D → ENCH 0x006C3173 → Script MGEF 0x006C3174 "Perk to Apply" → PERK 0x006C3175) | +9 (EP190 Add Value 9.0) | EP189 "Mod Damage on Consecutive Hits" (function "Add Actor Value Mult") 0.01 → +1%/stack dbm |
| Pounder's (OMOD `mod_Legendary_Weapon4_Melee_Pounders` 0x007ACB3E → ENCH 0x007ACB3A → MGEF 0x007ACB3C → PERK 0x007ACB3F; EP190/EP189 both gated `GetIsPlayer=1` (consumed — always true for a player-granted perk) + `HasKeyword HasLegendary_Weapon_Pounders` self-check, added by the OMOD's own Keywords property) | +10 | EP189 0.01 → +1%/stack dbm |
| Splinter's Special Effect (OMOD `P62_Mod_Custom_Splinter_SpecialEffect` 0x00802189, built into the unique weapon `P62_crTheDrifter10mmSMG` "Splinter" → ENCH 0x0080219B → MGEF 0x00802198 → PERK 0x00802199; both effects carry NO Perk Conditions — unconditional once equipped) | +10 | EP189 0.01 → +1%/stack dbm |
| Whacker Smacker (OMOD `E09B_mod_Custom_WhackerSmacker` 0x0068311F → ENCH 0x00914F55, effect `AbFortifyPowerAttack` reads the shared AV 0x395 DIRECTLY as its curve input — no EP190 at all) | +0 (grants none) | curve (0,0)(1,5)(100,500) → +5%/stack power-attack damage (AV `STAT_DmgPowerAttack`, already routed to `powerAttackBonus` scale 0.01); needs an EXTERNAL max-stack source to do anything (verified: equipped alone, `onslaughtMaxStacks` stays 0 and the curve reads 0) |

**Route B nuance** (Furious/Pounder's/Splinter's EP189): the function reads a
PRIVATE per-effect AV, not the shared 0x395 — `LGND_Furious` 0x006C3172
(Furious), `Legendary_Pounders_ConsecutiveHits` 0x007ACB37 (Pounder's),
`P62_Weapon_Splinter_MaxConsecutiveHits` 0x0080219A (Splinter's). Every one of
these MGEFs' descriptions says "per Onslaught stack", and there is no way to
prove the private counter's update cadence from static ESM data (it's engine
script logic) — so we **ASSUME the private counters tick in lockstep with the
shared one** and model EP189 as reading the shared counter via the existing
`{ kind: 'stacks', counter: 'onslaught', max: 99 }` condition (max 99 is a
value the shared counter can never reach; the REAL clamp is the equipped cap,
applied by the `onslaught` reader in `resolve.ts`). Their AVIF Maximum Values
(45/100/100 on the private AVs) look like template authoring boilerplate —
ignored; the shared max governs everywhere.

**Sentinel default**: `PlayerConditions.onslaughtStacks` uses `-1` to mean
"follow the computed max" (assume full stacks — the app's existing
assume-max convention, matching `adrenalineStacks`/`bulletStormStacks`).
Non-negative = an explicit user selection from the Onslaught-stacks slider
(`ConditionsSection`), clamped to the current max at read time — both by the
`onslaught` StackCounter reader (via `resolve.ts`'s `effectiveOnslaughtStacks`)
and by the slider's own displayed value. With **zero equipped sources**, the
computed max is 0, so every consumer (the counter AND the `onslaughtStacks`
curve input, which reads the identical clamped value) is inactive regardless
of the stored value — verified (`onslaughtStacks: 10` stored, max 0 → no bonus).

**esm CLI quirk — misattributed Entry Point fields** (found via `esm get
--raw` byte inspection on `GuerrillaExpert01`/`GuerrillaMaster01`): when a PERK
record's Effects list pairs an "Ability" grant with an "Entry Point" effect,
the raw subrecord bytes show the Entry Point's own trailing group (PRKC/CTDA
"Perk Conditions" + EPFT/EPFD "Float") ALWAYS immediately follows its own
`PRKE`+`DATA` (an Ability entry is always a bare `PRKE+DATA+PRKF` triple with
no scalar param of its own — abilities don't carry a Float in this game). But
the esm tool's JSON serializer attaches that trailing group to the PRECEDING
Ability entry instead of the following Entry Point whenever Ability comes
first in the array (`GuerrillaExpert01`/`GunslingerExpert01` — Ability then
Entry Point); it's accidentally correct when Entry Point already comes first
(`GuerrillaMaster01`/`GunslingerMaster01`). 30 PERK records carry this pattern
game-wide. Fixed via `repairMisattributedPerkEntryFields`
(`normalize/mgef.ts`, applied in both `extract-perks.ts`'s `getEffects` and
`translateGrantedPerk`'s perk-effect gather): Perk Conditions are COPIED onto
the Entry Point (the Ability grant still needs its own copy — that's what the
shared PRKC actually gates in-game), Float is MOVED (Abilities never consume
it). Without this fix Guerrilla/Gunslinger Expert's EP190 would read Float 0
(no max contribution) and no gate.

**`p62_` was NOT a junk prefix** — found chasing Splinter's OMOD, which
extracted with zero modifiers despite `hasEnchantments: true` until this was
fixed. `extract-omods.ts`'s `OMOD_JUNK_EDID_RE` blanket-excluded every `p62_`
editor id pre-obtainability, silently dropping Splinter's Special Effect OMOD
(and Chaos Engine's/Tempest's, plus an unrelated new legendary-effect family:
Rebounders, Crusaders, Metabolic, Brutalists, Satiated, SightSeers, Ruiners,
OverLoaders, Voltaic, StaggerProof — all real Named records in the 20260702
dump). Removed from the regex; obtainability derivation is the real gate
either way (some of the newly-surfaced weapon-side legendaries — Ruiner's,
Sightseer's, Brutalist's, Satiated — now extract `obtainable: false` pending
their own rescue-list review, out of scope for this pass).

**Splinter/Chaos Engine/Tempest weapon visibility** (found investigating
Splinter): all three `P62_crTheDrifter*` weapons were in `hiddenWeaponIds`
with a comment claiming "NPC use only" (their only direct reverse refs are an
own NONPLAYABLE LVLI + the shared QUST `P62_TheDrifter_Quest`). That's the
signature of a script-driven on-defeat loot grant (VMAD, invisible to `esm
refs`), and all three extract `obtainable: true` — but the P62 content drop
("The Drifter" encounter) **never released**, so the entire family is
unobtainable regardless of what the record graph implies. Briefly un-hidden
during the Onslaught pass, RE-hidden 2026-07-12 (user-confirmed). Splinter's
Special Effect stays modeled in the Onslaught table above for when P62 ships,
but no player can equip it today. Same verdict for the P62 weapon-side
legendaries (Ruiner's, Sightseer's, Brutalist's, Satiated — `obtainable:
false` is CORRECT, no rescue needed), and for **Combo-Breaker's**
(`mod_Legendary_Weapon4_Melee_ComboBreaker`, a 4★ melee AP-cost-gamble effect
that exists in the ESM but was never added to the player legendary pool —
hidden in `corrections.ts`, user-confirmed 2026-07-12).

**Guerrilla Expert's reload-speed bonus is now functionally wired**
(2026-07-14, closing the perk weapon-stat fold gap): `resolveLoadout`'s
`assemble` gathers perk/legendary-perk/mutation/consumable modifiers BEFORE
`buildEffectiveWeapon` and passes them in as a `loadoutModifiers` parameter;
the weapon-stat buckets (`reloadSpeed`/`fireRateSpeed`/`isAutomatic`/
`projectileCount`/`ammoCapacity`/`vatsApCost`/`animDurationSec`) fold from
OMOD + loadout sources together, then are dropped from the downstream
modifier list exactly like OMOD weapon-stat modifiers always were (exported
`WEAPON_STAT_BUCKETS` set is the single bucket list). This activates
Guerrilla Expert, Gun Tricks, Swift-Footed, Speed Demon's reload, and any
future perk/buff in that shape; `GroundPounder`/`MartialArtist`/`Swinger`
still carry `unresolved` conditions (`IsTrueForConditionForm`,
`GetWeaponAnimType`) so they stay inert until those are mapped. Two
assumptions in the fold: (1) it evaluates against RAW player conditions, not
the buff-derived SPECIAL (no known weapon-stat source reads a SPECIAL-input
curve; derived stats would create a resolveLoadout ordering cycle), and
(2) Onslaught-curve inputs (Guerrilla Expert) read a stack cap
bootstrap-folded from `onslaughtMaxStacks` inside `buildEffectiveWeapon`,
mirroring `scenarios.ts` (cap sources are never onslaught-gated, so cap-0
bootstrap is exact). Loadout modifiers never feed keyword merging or
DamageTypeValues component materialization — those stay OMOD-only semantics.
Guerrilla Master's dbm curve and Gunslinger Expert's weakpoint curve were
never affected (`dbm`/`weakpointBonus` fold from the full modifier list
regardless of source kind).

**Martial Artist & Ground Pounder condition mapping (2026-07-14)** — the two
previously-`unresolved` gates were ESM-walked and mapped:

- **`GetWeaponAnimType() ≤ 6`** (Martial Artist's melee gate; the extractor's
  old raw string "=6" had dropped the operator). The function reads WEAP
  `Data."Weapon Type"` — the anim-type enum. A sweep of all 282 roster
  weapons' raw values (2026-07-14) shows FO76 uses ONLY: 0 HandToHandMelee,
  1 OneHandSword, 5 TwoHandSword, 6 TwoHandAxe, 9 Gun, 10 Grenade. The
  FO4/GECK-era ranged values 4–5 do NOT apply here — every true ranged weapon
  (bows and crossbows included) is 9. So ≤6 = melee/unarmed exactly, EXCEPT
  the gun-animated melee oddities **Paddle Ball** and **War Shrike** (anim 9,
  melee keywords) which the perk correctly does NOT buff — this is why the
  condition is modeled as the game-faithful `weaponAnimTypeMax` (new
  Condition kind, evaluated against `Weapon.animType`) instead of a
  keyword/class translation. `animType` maps app-side from the extracted
  `weaponTypeName` via `ANIM_TYPE_VALUES` (`src/data/live/weapons.ts`) —
  verified-name-only table; unknown names fail closed. Swinger shares the
  gate but is cut content (`hasCard: false`, user-confirmed) — translated
  incidentally, still hidden.
- **`IsTrueForConditionForm(SmallGun_Actor_Condition)`** (Ground Pounder's
  reload gate). The CNDF decodes to `(WornHasKeyword WeaponTypeRifle OR
  WeaponTypeShotgun OR WeaponTypePistol) AND NOT WeaponTypeHeavyGun`. The
  extractor now pre-fetches referenced CNDFs (`resolveConditionForms`,
  normalize/mgef.ts) and inline-expands a standalone `=1` reference — ONLY
  when the form's rows translate completely (`tryExpandConditionForm`,
  normalize/conditions.ts); partially-translatable forms (Perk_Day/
  Night_Condition's time-of-day rows) and OR-group-embedded references
  (GHL feral-rage, the STAT_DamagePerk heavy-gun route) keep their
  unresolved fallback unchanged, and `=0` (negated) references never expand
  (negating an AND/OR list has no IR representation).

## SPECIAL & perk budget (2026-07-12 — `src/lib/player-stats.ts`)

Rules (user-confirmed 2026-07-12; second pass superseding the brief
derive-from-perks experiment):

- **Base allocation is user-defined**: 1–15 per stat (SPECIAL section
  steppers), from a pool of 7 base points (1/stat) + 49 level-ups = **56**.
  The reducer clamps to 1–15 and refuses raises past the pool.
- **Legendary SPECIAL cards** (LGN_Legendary*_Perk, added to the registry —
  they have no known N&D URL key, so imports can't carry them): +1/+2/+3/+5 by
  rank, ON TOP of base (stat may exceed 15) AND that many extra perk points —
  the perk-point budget per stat is `min(15, base + legendary bonus)`. Their
  PERK records carry no effects — the bonus is applied in
  `baseSpecialOf`/`legendaryBonusOf` (`loadout.ts`/`perk-budget.ts`), so
  there's no double-count with the `specialX` buff buckets. Other SPECIAL
  boosts (consumables, gear) never grant perk points.
- **Effective SPECIAL** (engine + stat summary) = base + legendary bonus +
  `specialX` buff-bucket folds. STR feeds melee, LCK the crit meter, END the
  HP formula.
- **Card point costs are PCRD data, not rank** (2026-07-13): each card's
  per-rank cost comes from its PCRD record's `Card Rank Cost` entries
  (`GeneratedPerkCard.costs`), joined by perk formid in
  `scripts/extract/extract-perks.ts` and folded in `derivePerkBudget`. Rank-1
  Tenderizer costs 2 CHA points; Rifleman Expert/Master ("Scoped-up"/"Smart
  Shot") cost 2/3. Legendary PCRDs also carry costs, but those belong to the
  perk-coin system and never feed the SPECIAL budget.
- **The PCRD `Perks[]` list is the LIVE shape of a card** (user-confirmed
  2026-07-13): 28 rebalanced ("compressed") cards record fewer entries than
  the family has PERK ranks (LifegiverCard 0x0000BB40 lists a single rank at
  cost 2 while LifeGiver01-03 exist) — the surplus ranks are dead content
  from before the rebalance, NOT missing data. `maxRank` clamps to the entry
  count (`derivePerkRegistry`), and `card.rankSources` maps each card rank to
  the family PERK record backing it (`getLoadoutModifiers`). The one
  non-identity mapping in the 20260710 dump is StarchedGenes: its single live
  rank is the family's old rank-2 record (`rankSources: [2]`).
- **Antibiotic / Conductor / Light Meal are NOT live cards** (user-confirmed
  2026-07-13): their PCRDs exist in the ESM (0x003D295E / 0x0077B579 /
  0x0077B57A) but the cards are unreleased — the record graph cannot
  distinguish shipped from unshipped content, so they deliberately get no
  PerkId (pinned as expected orphans in `perk-cards.test.ts`).
- **Card SPECIAL/rank counts are PCRD-derived** (2026-07-13): the PerkId
  registry keeps display names only; special/maxRank/costs come from the
  extracted card data at dataset build (`derivePerkRegistry`). The ESM wins
  over folk knowledge — e.g. Tenderizer is a 1-rank Charisma card in the
  20260710 dump.
- **Blocking**: in-app card slotting past a stat's budget or the 6 legendary
  slots is refused by the reducer (and disabled in the picker). N&D imports
  are NOT blocked — violations show the "over budget" badge; the URL's `s=`
  SPECIAL param is merged (clamped to 1–15).
- **Race-restricted cards** (2026-07-14 — `src/data/perk-race.ts`,
  `Perk.raceRestriction`): 52 perk families (regular + legendary, e.g. Quick
  Hands/Natural Resistance/Ghoulish human-only, Wild West Hands/Battle-Genes/
  Radioactive Strength/ActionDiet/FeralRage ghoul-only, WhatRads human-only)
  carry a PCRD "Race Restriction" enum, joined verbatim as
  `card.raceRestriction` (`extract-perks.ts`) — this is card-level ESM data,
  NOT derived from `playerIsGhoul` modifier conditions (most of these cards
  have no modifiers at all to scan). The reducer refuses `perk/add` for a card
  locked to the other race (picker greys it out with a lock + "human/ghoul
  only" label); switching race (`race/set`) instead prunes whatever no longer
  fits, after a confirm dialog listing what's removed
  (`SpecialLoadoutSection.tsx`'s `RaceControl`) — the user's choice is never
  silently overridden. N&D import (`build/importNd`) replaces perks AND race
  together, resolved by the importing UI from the link's own race lock
  (`equippedRaceLock`); it only confirms first when that changes the current
  race or the link mixes both races (an invalid link — the user picks which
  race to import as, and the other race's cards are pruned).

## Max HP (derived, 2026-07-12 — `src/lib/player-stats.ts`)

Max HP is no longer a manual input: `resolveLoadout` derives it and the Build
column's stat summary displays the same number.

- **Base formula: `245 + 5 × effective END`** — user-supplied convention
  (2026-07-12), NOT ESM-proven (the level-scaling GMSTs weren't chased).
  Effective END = base END + `specialEndurance`-bucket buffs.
- **`maxHealth` bucket** (new): MGEF Peak Value Modifiers on AV `HealthBonus`
  0x007B74E4 route here (`normalize/mgef.ts`). Extracted sources in the
  20260702 dump: Lifegiver (END-keyed curve `Perks\LifeGiverBonus.json`:
  (1,10)(15,120)(30,180)(60,230)(100,250), all ranks — the new `endurance`
  CurveInput, AVIF 0x000002C4), Nocturnal Fortitude (+50/+100), Spotlight.
- **Lifegiver ranks 2/3 are dead content** (2026-07-13): the live
  LifegiverCard PCRD records a single rank, so the effect-less LifeGiver02/03
  PERK records (whose "+30/+45 total" existed only in descriptions) are
  unreachable — their former `overrides/perk-overrides.ts` flat-total entries
  were removed. Rank 1's END-keyed curve is the whole live effect.
- Consumers: Juggernaut's `healthCurrent` curve X (`healthPercent/100 ×
  maxHealth`) and the displayed HP stat. The engine's `?? 300` fallback only
  serves synthetic tests that bypass `resolveLoadout`.

## Ghoul Glow (2026-07-13 — `glowAtLeast`, Conditions slider)

Glow is the ghoul resource stored in the **Rads actor value (0x000002E1)**;
ghoul perk effects gate on it with `GetValue(Rads) ≥ N` condition rows.

- **Max Glow = max HP** — user-stated convention (2026-07-13), NOT ESM-proven
  (no cap record was chased). The Conditions slider ranges 0..derived
  `maxHealth` and `resolveLoadout` clamps the stored value to it.
- **Thresholds are absolute**: literals (160–520 across GHL_ActionGhoul,
  GHL_GlowingCriticals ≥180, GHL_MadScientist, GHL_RadiationPower, …) and
  GLOB-resolved spend gates (GHL_BasicGlowUse=5, GHL_PowerGlowUseBasic=50).
  All translate to `{ kind: 'glowAtLeast', min }` in
  `normalize/conditions.ts`; only `Greater Than Or Equal To` occurs on player
  perks in the 20260710 dump.
- **Spend gates are steady-state**: a `≥5`/`≥50` "can afford the ability"
  gate passes whenever the slider is at/above the cost — the calculator
  doesn't model Glow drain over time.
- **Still unresolved by design**: GHL_RadioactiveStrength's
  `OR[IsTrueForConditionForm(GHL_HasModerateGlowConsumptionFeralRage_Condition) | GetValue(Rads)≥GLOB]`
  rows and GHL_PlayerPerk's `GetRadshieldPercentage()=0` (7 rows total) —
  badge as unresolved in the UI, engine skips them.

## Elemental 2★ effects & enemy-status 4★ rework (20260710 patch)

- **Cryologist's / Poisoner's (2★, `STAT_DmgMultCryo`/`STAT_DmgMultPoison`
  ADD 0.2)**: user-confirmed semantics (2026-07-12) — additive into the
  general dbm parenthesis but scoped to the matching damage type only (a
  laser gun with a gamma-emitter fire component gains Pyro-Technician's on
  the fire portion and its DoT, not the energy portion). Modeled as dbm ADD
  with a `damageTypeScope` condition, the same per-component fold as
  Demolition Expert. `STAT_DmgMultEnergy`/`STAT_DmgMultFire` are pre-routed;
  the weapon-side Pyro-Technician's OMOD (`mod_Legendary_Weapon2_Fire`) has
  NO attach point and no attachable wrapper in the 20260710 dump — it is not
  in the weapon legendary pool yet, so it correctly does not extract.
- **Pyromaniac's / Viper's / Icemen's / Severing (4★)** were reworked from
  ENCH properties to plumbing AVs (`STAT_DmgVsBurning`/`Poisoned`/`Freezing`/
  `Bleeding`, ADD 50 = +50% dbm gated on the enemy's active status effect).
  Icemen's is a REAL balance change: pre-patch it was +20% cryo-scoped
  damage; now +50% vs frozen targets.

## Resist mitigation (dormant scaffolding)

- `DamageResistMult = clamp((dmg × 0.15 / resist)^0.365, 0.01, 0.99)` — the
  factor clamps to [1%, 99%] of paper damage (user-confirmed), so paper damage
  is never fully realized nor fully negated.

## Body parts (BPTD-extracted, 2026-07-12 — `scripts/extract/extract-bodyparts.ts`)

- **Per-enemy multipliers are real data now**: RACE → "Body Part Data" BPTD →
  per-part `Damage Mult` (`bodyparts.json`, curated race list). Humanoid head
  (Human/Feral Ghoul/Scorched/Mole Miner/Scorchbeast) = 1.5×; Super Mutant /
  Yao Guai / Behemoth / Wendigo / Mothman / Mirelurk head = 1.25× (their torso
  0.9×); Deathclaw belly 1.35×; Assaultron head 0.5×, Combat Inhibitor 0.25×;
  Mirelurk shell 0.15×. The Target section's enemy + part picker resolves the
  engine's `weakpointMult` from this; no pick = the custom multiplier input
  (default 1.5, the standard humanoid headshot — was 2.0 pre-2026-07-12).
- `ctx.bodyPart` now discriminates by direction: mult > 1 → `weakpoint`
  (weakpointBonus applies), mult < 1 → `limb`, exactly 1 → `torso`. Weakpoint-
  ness and location are still ONE axis — torso-weakpoint enemies (UC
  Abomination belly) remain a future refinement so torso-scoped bonuses
  (Center Masochist) can stack with weakpoint multipliers there.
- **Body-part hit rate** (`bodyPartHitRatePct`, default 100): while aiming at
  a body part, each hit blends `rate × aimed-part + (1−rate) × torso`
  (`scenarios.ts bodyPartBlendedHit`, all scenarios incl. the Charged cycle).
  Only the on-target leg carries the attribution trace — `explain` shows the
  landed-hit chain (same simplest-defensible split as the Charged cycle).
  Independent of free-aim `hitRatePct`, which still scales free-aim sustained
  DPS only.
- Crippled-limbs input caps at the picked race's `crippableLimbCount` — the
  number of *distinct* BPTD Data."Actor Value" limb conditions among its
  non-torso parts (10 when no race picked — Storm Goliath has 8 crippable of
  9 total damageable parts). A part with no Actor Value is armor/weakpoint
  flavor only (e.g. the Ogua's ×0.1 shell), not a trackable limb; two named
  zones sharing one condition (the Ultracite Titan's Chest+Belly, both
  EnduranceCondition) count once. Bully's/Tormentor's ESM `perCrippledLimb`
  max stays 6 — limbs 7+ add no damage from those sources.
- **NoCripple** (`NoCripplePerk` PERK `0x004121E8`, "Mod Incoming Limb Damage"
  ×0 — or the bare `NoCripple` KYWD `0x00248D2D`): the actor takes zero limb
  damage, so none of its parts can be crippled. No BPTD flag encodes this —
  it's hand-authored per curated target (`crippleImmune` in
  `CURATED_TARGETS`) on Blue Devil, Bigfoot, and the Deathclaw Matriarch
  (`Burn_E01_EncDeathclawMatriarch`; the plain "Deathclaw" entry shares
  `DeathclawRace` but not this NPC-scoped perk, so it stays crippable).
- **EN06 Guardian**: only 2 of its 8 BPTD parts carry a real Actor Value — the
  "Ultragenetic Shield System" (weak point, crippable) and the Torso (×3, not
  crippable — matches the "torso can't be crippled" in-game behavior). Its
  other 6 parts are perk-gated phantoms (`RD01_Enc01_PreventLimbDamage_Perk`
  `0x0077459D` zeroes their damage mult and — while a `DamageState` keyword is
  absent — the torso's too) dropped via `conditionPartsOnly`. The in-game
  "torso is damage-immune until the shield generator breaks" phase gate is
  **not modeled** — this is a steady-state paper-DPS calc with no phase
  scripting; exposing both parts and picking the shield generator is the
  closest approximation.
- Auto-receiver crit/sneak base MUL_ADDs are −20% (user-confirmed correct;
  the −30% applies to AttackDamage/DamageTypeValues).
- Shishkebab max Eligible Level 45 confirmed by user — item level clamps there.

## CAMP resource generators & consumable chains (2026-07-14 — `obtainability.ts`)

Audit of all 211 `_meta.excludedDetailed` records against the 20260710 dump. Weapons
(92) and omods (83) were all true negatives; consumables had three missing grant routes,
now derived. None of these values are assumptions — each is an ESM-proven reference
chain — but the *rules* are judgment calls worth recording:

- **RESO = player-obtainable.** A RESO ("Resource") is a workshop generator's produce
  list: `ALCH ← LVLI ← RESO`, with a buildable machine behind it (COBJ
  `ATX_workshop_co_*` + CONT `ATX_CAMP_Collector_*`). All 52 RESO records in the ESM are
  player workshop resources (water/food/scavenge/ammo/junk + the ATX camp machines), so a
  RESO terminal always proves access. Without it every camp-machine food (Nuka-Cola
  Quantum Candy, Slice of Birthday Cake, Lucky-Leaf Tea, …) read as an NPC loadout list.
- **A dispensing ACTI counts only if the player can BUILD it** — i.e. a non-junk COBJ
  constructs it (`SCORE_S22_SarsaparillaMachine` ← `SCORE_S22_workshop_co_Resources_…`).
  Never recursed, so a world activator that merely holds a loot list can't launder access.
- **ALCH → ALCH ferment/spoil chains are followed.** A brew's aged state is referenced
  only by the state it ages from (`co_Gulpershine` crafts Ferm → Fresh → Vintage).
- **CHAL (challenge) referencers deliberately do NOT count.** Challenges are authored
  against cut content too. This is what keeps Firecracker Whiskey out (below).

Deliberate stay-hidden calls (user-confirmed 2026-07-14):

- **Firecracker Whiskey** (Fresh/Manhattan/Old Fashioned) — unshipped. Its
  `co_Brewing_FirecrackerWhiskey*` recipes carry **no `Created Object` field at all**
  (`co_Brewing_WhiteRussian` does), so nothing creates `Brew_FirecrackerWhiskeyFerm` and
  the whole aging chain is dead; both plan BOOKs are unreferenced. Its only referencers
  are `POST_Challenge_*` records — the same "POST" unshipped bucket as the never-shipped
  Stun Pack mods. Pinned by a regression test.
- **Calmex Silk** (`DLC04_Calmex`) — 4 placed world REFRs, no recipe/loot list/vendor.
  Placed refs alone stay insufficient (the standing `placedRef` rule).
- **`LGN_BrawlingChemist_Chem01`–`04`** ("Super Chem MK I–III") — internal effect-carriers
  for the Brawling Chemist legendary perk; never enter inventory.

Two rescues are script-granted and can never be derived — they live in
`corrections.ts` `forceVisibleConsumableIds`: **Chally's Milk** (VMAD
`BrahminRaceMilkingScript` property) and **Roast Chicken** (`Storm_SE09_ChickenExplosion`
spawns the ALCH via its *Placed Object* field; following EXPL referencers in general
would let every creature death-explosion through).

## OMOD eligibility & recipe chains (2026-07-14 — `cobj-index.ts`, `isEligible`)

COBJ-anchored rework of which mods the picker offers and which count obtainable
(dps-todos/omod-eligibility.md + omod-obtainability-chains.md). ESM ground truth
walked live against the 20260710 dump:

- **A COBJ cannot name a target weapon.** Standard mod recipes carry no CTDA
  conditions and no restricting workbench keyword — the linkage is only
  `Created Object` → OMOD. Per-weapon gating lives entirely in the OMOD
  (attach point + Target OMOD Keywords). So "recipe exists" (`hasGrantingCobj`,
  emitted on generated omods) is a diagnostic, never an eligibility input.
- **`Learn Recipe From` is polymorphic by `Learn Method`**: the plan BOOK
  (method 4 — `co_mod_AssaultRifle_Receiver_FastTrigger-CritDMG` → BOOK
  0x00000871), the explicit scrap source (method 1 —
  `co_mod_BlackPowder_Rifle_Bayonet` → WEAP `BlackPowder_Rifle`), or the
  `recipe_Dummy_Uncraftable_Item_NOCRAFT` MISC stub on non-craftable records —
  the field-based NOCRAFT signal (`isNonGrantingCobj`), stronger than the
  legacy `_REPAIRONLY`/`NOCRAFT` edid regex.
- **`Repair Method` 5 is NOT a NOCRAFT marker** — real scrap-learnable recipes
  (`co_Weapon_Ranged_NWOT_ThirstZapper`) carry it too. Never gates.
- **Mod boxes substitute for recipe knowledge** (user-clarified 2026-07-14): a
  Learn-Method-0 COBJ whose `Learn Recipe From` is the NOCRAFT dummy is not a
  learnable recipe, yet the mod is still player-slottable whenever a matching
  loose-mod / mod-box MISC item (referenced from the COBJ or the OMOD) is in
  inventory — e.g. all ~40 non-standard Enclave plasma mods (quest drops,
  vendor stock). Obtainability for these flows through the MISC reverse-ref
  chain, so `hasGrantingCobj: false` on them is *correct*, and neither
  `hasGrantingCobj` nor COBJ-learnability in general may ever gate app-side
  eligibility or visibility.
- **Vendor recipe pools run ~8 LVLIs deep** (BOOK → `LLS_Recipes_*` → … →
  `Vendor_LC060_Whitespring_BoS` → CONT), so the BOOK chase uses its own
  `BOOK_LVLI_DEPTH_CAP = 10` while the general LVLI cap stays 4 (NPC-loadout
  laundering keeps failing fast). FLST exclusion lists (`BabylonExcludeList`
  names every plan) and the teaching COBJ itself never count as book proof.

Picker eligibility (`isEligible`, `src/data/omods.ts`): attach point must be on
the weapon; keyword-scoped mods use the game's own subset gate
(`targetKeywords ⊆ weapon.keywords`); **empty-keyword mods match nothing by
default** — they're offered only where the weapon's own Object Template
whitelists them (`templateModFormIds`) or an `omodWeaponRestrictions` entry
rescues them (reward-granted identity mods with no record-level refs, e.g. the
V.A.T.S. Unknown variants). Previously empty keywords matched every weapon
sharing the attach point — the "Vox Syringe Barrel on a gauss minigun" bug
class. Slots left with zero eligible mods disappear from the picker emergently
(`buildSlots` only groups surviving options).

Picker display policy (user decision 2026-07-14, superseding the earlier
"hide pure utility" rule — dps-todos/omod-nondps-stats.md): **show ALL
valid + obtainable mods**, including zero-DPS ones (sights, grips,
AP-cost-only parts) — genre convention, and AP-cost/armor-pen wiring is
planned. A zero-modifier non-stock mod now renders badged `inert` instead of
being hidden (`classifyOmodDisplay`). Two curated exceptions, not ESM-proven
but swept roster-wide: `ap_Gun_UniversalOffset_Range` (mechanic removed from
the game; every option stat-less) and `ap_Weapon_Model_Replacement` (pure 3D
reskins) are excluded wholesale in `buildSlots`
(`DEAD_MECHANIC_SLOT_EDIDS`), and the four `mod_Legendary_Crafting_Weapon*`
reroll placeholders (mojibake workbench machinery on `ap_Legendary_Reroll`)
are hand-hidden in `hiddenOmodIds`.

Weak-evidence review (user decision 2026-07-14: **flag, never auto-hide**): an
obtainable standard-slot mod whose only proof is riding along on its weapon
(`weap:`/`omod:` signals, no seat in `defaultModFormIds`) lands in
`_meta.json` `reviewFlagged.omodWeakEvidence` each extraction; confirmed cut
content is hand-hidden via `hiddenOmodIds` with a source comment.
Identity/paint/legendary slots are exempt — inherited-only evidence is normal
there.

## Attach-point closure (2026-07-14 — `ap-grant-index.ts`, `applyAttachPointClosure`)

A WEAP record's own `"Attach Parent Slots"` lists only the points available on
the bare frame — the game grants most real slots through *installed mods*: an
OMOD's `Data."Attach Parent Slots"` lists attach points that open once that
mod is equipped (walked live, 20260710: `HuntingRifle` 0x0004F46A lists only
`ap_gun_Receiver` + cosmetic/legendary APs; its receiver 0x002DEB09 grants
grip/scope/front-sight/casing/mag). Copying the WEAP field verbatim silently
dropped whole slot families on 136 of 282 weapons (Hunting Rifle scopes, The
Fixer's Barrel/Grip/Mag/Muzzle/Scope, the tester-reported ".44/10mm/10mm
SMG/assault rifle have only a receiver slot" class).

`weapons.json.attachParentSlots` is therefore a **fixpoint closure**, not the
raw field:

- **Seed** = WEAP's own slots ∪ each template/default mod's own attach point
  (a part the weapon ships with must have a valid slot — the Hunting Rifle's
  default barrel sits on `ap_gun_Barrel`, absent from its WEAP list) ∪ the
  slots those mods grant.
- **Iterate**: every eligible mod whose attach point is currently available
  contributes its granted slots, until stable (receiver → barrel → muzzle
  chains). Eligibility is the **shared picker predicate**
  (`src/data/omod-eligibility.ts`, imported by both `extract-weapons.ts` and
  `src/data/omods.ts` `isEligible`) so extractor and picker can never drift.
- The paper model wants the union over all reachable mod configurations —
  per-configuration availability (does a *specific* barrel gate the muzzle?)
  is deliberately out of scope; the picker treats all closure slots as always
  present, same as every other loadout tool.
- **Contributor gate is structural only** (shared
  `classifyOmodRecordExclusion`: dev/junk prefixes incl. `zzz`/`cut_`,
  authoring templates, non-weapon mods; unnamed records seed but never
  iterate). Full OMOD obtainability *cannot* gate here — it's computed in the
  omods pass, which itself needs `obtainableWeaponFormIds` from the end of
  the weapons pass (circular). Accepted residual risk: a real-Name,
  non-junk-prefix but actually-unreleased donor mod could open a slot.
- Seed/closure over-generation is structurally inert: several donors grant
  APs no mod targets (the Fixer's receiver grants
  `ap_gun_InternalMod*_OBSOLETE`) — harmless because `buildSlots` is
  OMOD-driven, not AP-driven: an attach point with zero eligible mods never
  creates a picker slot. No seed restriction needed, and slot-list growth in
  `weapons.json` is expected to be much broader than the picker-visible diff.
- Restrictions-rescued mods (`omodWeaponRestrictions`, app-layer) are not
  consulted by the closure: none grant attach points, and extract scripts
  must not import override modules.
- Cost note: the index does one OMOD `list`+`bulkGet` before the weapons
  pass (so `--only weapons` now touches OMOD records), warming the client
  cache the omods pass reuses.

## Unique weapons (2026-07-13 rework — base weapon + `ap_customName` mod)

- The game's registry is the `WeaponsUniqueNamedList` FLST (0x00789213,
  "Unique Named Weapons for Data Validation"): one LVLI per reworked unique
  (e.g. `LL_Weapon_Melee_SuperSledge_TheDebilitator`), each granting the
  **base** WEAP. The unique's identity + effects ride a `mod_Custom_*` OMOD
  at `ap_customName` (0x0047A264) carrying the `ObjectTypeUnique` keyword,
  which the base weapon lists in `templateModFormIds`. Each unique = one
  effect mod + a paint (user-confirmed); owned pre-rework items were
  auto-converted by the game, so the legacy standalone WEAP records are dead
  for everyone — their stats are stale and must not be shown.
- Dead legacy WEAPs classify `obtainable: false` via the obtainability rule
  that `_REPAIRONLY`/`*NOCRAFT*` COBJ refs are non-granting (they leave a
  `noGrantCobj:` audit signal). Caveat: a NOCRAFT scrap recipe no longer
  proves ownership either — records like ProtestSign01 survive via
  independent FLST refs. Five E08B legacies have real-looking but themselves
  unreferenced COBJs the heuristic can't catch — hand-hidden in
  `corrections.ts` `hiddenWeaponIds`, needs periodic manual re-review.
- Still-live standalone uniques (WEAP listed directly in the FLST and/or real
  grant refs, kept in the roster): `CombatRifle_Fixer` (its mod is hosted only
  by its own template; base CombatRifle has no ap_customName slot),
  `10mm_CircuitBreaker`, `MoM_BladeOfBastet`, `MoM_VoiceOfSet_44`,
  `MTNS05_PipeSyringer_Vox`, `atx_alienprobe`, `BlackPowder_Rifle_Dragon`.
  `MoM02B_HistoricSword` stays hidden (user decision). The Fancy Pump Action
  Shotgun / Fancy Single Action Revolver are NOT reworked uniques — they are
  script-granted (Pleasant Valley bellhop-protectron ticket exchange,
  user-confirmed) and rescue-listed with their stat mods.
- Cold Shoulder's real effect is `mod_custom_Coldshoulder_DmgvsCryptid`
  ("Paranormal Mod", 3 modifiers) on base `DoubleBarrelShotgun` — NOT the
  `mod_DoubleBarrelShotgun_barrel_short_Base_ColdShoulder` barrel record,
  which is a cosmetic stub that never attached to the base weapon.
- App-side, identity uniques surface as the "Unique" mod slot
  (`getOmodSlots`: `ap_customName` + `ObjectTypeUnique` + template
  membership, additive to the pre-existing `modifiers.length > 0` cosmetic
  gate). An equipped unique renames the weapon in the Build summary and
  results header (`effectiveWeaponName`).
- Unique-mod effect extraction: OMOD property 116 = attached PERK (decoded
  via `translateGrantedPerk`); `ActorValues` `Health` ADD → `maxHealth`
  bucket (All Rise +50). Deliberately note-only (no formula bucket):
  damage-TAKEN perks (Unstoppable Monster's DR-per-killstreak — see
  "Incoming DPS" future stream), `EnableAmmoSpenderOnKill` (Final Word's
  Bullet Storm enable flag — boolean AV, not a stack cap),
  `STAT_DeflectChance` (Old Guard), sneak/detection AVs (Fixer's
  `ArmorShadowHide`, `Mod_StealthMove_AV`). All carry omod `notes` and badge
  `'inert'` in the picker via the notes fallback.
- Xerxo's Gamma Ray Gun is currently unobtainable in-game (user-confirmed)
  and hidden. Base `GammaGun` IS obtainable in-game but is excluded from
  extraction as `noDamage` — its damage lives on the projectile explosion,
  which the engine doesn't model (see Known gaps).

## Known gaps / deferred

- **Taking One for the Team / Follow Through**: the families still extract
  with empty `modifiers` (the extractor doesn't yet follow the
  `Select Spell`/`Perk to Apply` chain to the hidden debuff/companion perks —
  see mgef → wholeDamage mapping, scripts/extract/normalize/mgef.ts), but both
  cards are no longer inert — a manual uptime slider models their effect
  directly in `assemble()` (`src/lib/loadout.ts`); see the manual-input table
  above. Same "registry entries are display/slotting-only" gap applies to the
  rest of the legendary perks.
- **Taking One for the Team's bundled enemy DR debuff**: the same companion
  perk that grants the attacker's damage-taken bonus ALSO applies a
  `Peak Value Modifier` DamageResist debuff to the attacker (Detrimental,
  10s, no Energy Resist component) — esm-walk-confirmed magnitudes
  **-6 / -10 / -15 / -50** DR at ranks 1–4 (MGEF
  `LGN_TakingOneForTheTeam_DamageIncrease_Effect01-04`, formIds
  0x005A5DEF/0x005B01AB-AD). The 6→10→15→**50** progression is non-arithmetic
  (steps of ~4–5 then a jump of 35) — plausibly a data-entry anomaly, not
  confirmed intentional. Not modeled here (no enemy DR/ER mitigation exists
  yet); scoped to `dps-todos/phase-3-enemies.md` §3.3 for whoever wires
  `armorPen`/enemy resistance.
- Enemy DR/ER, armor pen, race-gated damage (`enemyType` conditions evaluate
  to inactive), range falloff, limb targeting: deferred by plan.
- `DamageTypeValues`/`AttackDamage` elemental conversions are modeled — see
  "Mixed damage-type OMOD conversion (DamageTypeValues)" above.
- SPECIAL-scaled perk entry points ("Add Actor Value Mult" on player perks)
  are skipped and noted per-perk in `generated/perks.json` notes.
- A handful of `cr`-prefixed creature/event DoT curves (non-level X domain,
  up to 540) and a few niche unique-mod damage curves remain unmapped: Pirate
  Punch (lockpicking-tier gimmick — see the dedicated bullet below), Eat The
  Rich (NPC-only reward from Head Hunts, not player-obtainable), PA battery
  drain (no DPS/AP/HP impact — see "Curve tables override hardcoded values"
  above).
- Unjoined registry perks (removed/renamed by the overhaul):
  `getUnjoinedPerkIds()` in `src/data/perk-modifiers.ts`.
- `GammaGun` (obtainable in-game, craftable) is excluded as `noDamage`: its
  WEAP record carries no direct damage — the payload is the projectile's
  explosion, and projectile/explosion damage is unmodeled. Revisit alongside
  explosive-weapon damage support.
- **Pirate Punch / lockpick skill (2026-07-13, deferred — user decision)**:
  `E08B_mod_Custom_Blackpowder_PiratePunch`'s enchantment
  (`AbPerkFortifyDmgPistolsNonAuto`) is a real, ESM-proven curve — "+5%
  Damage per Lockpick Skill" — but extracts with zero modifiers because its
  curve input AV (`0x0032CB37`, lockpick skill) isn't in `CURVE_INPUT_AVS`
  (mgef.ts). Landing it needs, mirroring the SPECIAL-stat curve pattern
  (`derivePlayerStats`/`SPECIAL_BUCKETS`, `PLAYER_STATE_READERS` in
  resolve.ts): a `lockpickSkill` `CurveInput` + `PlayerConditions` field, a
  `CURVE_INPUT_AVS` entry for `0x0032CB37`, and a new aggregation step
  (Locksmith base + Picklock/Picklock Expert/Picklock Master ×1 each +
  Master Infiltrator + the lockpick magazine [`Tumblers Today`, excluded
  today as `consumableNoCategory`/no route] + the lockpick bobblehead
  [extracted as `bobblehead` category but excluded by the `isRelevant` gate
  today — `STAT_Lockpicking` has no route]). Master Infiltrator's real
  per-rank grant needs ESM verification before implementing — its card text
  reads "+3 Lockpick and Hacking skills" at EVERY rank (`LGN_MasterInfiltrator_Perk`,
  all 4 ranks, `src/data/live/generated/perks.json`), which conflicts with a
  "+1/rank at ranks 2–4" recollection; do not trust either without walking
  the ESM (`esm-walk` skill) for the actual granted magnitude.
- **A handful of magazine/bobblehead buffs are extracted but currently
  inert** (2026-07-13, see "Magazines & bobbleheads" above for the full
  list) — pre-existing `conditions.ts` translation gaps (an OR-group mixing
  `HasKeyword`/`IsTrueForConditionForm`, native engine boolean functions like
  `GetInIronSights()`/`IsMemberOfAPlayerTeam()`/`HasMagicEffectKeyword(...)`,
  and `isWeaponTypeKeyword`'s `WeaponType*`-only prefix missing the parallel
  `ma_*` weapon-archetype keyword namespace used by U.S. Covert Ops 8's
  Fist/Knife bonus). Widening `isWeaponTypeKeyword` to recognize `ma_*` would
  fix U.S. Covert Ops 8, but that helper is shared by every extractor
  (perks/omods/legendary effects) — deliberately NOT done here to keep this
  feature's diff scoped to magazines/bobbleheads; revisit as its own change
  with a full dataset diff review.

## Future DPS streams (user-supplied rationale, 2026-07-07)

Perks that look "unjoined/inert" today but belong to calculation streams not
yet modeled:

| Stream | Sources | Notes |
|---|---|---|
| Limb-damage DPS | Scattershot, Modern Renegade, Enforcer | `limbDamage` bucket exists but scenarios never target limbs yet |
| Bash-damage DPS | Bear Arms, Basher | bash attacks unmodeled |
| Bullet Storm peak DPS | Bringing Out the Big Guns | raises max stacks 10→20 (slider allows 20; auto-raise pending) |
| Melee via SPECIAL buffs | Radicool (+STR) | SPECIAL buffs are manual inputs for now |
| DR→unarmed synergy | Barbarian, Bodyguards (+ Iron Fist) | DR increases unarmed/fist damage with Iron Fist; Pain Train counts as unarmed under the hood |
| Deflect/Reflect return damage | Ricochet, Bullet Shield, Reflective 4★ | scales with DR (ER & other resists reduce incoming but do NOT boost return) |
| Reload-inclusive sustained DPS | Gun Runner (move speed → Fast Fighter reload), Rapid | DPS across multiple magazines |
| VATS uptime | Field Surgeon (stim HP/s vs Blood Sacrifice HP cost) | AP/HP economy modeling |
| Ghoul Glow economy | Breathe It In (rad resist → Glow gain) | feeds Glow spenders, not a direct damage term |
| Low-health damage | Nerd Rage (damage + DR, still exists per user) | no ESM family joined — locate its current record/values |
| Incoming DPS / survivability | Unstoppable Monster (DR + DR/killstreak), Ricochet-class DR sources | model enemy→player damage so damage-TAKEN effects stop being note-only (user request 2026-07-13) |
- Mutation SPECIAL side-effects (Egg Head etc.) are not applied — SPECIAL is
  a manual input; set it to your buffed values.
