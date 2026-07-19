# Measurement Backlog & Zero-Modifier Legendary Triage

Split out of this folder's README ("Known gaps & measurement backlog") on
2026-07-13; absorbed the measurement remainders of the shipped
launcher-explosives and carnivore-herbivore work plus the mixed-damage
(DamageTypeValues) conversion. `docs/assumptions.md` holds the terse
decision/status registry (2026-07-15 streamlined — one claim per bullet, a
status tag, a code pointer); this file is the actionable in-game-measurement
queue. Investigation history for any item below lives in git, not in either
doc. The "parked by explicit design decision" items (Basher's,
Combo-Breaker's, cripple-speed, on-kill AP restores, N&D Slugger/IronFist keys) stay in the README.

**2026-07-14: the full zero-modifier legendary sweep ran** — every
zero-modifier legendary OMOD (38 records, 37 names) esm-walked to its true
terminus, plus deep chases for Lobber Barrel, Tesla Coil ENCH, Cremator DoT,
and a Shock & Stun grant-path hunt. Headline: **nothing in the sweep needs an
in-game measurement to recover a number** — every effect either decodes fully
from records or is out of scope by design. Sections 2–3 below hold the
verdicts; section 1 the user-only measurement checklist that remains.

## 1. In-game measurement checklist (user-only queue)

Fill `expected: null` goldens in `src/lib/engine/__tests__/golden/cases.json`
(un-skip automatically) or pin `docs/assumptions.md` entries:

- [ ] **Composite range-falloff shape** (new 2026-07-18, Phase 1 — Range +
      falloff) — the model itself is USER-CONFIRMED, not in-game-measured:
      verify the Pip-Boy damage card at a few points past a weapon's max
      range (e.g. ~1.2×max and ~1.4×max on a weapon with `maxRange = 2 ×
      minRange`, predicting `outOfRangeMult × curveY(X)` at
      `X = (d − minRange)/(maxRange − minRange)` — NOT `d/maxRange`) to
      confirm the reconciliation between `CT_Player_PercentOfMinToMaxRangeDMGMult`
      and `outOfRangeDamageMult` matches real damage numbers. A golden case
      placeholder exists in `golden/cases.json` (`expected: null`).
- [ ] **Far-gate threshold precision** (new 2026-07-18) — 1000 raw units is a
      CAMP-foundation-derived estimate (~3.9 foundations × 12 Pip-Boy units ×
      64/3); a cleaner in-game method (e.g. a measured tape/marker) would
      pin it more precisely than the ~2.5% margin the foundation method
      carries. Not the same question as Phase 2's SBQ/per-player boss-HP
      multiplier open item (`scratchpad/phase2-curve-spike.md`) — that one
      belongs to enemy-defenses work, not this range/falloff phase.
- [ ] **Scorchbeast Queen HP ~10× the community figure** (new 2026-07-18,
      Phase 2 — Enemy defenses data slice; `docs/assumptions.md` "Creature
      stat curves & NPC extraction") — the ESM curve-only estimate for
      `EncScorchbeastQueen01Template` (world-spawn template, level window
      60–100, `CT_Creatures_Health_Universal_Tier55`) is ~237k–408k HP vs. a
      commonly cited in-game figure of ~32k. Needs an in-game HP-bar or
      combat-log reading at a known player count (solo vs. full team) to
      settle whether a per-nearby-player boss-HP multiplier applies on top of
      the base curve value (a well-known FO76 mechanic, structurally separate
      from the Renorm/curve system and not modeled here) — see
      `scratchpad/phase2-curve-spike.md` "Validation" section for the full
      reasoning and the predicted numbers for other bosses (Earle, generic
      SBQ world spawn) to cross-check against.
      **UPDATE 2026-07-18 (coordinator follow-up, epic-creature
      investigation):** the "Epic Levels" system (`QUST SQ_EpicCreatures`
      0x0001C339) was esm-walked as a candidate explanation and RULED OUT —
      its `EpicRankData` HealthMult table tops out at 4.8× (rank 5), far
      short of the observed ~10×, even though SBQ and Earle both pass the
      eligibility check (`GeneratedNpc.epicAllowed: true` — see
      docs/assumptions.md "Creature stat curves & NPC extraction" for the
      full table + eligibility mechanics). The per-nearby-player boss-HP
      multiplier remains the leading unconfirmed explanation.
- [ ] **Phase 2 mitigation formula end-to-end** (new 2026-07-18) — golden
      placeholder `golden/cases.json` "Combat Rifle (Fixer) @50 ... vs
      Scorchbeast Queen (Lv 100)" (`measure: 'effectiveSustainedDps'`,
      `expected: null`, `tolerancePct: 15`). The `(damage × 0.15 /
      Resist)^0.365` formula and the Option A blended-hit approximation are
      unit-tested against synthetic numbers (`mitigation.test.ts`), but
      nothing cross-checks the WHOLE pipeline (real resist curve → real
      mitigated DPS) against an actual Pip-Boy/combat-log reading yet. Needs
      a known build (stock Combat Rifle Fixer, no perks, free aim) vs. SBQ at
      level 100 with a measured sustained DPS.
- [ ] **Armor Effects checklist: Unyielding + Battle-Loader's** (new
      2026-07-18, Phase 3 — Armor pipeline engine/UI) — two golden
      placeholders in `golden/cases.json` (`expected: null`): Unyielding ×5
      at 10% HP (`measure: 'perHit'`, Combat Rifle Fixer, no melee STR term
      so mostly an assembly-seam pin) and Battle-Loader's ×3
      (`measure: 'sustainedDps'`, 45% reloadSkipChance tier). Per-piece
      scaling math is hand-verified against the extracted curve/flat values
      in `armor-modifiers.test.ts`; what's unmeasured is the real in-game
      Pip-Boy/DPS reading with the mods actually equipped. See
      docs/assumptions.md "Armor effects".
