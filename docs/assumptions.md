# Damage Engine Assumptions

Everything the calculator asserts that is not directly proven by ESM data.
Each item should eventually be confirmed or corrected by an in-game golden
measurement (`src/lib/engine/__tests__/golden/`).

## Formula structure (user spec, engine: `src/lib/engine/paper-damage.ts`)

```
PaperDamage = Σ_components base(c) × ( dbmFold(c) + Tenderizer + (CritMult−1)[crit]
              + (SneakMult−1)[sneak] + PowerAttackBonus + STR term[melee] )
              × Π wholeDamage × BodyPartMult × (1 + weakpointBonus)[BodyPartMult>1]
              × PowerAttackRaceMult[melee power attack]
```

- **Bucket fold** (`resolve.ts`), user-confirmed:
  `result = (last SET ?? base) + (Σ MUL_ADD) × base + Σ ADD`.
  Multiple MUL_ADDs stack additively with each other, and MUL_ADD always
  multiplies the ORIGINAL base — even when a SET replaced it (Speed base 2.0
  with SET 0.8248 / MUL_ADD 0.3 / ADD 0.5 → 0.8248 + 0.6 + 0.5 = 1.9248).
- **Curve tables override hardcoded values**: any OMOD property carrying a
  curve table ignores its flat value. Such properties are flagged in
  `_meta.json` and skipped (162 mods, mostly flaming/level-scaled elemental
  mods) rather than extracted wrong.
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
- Explosive-on-projectile weapons (grenades, mines) are excluded until the
  EXPL-chase work; flagged `projectileOnly` in `_meta.json`.

## Fire rate (approximate — `src/lib/fire-rate.ts`)

- Auto: `speed / 0.11`; semi: `speed / Attack Delay Seconds`; melee: 1.0/s stub.
- The historical 0.8248 "physical" multiplier is actually `SET Speed <value>`
  on automatic receiver OMODs — applied from each weapon's own mod data, not
  hardcoded. The value DIFFERS per weapon family (user: Handmade vs Assault
  Rifle use different values; heavy guns don't get it; Meltdown/V63 carbine
  do despite being energy) — always confirm via OMOD lookups, never assume.
- Stock weapons with no receiver selected use the WEAP record's base stats;
  whether in-game stock configurations include a default receiver's stats is
  unverified.

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

