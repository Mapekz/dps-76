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
| Explosive (2★) | `explosivePayload` (0.2 = 20% of damage as explosive) spawns an explosive twin PER damage component, folded through the full paper formula (dbm/crit/sneak/power-attack/whole-damage) plus explosive-only bonuses: `damageTypeScope: ['explosive']` dbm modifiers (Demolition Expert) and the `explosionMult` bucket (SCAV! rank 4/5). Twins sum into today's totals; each stays a separate component so it can face its own resist once enemy mitigation lands (Stage A1, `paper-damage.ts`) | ESM LGND_ExplosivePayload OMOD property; Demolition Expert's own dbm bonus is NOT extracted (empty ranks in generated data — needs its own chase before it does anything) |
| Crippling / Basher's | values extracted to `limbDamage` / `bashDamage` buckets — INERT until limb targeting / bash attacks are modeled | ESM STAT_DmgLimbs / STAT_DmgBash |
| Pyromaniac's / Viper's | +50% dbm while the target has ≥1 active fire / poison effect (`enemyHasActiveEffect`; UI checkboxes "Target is burning/poisoned", default off). Viper's `HasPerk(ImmuneToPoison)=0` target row is CONSUMED — a generic target is assumed vulnerable to poison | ESM granted-perk chase (conditions wired 2026-07-11) |
| Last Shot | +100% dbm while firing the magazine's last round (`lastRound` from `GetLoadedAmmoCount()=0` + `IsNextClipLastShot`; UI checkbox, default off). Steady-state DPS does NOT model the once-per-magazine cadence — the toggle shows the boosted hit | ESM granted-perk chase (conditions wired 2026-07-11) |
| Encircler's | +10%×N dbm from `enemyGroupCount` tiers (==1..4, ≥5 → +50%). `EnemyConditions.groupTargetCount` defaults to **1** (the target itself counts as a group of one → +10% baseline), matching `GetGroupTargetCount`'s minimum for an engaged target | ESM granted-perk ability spell (conditions wired 2026-07-11) |
| Fencer's (melee) | +12.5%–50% dbm from exact `teammateCount` tiers (==0..3). The ESM's `GetDistance < 2500` (~35m) rows on Potential Players are CONSUMED — teammates are assumed in range when the count is set | ESM granted-perk ability spell (conditions wired 2026-07-11) |
| Mutant's / Gourmand's / Lucid | curve-driven dbm on new inputs: `mutationCount` (derived from the selected mutation list), `hungerThirstTier` (UI field, 0–8, default 0), `feralTier` (UI field, 0–8 ghoul meter, default 0). Gourmand's is human-only (`playerIsGhoul` false gate from GetIsPlayerGhoul()=0; "Ghoul character" checkbox, default off) | ESM curves; input AVs MutationCount / HungerThirstTier / GHL_FeralTier |
| Two Shot | extracted ENCH values flow through: dbm +0.75 and projectileCount +1. The extra projectile feeds NO damage term yet (per-projectile modeling deferred), so displayed effect = flat +75%. RESOLVED 2026-07-10: user-confirmed ×1.75 (Fixer @50: 103 → 180.25), golden case `Two Shot Fixer @50` asserts it; the old wiki +25% claim was wrong | ESM ENCH (extracted 2026-07-02) + user confirmation |
| Anti-Armor (`mod_Legendary_Weapon1_ArmorPenetration`-family) | −50% target armor via OMOD property `ActorValues ADD ArmorPenetration 50.0` → `armorPen` bucket (0.5). INERT until enemy DR lands, badged 'needsEnemyDefenses' | ESM OMOD property |
| Bleed/burn/shock mod DoTs | Damage-archetype MGEFs → `dotDamage` bucket with magnitude, `durationSec`, element from the MGEF Resist Value. **Refresh-only model** (user-confirmed, Stage A2): re-applying resets the timer rather than stacking, so the steady-state contribution while continuously attacking is the summed magnitude — INTERPRETED as damage/sec, NOT ESM-proven (the ESM only proves the total-over-duration magnitude, not a per-second rate). Displayed as a separate "DoT +X/s" line; burst per-hit and sustained DPS are unchanged. Folded per weapon-component damage type (every extracted entry carries exactly one `damageTypeScope` type) so it only counts on a weapon that actually deals that type | ESM (extracted); dmg/sec interpretation + refresh-only rule are ours |
| Adrenal Reaction (mutation) | +5% dbm per KILL STREAK stack, cap 10 (+6.25%/stack with Strange in Numbers) | ESM curves Mutation_Adrenal_Normal/_Super are 5/stack linear (their x-range past 10 is unreachable — the counter caps at 10, user-confirmed + legendary Adrenal curve domain); hand-carried because the CLI's curve↔effect association is shifted on this record |
| Tenderizer | +10% dbm per stack, manual stack input 0–1000 | ESM magnitude 0.1 (PerkTenderizer01Spell); stacking cap per user spec |
| SPECIAL buffs (Buffout +2 STR/+2 END, Bufftats +3 STR/+3 END/+3 PER, Mentats +2 INT/+2 PER, Berry Mentats +5 INT) | flat unconditional ADDs folded into player STR/LCK in `resolveLoadout` (STR → melee term, LCK → crit meter); PER/END/CHA/INT/AGI stored-inert until perk-SPECIAL scaling. NO stacking/exclusivity enforcement — chems-one-at-a-time and same-keyword replacement land with the consumables overhaul | ESM Peak Value Modifier magnitudes (extracted) |
| Juggernaut's max-HP input | `PlayerConditions.maxHealth` defaults to 300 (typical non-bloodied build) when unset; a Max HP field exists in the Conditions UI | default kept per 2026-07-10 review |

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
  explicitly out of scope per the plan). Models realistic misses (movement,
  target size — `dps-todos/ap-and-accuracy.md`'s 30–70% miss note): a missed
  shot still costs the time/ammo but deals no damage, so scaling the
  steady-state dps by the landed fraction is equivalent to modeling
  individual misses without adding per-shot state.

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
  unmeasured (`dps-todos/fire-rate.md`).
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

**Guerrilla Expert's reload-speed bonus extracts correctly but is not yet
functionally wired**: `buildEffectiveWeapon` only folds `reloadSpeed` (and the
other weapon-stat buckets — `fireRateSpeed`/`isAutomatic`/`projectileCount`/
`ammoCapacity`/`vatsApCost`) from OMOD-sourced modifiers, called before perks
are even gathered in `resolveLoadout` — a PRE-EXISTING architecture gap (also
affects `GHL_GunTricks`, `GroundPounder`, `MartialArtist`, verified still
present in the current dump), not introduced by this work. Fixing it means
threading perk-sourced weapon-stat modifiers through the same fold, which
touches every perk in that shape, not just Guerrilla Expert — left as a
known gap rather than a scope-creeping fix. Guerrilla Master's dbm curve and
Gunslinger Expert's weakpoint curve are NOT affected (`dbm`/`weakpointBonus`
fold from the full modifier list regardless of source kind).

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