- [ ] **Taking One for the Team flat-DR rank-4 anomaly** — the 6/10/15/50
      magnitude table (docs/assumptions.md "Resist mitigation") jumps
      non-arithmetically at rank 4; confirm whether this is intentional
      game balance or an ESM data-entry error (compare against the in-game
      card description/tooltip at rank 4, and/or a measured before/after
      damage-taken reading).
- [ ] **Reverse Onslaught (Gunslinger Master)** — verify +1 stack/sec regen
      rate and per-hit-event consumption (physical projectile + explosion per
      target) match in-game; pin `ONSLAUGHT_REGEN_PER_SEC` and the
      `perShotOnslaughtConsume` formula in `onslaught.ts`.
- [ ] **Tesla Gauss @50** — Gauss Minigun + Tesla Coil Capacitor, no perks
      (mixed phys+energy per-hit golden).
- [ ] **Same + Science! rank 1** — validates the energy-scoped dbm hitting the
      materialized component and its 15% explosion twin.
- [ ] **War Glaive + Plasma Blade @50** — the −0.4 ballistic / +0.6 energy
      melee conversion golden.
- [ ] **Launcher Pip-Boy summing** — Fat Man 1391, Missile Launcher 973;
      Hellstorm 379+379 is the sharpest probe (two separately-authored
      tier-46 curves).
- [ ] **GHL_MadScientist bare-Gauss check** — does the ghoul card boost a
      no-capacitor Gauss Minigun (it carries `WeaponTypeEnergy` intrinsically)?
      If not, re-route damageTypeScope-style like Science!.
- [ ] **Explosive-legendary stacking on Gauss** — 0.15 intrinsic + 0.2
      legendary = 0.35 assumed additive.
- [ ] **Twin-type generalization** — energy is user-confirmed; a
      Cremator-family or cryo-converted weapon with a type-scoped buff would
      pin fire/cryo/poison parents.
- [ ] **Lobber hazard DoT convention** (new 2026-07-14) — the shock-trap tick
      (34→112 curve, HAZD Target Interval 0.3s / MGEF Duration 1s) is modeled
      per the engine's refresh-only dot convention; a stopwatch reading of
      Lightning Gun + Lobber field damage would pin the real tick math.