| Effect | Input (X) | Curve | Notes |
|---|---|---|---|
| Bloodied | current HP fraction (AV 0x392) | (0.05 → +130) … (1.0 → 0) | linear between points; clamped below 5% HP |
| Nerd Rage! | current HP fraction | (0.05→80, 0.2→40, 0.8→1, 1.0→0) | perk had zero magnitude — curve is the value |
| Junkie's | addiction count (AV 0x1EB998) | (1→10 … 10→100) | +10%/addiction up to +100% at 10; the addiction COUNT itself is uncapped in-game (an active chem suppresses its own addiction — consumables-overhaul work) |
| Aristocrat's | caps on hand (AV 0x393) | 0→0 … 17000→30 … 29000→50 | up to +50% at 29k caps |
| Juggernaut's (`mod_Legendary_Weapon1_DamageViaHealth`) | ABSOLUTE current HP (AV 0x2D4) | (0→0, 1000→100) | linear +0.1%/HP; player max-HP input defaults to 300 (typical non-bloodied build) until a Max HP field lands |
| Unarmored-target (`mod_Legendary_Weapon1_DamageUnarmored`) | enemy DamageResist (AV 0x2E3) | extracted | INERT: curve input reads 0 until enemy defenses land |
| Adrenal (legendary weapon, `mod_Legendary_Weapon1_Adrenal`) | kill streak (AV 0x399) | (0→0, 1→10, 10→100) | +10%/stack; curve domain confirms the kill-streak cap of 10 |
| Adrenaline (perk, `Adrenaline01`) | kill streak (AV 0x399) | (0→0, 1→10, 10→100) | +10%/stack — same trigger as the mutation/legendary, own value |

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
| Furious | INERT, badged 'pendingMechanic' — its real mechanic is Onslaught stacking (shared with Pounder's, Gunslinger/Guerrilla Expert+Master), deferred rework. Old wiki override (+5%/hit, max 9) deleted | ESM: Script ENCH, no curve |
| Instigating | +100% dbm vs full-health target | ESM effect description text; matches in-game behavior |
| Two Shot | extracted ENCH values flow through: dbm +0.75 and projectileCount +1. The extra projectile feeds NO damage term yet (per-projectile modeling deferred), so displayed effect = flat +75%. Wiki claims +25% — golden case `two-shot` (`expected: null`) awaits in-game measurement | ESM ENCH (extracted 2026-07-02) |
| Anti-Armor (`mod_Legendary_Weapon1_ArmorPenetration`-family) | −50% target armor via OMOD property `ActorValues ADD ArmorPenetration 50.0` → `armorPen` bucket (0.5). INERT until enemy DR lands, badged 'needsEnemyDefenses' | ESM OMOD property |
| Bleed/burn/shock mod DoTs | Damage-archetype MGEFs → `dotDamage` bucket with magnitude, `durationSec`, element from the MGEF Resist Value. INERT until a DoT model lands | ESM (extracted) |
| Adrenal Reaction (mutation) | +5% dbm per KILL STREAK stack, cap 10 (+6.25%/stack with Strange in Numbers) | ESM curves Mutation_Adrenal_Normal/_Super are 5/stack linear (their x-range past 10 is unreachable — the counter caps at 10, user-confirmed + legendary Adrenal curve domain); hand-carried because the CLI's curve↔effect association is shifted on this record |
| Tenderizer | +10% dbm per stack, manual stack input 0–1000 | ESM magnitude 0.1 (PerkTenderizer01Spell); stacking cap per user spec |
| SPECIAL buffs (Buffout +2 STR/+2 END, Bufftats +3 STR/+3 END/+3 PER, Mentats +2 INT/+2 PER, Berry Mentats +5 INT) | flat unconditional ADDs folded into player STR/LCK in `resolveLoadout` (STR → melee term, LCK → crit meter); PER/END/CHA/INT/AGI stored-inert until perk-SPECIAL scaling. NO stacking/exclusivity enforcement — chems-one-at-a-time and same-keyword replacement land with the consumables overhaul | ESM Peak Value Modifier magnitudes (extracted) |
| Juggernaut's max-HP input | `PlayerConditions.maxHealth` defaults to 300 (typical non-bloodied build) when unset | assumption pending a Max HP UI field |

## Resist mitigation (dormant scaffolding)

- `DamageResistMult = clamp((dmg × 0.15 / resist)^0.365, 0.01, 0.99)` — the
  factor clamps to [1%, 99%] of paper damage (user-confirmed), so paper damage
  is never fully realized nor fully negated.

## Body parts (future refinement)

- Current model: manual-aim normal hit = generic torso (non-weakpoint), VATS
  hit = generic weakpoint; `bodyPart` conditions gate on that label.
- Reality (user): torso CAN be the weakpoint depending on the enemy (UC
  Abomination torso/belly, EN06 Guardian's torso after shield break, deathclaw
  belly, super mutant head...). When enemy body-part data lands, model
  location (torso/head/limb) and weakpoint-ness as separate axes so
  torso-scoped bonuses (Center Masochist) stack with weakpoint multipliers on
  torso-weakpoint enemies.
- Auto-receiver crit/sneak base MUL_ADDs are −20% (user-confirmed correct;
  the −30% applies to AttackDamage/DamageTypeValues).
- Shishkebab max Eligible Level 45 confirmed by user — item level clamps there.

## Known gaps / deferred

- **Power attack race multiplier** is a ×1.0 placeholder (`paper-damage.ts`);
  the additive powerAttackBonus bucket works. RACE-record research pending.
- **Taking One for the Team / Follow Through**: no matching perk families in
  the 20260702 ESM under those names — likely renamed/removed by the combat
  overhaul. The `wholeDamage` bucket is implemented and tested; wire the
  actual sources once identified.
- Enemy DR/ER, armor pen, race-gated damage (`enemyType` conditions evaluate
  to inactive), range falloff, limb targeting: deferred by plan.
- `DamageTypeValues` OMOD property (elemental barrel conversions) not yet
  modeled — flagged per-mod in `_meta.json`.
- SPECIAL-scaled perk entry points ("Add Actor Value Mult" on player perks)
  are skipped and noted per-perk in `generated/perks.json` notes.
- Unjoined registry perks (removed/renamed by the overhaul):
  `getUnjoinedPerkIds()` in `src/data/perk-modifiers.ts`.

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
| Ghoul Glow economy | Breath It In (rad resist → Glow gain) | feeds Glow spenders, not a direct damage term |
| Low-health damage | Nerd Rage (damage + DR, still exists per user) | no ESM family joined — locate its current record/values |
- Mutation SPECIAL side-effects (Egg Head etc.) are not applied — SPECIAL is
  a manual input; set it to your buffed values.
