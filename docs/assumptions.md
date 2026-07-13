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

## Fire rate (`src/lib/fire-rate.ts`) — CLOSED 2026-07-13

- Auto: `speed / 0.11`; semi: `speed / Attack Delay Seconds`; melee: 1.0/s stub
  (melee timing is the only open scope left, `dps-todos/fire-rate.md`).
- **Confirmed** against 30+ user-supplied in-game Pip-Boy Fire Rate readings
  across base weapons and weapon+mod combos, across both the live
  (2026-07-02) and PTS (2026-07-10) dumps: Pip-Boy Fire Rate =
  `(effectiveSpeed / cycleConstant) × 10`, rounded. The overwhelming majority
  use `cycleConstant = 0.11` (auto) or the weapon's own `Attack Delay
  Seconds` (semi), exactly as implemented. Full weapon-by-weapon tables in
  `dps-todos/fire-rate.md`.
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
| Explosive (2★) | `explosivePayload` (0.2 = 20% of damage as explosive) spawns an explosive twin PER damage component, folded through the full paper formula (dbm/crit/sneak/power-attack/whole-damage) plus explosive-only bonuses: `damageTypeScope: ['explosive']` dbm modifiers (Demolition Expert) and the `explosionMult` bucket (SCAV! rank 4/5). Twins sum into today's totals; each stays a separate component so it can face its own resist once enemy mitigation lands (Stage A1, `paper-damage.ts`) | ESM LGND_ExplosivePayload OMOD property; Demolition Expert's own dbm bonus is NOT extracted (empty ranks in generated data — needs its own chase before it does anything) |
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
| Bleed/burn/shock mod DoTs | Damage-archetype MGEFs → `dotDamage` bucket with magnitude, `durationSec`, element from the MGEF Resist Value. **Refresh-only model** (user-confirmed, Stage A2): re-applying resets the timer rather than stacking, so the steady-state contribution while continuously attacking is the summed magnitude — INTERPRETED as damage/sec, NOT ESM-proven (the ESM only proves the total-over-duration magnitude, not a per-second rate). Displayed as a separate "DoT +X/s" line; burst per-hit and sustained DPS are unchanged. Folded per weapon-component damage type (every extracted entry carries exactly one `damageTypeScope` type) so it only counts on a weapon that actually deals that type | ESM (extracted); dmg/sec interpretation + refresh-only rule are ours |
| Adrenal Reaction (mutation) | +5% dbm per KILL STREAK stack, cap 10 (+6.25%/stack with Strange in Numbers) | ESM curves Mutation_Adrenal_Normal/_Super are 5/stack linear (their x-range past 10 is unreachable — the counter caps at 10, user-confirmed + legendary Adrenal curve domain); hand-carried because the CLI's curve↔effect association is shifted on this record |
| Tenderizer | +10% dbm per stack, manual stack input 0–1000 | ESM magnitude 0.1 (PerkTenderizer01Spell); stacking cap per user spec |
| SPECIAL buffs (Buffout +2 STR/+2 END, Bufftats +3 STR/+3 END/+3 PER, Mentats +2 INT/+2 PER, Berry Mentats +5 INT) | flat unconditional ADDs folded into player STR/LCK in `resolveLoadout` (STR → melee term, LCK → crit meter); PER/END/CHA/INT/AGI stored-inert until perk-SPECIAL scaling. Selection-level stacking/exclusivity (one chem/alcohol at a time, same-bonus food/drink displacement) is enforced in `src/lib/consumable-rules.ts` — see "Consumable stacking & addictions" below | ESM Peak Value Modifier magnitudes (extracted) |
| Juggernaut's max-HP input | `PlayerConditions.maxHealth` is DERIVED (see "Max HP") and shown read-only in the Character section — the old editable Conditions field was dead (resolveLoadout always overwrote it); the 300 default only feeds synthetic engine tests | derivation 2026-07-12; dead input removed with the Character section |
| Strange in Numbers | DERIVED gate, not a stored toggle: active ⇔ the StrangeInNumbers card is equipped AND `teammateCount` ≥ 1 (the +25% mutation boost needs a mutated teammate; teammate mutation status isn't modeled, so any teammate counts — user-decided 2026-07-12). Mutations header shows an active/inactive badge; legacy URLs carrying the old stored flag decode to the derived value | card description + user decision |
| Kill-streak slider gating | The Character section's kill-streak slider disables when no equipped source reads the counter — detection is an existence SCAN over assembled modifiers (`curve.input: killStreak`, `killStreakCount` conditions, `stacks: adrenaline`), unlike Onslaught's `onslaughtMaxStacks` bucket fold: kill-streak sources attach to arbitrary buckets, there is no dedicated bucket to fold (`ScenarioSet.hasKillStreakSources`) | engine wiring 2026-07-12 |

## Consumable stacking & addictions (2026-07-13 consumables overhaul)

Binding rules (user-specified, `dps-todos/consumables-overhaul.md`), enforced
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

Old share URLs carrying a manual `addictionCount` in `conditions` are decoded
with that key explicitly SKIPPED (with a warning) — there's no way to map a
bare count back to specific addiction ids, so it's dropped rather than
silently winning over the (now addiction-less) picker state.

**Deferred**: Carnivore's/Herbivore's food ×2/disable mutation interaction —
the extractor captures `GeneratedBuff.ingredientKeywords` (IngredientType*/
MealType* KYWD edids) now so the follow-up needs no re-extract, but the
app-side classification (which foods count as "meat" vs "veggie", including
soups/mixed dishes) is unimplemented. See `dps-todos/carnivore-herbivore.md`.

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
- **Blocking**: in-app card slotting past a stat's budget or the 4 legendary
  slots is refused by the reducer (and disabled in the picker). N&D imports
  are NOT blocked — violations show the "over budget" badge; the URL's `s=`
  SPECIAL param is merged (clamped to 1–15).

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
- **Lifegiver ranks 2/3 flat totals are description-sourced**: LifeGiver02/03
  are effect-less PERK records — "Gain a total of +30/+45" exists nowhere in
  data. Hand-added in `overrides/perk-overrides.ts`; the END curve is assumed
  to persist across ranks (a rank-up losing it would be a downgrade).
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
- Crippled-limbs input caps at the picked race's crippable-part count
  ("On Cripple"/Explodable BPTD flags; 10 when no race picked — Storm Goliath
  has 9 damageable parts). Bully's/Tormentor's ESM `perCrippledLimb` max stays
  6 — parts 7+ add no damage from those sources.
- Auto-receiver crit/sneak base MUL_ADDs are −20% (user-confirmed correct;
  the −30% applies to AttackDamage/DamageTypeValues).
- Shishkebab max Eligible Level 45 confirmed by user — item level clamps there.

## Known gaps / deferred

- **Taking One for the Team / Follow Through**: the families exist in the
  20260702 ESM (`LGN_TakingOneForTheTeam_Perk`, `LGN_FollowThrough_Perk`,
  4 ranks each) and join the registry, but their extracted `modifiers` are
  empty — the extractor doesn't yet map their MGEF effects. The `wholeDamage`
  bucket is implemented and tested; it stays inert for these two cards until
  the mgef → wholeDamage mapping is added (scripts/extract/normalize/mgef.ts).
  Same applies to the rest of the legendary perks (registry entries are
  display/slotting-only for now).
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
| Ghoul Glow economy | Breathe It In (rad resist → Glow gain) | feeds Glow spenders, not a direct damage term |
| Low-health damage | Nerd Rage (damage + DR, still exists per user) | no ESM family joined — locate its current record/values |
- Mutation SPECIAL side-effects (Egg Head etc.) are not applied — SPECIAL is
  a manual input; set it to your buffed values.