- [ ] **Cremator Slow-Burning Tank** (new 2026-07-14) — confirm the tier-17
      curve (53 @ 50) over 12s replaces (not stacks with) the base tier-13/6s
      burn.
- [ ] **AP regen goldens** (moved from `ap-regen.md`, CLOSED and removed
      2026-07-15) — five `apRegenPerSec`/`perHit` null goldens in
      `golden/cases.json`: hydrated baseline 17.0 AP/s, power-armor baseline
      8.5 AP/s (pins the PowerArmorRace halving), Lone Wanderer solo
      20.8 AP/s, Company Tea 45.4 AP/s, Number Cruncher +32% pip-boy damage.
      Measuring the baseline at two different AGI values would also
      cross-check the %-of-max-AP rate semantics. Note the 2026-07-15
      correction: passive regen no longer feeds the uptime calc (doesn't
      tick during sustained VATS fire), but these goldens still pin
      `regenPerSec` itself.
- [ ] **Per-shell reload times** (new 2026-07-15, `Weapon.reloadPerShell`
      from the `AnimsSequentialReload` keyword) — stopwatch a Lever Action
      Rifle (model: 1.77s × 6 rounds ≈ 10.6s from empty) or Single Action
      Revolver full reload; ALSO stopwatch a Double-Barrel cycle to confirm
      it is NOT per-shell (model: one combined 3.07s break-action reload —
      it carries `animsDoubleBarrelShotgun`, not the sequential keyword).
      Watch for intro/outro animation segments the ×rounds model may
      overstate. `reloadSec` goldens added.
- [ ] **Reload bonus semantics: divide vs time-scale** (new 2026-07-15,
      `dps-todos/dps-sensitivity-review.md`) — the engine reads reload
      bonuses as a rate divisor (`anim / reloadSpeed`); the alternative is
      direct time scaling (`anim × (1 − bonus)`). Discriminating stopwatch:
      .44 revolver (per-shell, but full-cycle works: 6 × 3.33s base is long
      enough to time cleanly) with Speed Demon equipped — +30% bonus →
      divide predicts −23.1% reload time, time-scale predicts −30%
      (2.56s vs 2.33s per shell). Take Gun Tricks as a ghoul for a stacked
      +60% check: divide −37.5% vs time-scale −60% — the gap is unmissable
      at high stacks. Every reloadSpeed source in the calc rides on this.
- [ ] **Fold shape: single bucket vs. independent AV layer** (resolved
      2026-07-15, `docs/assumptions.md` "Sustained DPS") — tested whether
      perk/mutation `WeapReloadSpeedMult` AV fortifies (Ground Pounder, Speed
      Demon, Gun Tricks, Fast Fighter) fold additively into the SAME
      `reloadSpeed` bucket as OMOD/legendary record-property rewrites
      (current engine: `base + ΣMUL_ADD×base + ΣADD`) or apply as an
      independent `×(1+ΣADD)` layer on top of the OMOD-scaled base. Stopwatch
      comparisons on Fixer (Ground Pounder R1–3 + Swift 3★ + Speed Demon +
      Fast Fighter) and Gatling Plasma (Swift Core Receptacle + Swift 3★ +
      Gun Tricks + Speed Demon, SIN on/off) sided with the single-fold
      reading — no code change needed. Not a formal golden pin (qualitative
      A-vs-B call, no recorded seconds); the divide-vs-time-scale question
      immediately below is separate and still open.
- [ ] **Fast Fighter conversion** (new 2026-07-15,
      `dps-todos/move-speed-sources.md`) — reload stopwatch with Fast
      Fighter + Speed Demon, standing still: model predicts the same as
      Speed Demon + a flat +10% (half of +20% move speed). Also test with a
      sprint-speed perk (Freight Train) while stationary to settle whether
      sprint-only bonuses count as "bonus movement speed".
- [ ] **Lock and Load reload activation** (new 2026-07-15) — .50 Cal at 10
      ammo-spent stacks (Bullet Storm's base cap alone — no Bringing Out the
      Big Guns/Foundation's Vengeance): 5.0s belt reload without Lock and
      Load, model ≈4.55s with it (+1%/stack via Bullet Storm's hidden curve,
      5.0s / 1.10). Golden added (`measure: reloadSec`).
- [ ] **Reload-window AP regen & the 1s delay** (new 2026-07-15) —
      Double-Barrel steady-state VATS uptime golden (`measure: apUptime`)
      pins both the reload-regen credit and the `fDamagedAVRegenDelay = 1.0`
      reading (watch the AP bar during a reload: regen should visibly start
      ~1s after the last shot).
- [ ] Negative-MUL netting edge (low priority — zero-base reasoning is solid).
- [ ] Optional: Carnivore ×2.5 under Strange in Numbers; Rudy's Pozole
      non-scaling exemption; Barbarian's +1 STR/kill clamp-at-10 and decay.
- [ ] **Charging weapons, engine phase landed 2026-07-15** (`docs/assumptions.md`
      "Charging weapons") — six `expected: null` goldens added
      (`golden/cases.json`), currently no-ops because the extraction pipeline
      doesn't yet read Full Power Seconds/Full Power Damage Mult/Minimum
      Charge Time off WEAP.Data or the matching OMOD properties. Once that
      extraction lands, stopwatch/pip-boy:
  - [ ] **Full-charge Gauss Rifle @50** — pins the `1 + FPDM × (t/FPS)`
        endpoint value (ESM: FPS 1.0, FPDM 2.0 → ×3 at full charge).
  - [ ] **Full-draw Bow** — same endpoint check on a bow (Minimum Charge Time
        now floors both the UI slider AND the engine's `chargeTimeSec`;
        confirm the formula still ramps linearly above the minimum draw, up
        to the same full-charge endpoint).
  - [ ] **Partial-charge ramp shape** — measure a half-charged Gauss Rifle
        hit: the new formula (`1 + FPDM × t/FPS`) predicts ~2× base damage,
        while the old shipped formula (`(1 + FPDM) × t/FPS`) predicted ~1.5×
        — this single measurement distinguishes the two. Also confirm a
        0-charge (instant-release) shot does full base damage (×1), not 0.
  - [ ] **Tesla + Charging (Hold) Barrel** — confirms an OMOD SET
        FullPowerSeconds/FullPowerDamageMult turns charging ON for a base
        WEAP that has FPDM but FPS 0 (ESM: base FPDM 1.25/FPS 0.0, barrel SETs
        FPS 1.0).
  - [ ] **Gamma Gun + Electric Signal Carrier Antennae** — same OMOD-grants-
        charging check on the muzzle slot (ESM: FPS 1.0, FPDM 2.0).
  - [ ] **Laser Gun + Sniper Barrel** — proves laser sniper barrels charge
        without the `HoldInputToPower` flag (the numeric-gate rationale; ESM:
        FPS 1.5, FPDM 2.0, no HoldInputToPower SET anywhere in the OMOD or its
        include chain).
  - [ ] **Charged-shot DoT ticks** (Compound Bow + Flaming Arrows) — confirms
        a partial-draw shot's burn/poison DoT ticks the same as a full-draw
        shot's (the engine's DoT-exclusion decision: `computeDotDps` never
        sees the charge multiplier).
  - [ ] Optional stopwatch: confirm the charge-hold portion of cadence really
        is speed-immune in-game (only the post-release attack-delay tail
        should shrink under Speed buffs) — `getFireRate`'s
        `1/(chargeSec + animDelaySec/speed)` formula is user-confirmed, not
        yet in-game-timed.

- [ ] **The V.A.T.S. Unknown crit-bonus roll** (new 2026-07-16) — confirm the
      base OMOD's random ×0.2–×2.0 roll (`VATSCriticalMultAdjustMin/Max`)
      scales only the additive crit-damage BONUS (perk/legendary ADDs), not
      the base weapon crit mult, and that modeling it at its mean (×1.1,
      `critDmgBonusScale`) is a fair expected-DPS stand-in. Equip a crit-damage
      perk (Better Criticals) on the Alien Blaster and compare VATS crit
      damage against an identical build on a stock (non-V.A.T.S.-Unknown)
      weapon.

**Resolved off this list 2026-07-14 (no in-game check needed):**
- ~~Shock & Stun obtainability~~ — its only referencers are `POST_Challenge_*`
  records, the same unshipped POST bucket as the Stun Pack mods (already
  pinned by a regression test). Correctly `obtainable: false`; no
  `forceVisibleOmodIds` rescue. Only a live-game sighting would reopen this.
- ~~Tesla Coil Capacitor arc enchantment~~ — ENCH `0x007C778F` is literally
  named `EnchWeapModShock_MiniGun_FXOnly`: Magnitude 0, a hit-shader VFX
  trigger. There is no chain-arc damage mechanic in the record graph; the
  capacitor's −20% ballistic / +50% energy conversion (already modeled) is
  its entire effect.

## 2. Zero-modifier legendary sweep — verdicts (2026-07-14)

Every OMOD → ENCH/SPEL/MGEF/PERK chain walked to terminus. Verdict key:
**ench-gap** = decodable number exists past where the extractor stops;
**extractor-gap** = number sits on an unmapped record field; **script** =
VMAD/engine-native, no record number; **oos** = out of scope for an
outgoing-DPS calculator (permanently, unless marked *future*).

### Damage-relevant misses (the real queue — all need the proc-damage
### workstream below, none need measurement)

| Effect | What it really does (ESM-proven) | Blocker |
|---|---|---|
| Electrician's `0x0079297C` | Energy AoE on reload: curve 11→25 (lvl 1→50), Force 64, radius 256, medium stagger (EXPL `0x00799382`) | Ability→SPEL chase stops one MGEF short of the `Explosion` field; EXPL curve unread; needs on-reload proc modeling |
| Fracturer's `0x00792983` | AoE burst on limb-cripple: curve 22→50, 3s cooldown (EXPL `0x00795775`) | "Select Spell" entry-point gap + EXPL Damage Curve Table unread; needs cripple-proc uptime assumption |
| Circuit Breaker unique (10mm `0x006D3C69`, via sibling OMOD `0x006DC8DD`; the swept `0x006EBCD5` is an orphan twin) | Last-round hit (no RNG): single-target energy 31→103 + 50-unit AoE 6→20, 5s stun w/ 10s immunity | "Select Spell" gap; needs last-round proc modeling (a `lastRound` condition already exists) |
| AttackSpeedUp / `mod_custom_Doolin` `0x007CFAAC` | `SET AttackDelaySec 0` for The Dragon (base 1.5s → ~3× semi-auto cadence) | `AttackDelaySec` in PROPERTY_IGNORED; no `attackDelaySec` weapon-stat bucket; `obtainable: false` likely a unique-template false negative — rescue + verify |
| Barbarian `0x0083DA6B` | +1 STR per kill-streak count (AV pass-through; max 10 from description only) | Modelable as `specialStrength` + `killStreak` curve input (plumbing exists); clamp/decay unverified |

### Future-scoped (parked until enemy/incoming/TTK modeling lands)

| Effect | ESM-proven value | Gate |
|---|---|---|
| Inertial `0x00606B72` | 15 AP per kill (OMOD `ActorValues LGND_APOnKill=15`, unmapped) | on-kill AP parked on phase-3 TTK (README) |
| Suppressor's `0x005281B8` | Target deals −25% damage for 5s ("Select Spell" gap; fully decodable) | enemy-outgoing-damage modeling |
| Riposting `0x001A7C39` | Reflect 50% of blocked damage (`ReflectBlockedDamage=50`, unmapped) | incoming-damage modeling |
| Defender's `0x001A7BD3` | +40% auto-block chance (`LGND_AutoBlockChance=40`, unmapped) | incoming-damage modeling |
| Anti-Aristocrat's `0x007D1147` | dbm curve vs enemy caps-on-hand 0→50% @29k caps (curve-input AV lives in a Conditions row, unresolved) | PvP-flavored; no enemy-caps input exists |

### Out of scope / no action (values decoded & documented, nothing to model)

- ~~**V.A.T.S. Enhanced** `0x00524153`: +50pp VATS hit chance
  (`STAT_VATSAccuracy`)~~ — **SUPERSEDED 2026-07-18 (Phase 4 — VATS
  hit-chance aggregate)**: computing VATS hit chance is still permanently
  out of scope, but aggregating already-known ESM bonus magnitudes for
  DISPLAY is not the same thing (user decision). This value (and Awareness,
  Eye of the Hunter, the V.A.T.S. Matrix Overlay armor mods, Orange
  Mentats, Hoppy Hunter IPA, Twisted Muscles) now feeds the informational
  `ScenarioSet.vatsHitChanceBonus` pill — see docs/assumptions.md "VATS
  hit-chance aggregate (display-only)". Status changed from "no action" to
  "informational display"; no DPS number is affected.
- **Vampire's** `0x00527F84`: 2% max-HP over 2s on hit (self-heal).
  **Steadfast** `0x004F5772`: +50 player DR while ADS. **Resilient**
  `0x004F5777`: +500 player resists while reloading. **Blocker**
  `0x005253FB`: +15% damage blocked. All player-defense.
- **Ghost's** `0x00609E4F`: 10% chance (GLOB) 2s re-cloak on hit. **Nimble**
  `0x004ED02E`: +100 ADS move speed. **Stabilizer's** `0x007AC88D`: ±40%
  recoil/cone (PROPERTY_IGNORED by design — no accuracy model).
  **Lightweight** `0x00524152`: −90% weight. **Durability** `0x0037F7D9`:
  −50% condition loss (FO76 has no condition-damage link).
- **Feral's** `0x0083DA74` (−218 feral meter on kill) / **Glowing**
  `0x0083DA6A` (+20 Rads on kill, ghoul): ghoul-subsystem, unmodeled.
- **Pick Pocketer's** `0x0083DA6F` (50% caps loot on kill), **Satiated**
  `0x00811393` (hunger/thirst on kill, Survival-only, unobtainable),
  **Medic's** `0x0075EAC6` (5% ally heal on hit; legacy `0x00527F8B` is
  script flavor-text only), **Head Hunter's** `0x006346F8` (zero ammo cost
  10s after headshot kill, unobtainable): no damage axis.
- **Brutalist's** `0x0080FC2E` (+1 STR/kill 5min max 10, VMAD-scripted) and
  **Combo-Breaker's** `0x00792982` (50%/10% chance of zero AP cost —
  decodable via GLOBs): both unreleased/parked by design.
- **Explosive LEGACY shotgun** `0x00425E28`: OverrideProjectile → 3% BWDM
  explosion — dead content superseded by the live `explosivePayload`
  mechanism, unobtainable.
- **Charged** `0x00885C6A` and **Conductor's** `0x007ACB0B`: independently
  re-derived from ESM and **already modeled correctly** (scenarios.ts charge
  cycle; 110 AP/crit override). No discrepancy.
- Structural non-effects: 2× 4-star `TEMPLATE_Mod_Legendary_*` stubs, 4×
  `mod_Legendary_Crafting_Weapon*` reroll mods.

### Cross-cutting extractor gaps the sweep identified

1. **"Select Spell" entry-point chase missing** — `translateGrantedPerk`
   (`normalize/mgef.ts`) never reads the `Spell` field of Function Type 5
   ("Spell Item") entry points, the authoring pattern for every
   on-kill/on-hit/on-cripple legendary proc. Unlocks Fracturer's,
   Suppressor's, Vampire's, Circuit Breaker (payloads mostly out of scope or
   proc-shaped; fix pays off with the proc workstream, not alone).
2. **EXPL Damage Curve Table unread** for perk-spell explosions (Fracturer's,
   Electrician's) — only the WEAP→PROJ launcher path reads EXPL damage.
3. **Unmapped private-AV `ActorValues` rows** (`LGND_*`, some `STAT_*`) —
   the OMOD sets the AV the ENCH reads at runtime (Magnitude 0.0 pattern);
   values are ESM-proven on the OMOD row itself (Inertial 15, Medic 5,
   Nimble 100, Defender 40, Riposting 50, Blocker 15). Map only when a
   consuming bucket exists.
4. **`GetIsPlayer` Contact-ENCH scoping** + **REM/ADD enchantments** +
   **`WEAP.Enchantment` never chased** + **`OverrideProjectile` ignored** —
   all four being fixed 2026-07-14 (Cremator/Lobber batch, see section 3).

### Follow-up workstream candidate: proc damage

Electrician's, Fracturer's, and the Circuit Breaker unique all need the same
new engine concept: a proc-triggered damage instance (on-reload /
on-limb-cripple / on-last-round) with its own curve, cooldown, and uptime
assumption, separate from the per-shot dbm fold. The dormant
`addDamageComponent` bucket (`types/modifiers.ts`) is declared but consumed
nowhere — evaluate it as the landing zone when this workstream is scoped.

## 3. In-game confirmations for shipped mechanics (from closed todo docs)

From **launcher explosion damage** (shipped 2026-07-13): Pip-Boy summing and
explosive-stacking checks — moved to the section-1 checklist. **Cremator
projectile DoT: chase CLOSED 2026-07-14** — fully record-decodable, no VMAD:
base burn = tier-13 curve (10→32) over 6s fire, via WEAP `Enchantment` →
ENCH `0x00729BCD` (never chased before); Slow-Burning Tank REMs it and adds
tier-17 (16→53) over 12s (ENCH `0x00729BCC`). The previously extracted
`dotDamage ADD 3, 6s` on Slow-Burner was **wrong data** (the REM'd base
ench's PVP-only branch, kept by the `GetIsPlayer` scoping bug). Barrels do
NOT touch the DoT (only the chemical-tank receiver slot does); Napalm Tank's
+0.4 dbm was already correct. **Extraction fixes SHIPPED 2026-07-14** (WEAP
`Enchantment` chase, `GetIsPlayer` Contact-delivery scoping, REM-vs-ADD
gating, SET-replace overrides for Slow-Burner & Shishkebab Extra Flame Jets;
also recovered 30+ bladed-melee intrinsic bleeds) — browser-verified: base
32/s → Slow-Burner 53/s replacing, not stacking.

From **mixed damage-type OMOD conversion** (shipped 2026-07-13): the three
goldens, twin-type, and negative-MUL items — moved to the section-1
checklist. **Lobber Barrel: chase CLOSED 2026-07-14** — the lobbed payload is
fully record-decodable: OMOD `OverrideProjectile` → PROJ `0x0010EAB1` → EXPL
`0x0010EE39` (empty) → `Placed Object` → HAZD `0x0010EAA7` shock trap
(radius 25, 7s, 0.3s interval, limit 20) → energy tick curve 34→112
(`CT_Player_Damage_Universal_Tier25`; the beam it replaces is Tier26,
36→121). Same fix also recovers the Cryolator Polar Lobber (direct dtCryo
Tier40 EXPL damage + its own hazard layer — currently zero modifiers).
~154/3597 weapon OMODs carry `OverrideProjectile`, mostly cosmetic; chase is
damage-gated (direct EXPL damage only materializes when a HAZD hop exists,
which filters cosmetic reskins; launcher families with weapon-level
`fromExplosion` stay note-only). **Extraction fixes SHIPPED 2026-07-14** —
browser-verified: Tesla Rifle + Lobber shows 0 direct / 112/s dot @50.
GHL_MadScientist and Shock & Stun: see section 1 (one still a user check,
one resolved).

From **Carnivore's/Herbivore's food scaling** (shipped 2026-07-13) — optional
confirmations moved to the section-1 checklist.
