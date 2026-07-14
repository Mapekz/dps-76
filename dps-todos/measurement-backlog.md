# Measurement Backlog & Perk Weapon-Stat Fold Gap

Split out of this folder's README ("Known gaps & measurement backlog",
originally rescued from the deleted `onslaught.md` / `engine-mechanics-push.md`
/ `data-quality-review.md` resolution logs) on 2026-07-13. Also absorbed the
measurement remainders of the deleted `launcher-explosives.md` and
`carnivore-herbivore.md` docs (both shipped 2026-07-13) — section 3 below. Full derivations
live in `docs/assumptions.md`; this file is the actionable queue. The
"parked by explicit design decision" items (Basher's, Combo-Breaker's,
cripple-speed, on-kill AP restores, Gunslinger Master stacks, N&D
Slugger/IronFist keys) are NOT here — they stay in the README because each
waits on a specific other workstream, not on measurement or a self-contained
fix.

## 1. Perk-sourced weapon-stat fold gap — SHIPPED 2026-07-14

Resolved: `assemble` (`src/lib/loadout.ts`) now gathers perk/legendary-perk/
mutation/consumable modifiers before `buildEffectiveWeapon` and threads them
into the weapon-stat fold (new `loadoutModifiers` parameter; exported
`WEAPON_STAT_BUCKETS` set). The fold was already condition-aware (Stage C3's
`effectiveValue` sharing), and Onslaught-curve inputs now read a stack cap
bootstrap-folded inside `buildEffectiveWeapon` mirroring `scenarios.ts`.
Activates Guerrilla Expert, Gun Tricks, Swift-Footed, and Speed Demon's
reload. See `docs/assumptions.md` "Guerrilla Expert's reload-speed bonus is
now functionally wired" for the two assumptions (raw-conditions ctx,
OMOD-only materialization/keywords).

Remainder CLOSED 2026-07-14: **Ground Pounder** and **Martial Artist** are
live too — `GetWeaponAnimType() ≤ 6` mapped to the new `weaponAnimTypeMax`
condition (WEAP anim enum; all-roster sweep proved ≤6 = melee/unarmed, with
gun-animated Paddle Ball / War Shrike correctly excluded), and
`IsTrueForConditionForm(SmallGun_Actor_Condition)` resolved by the new CNDF
inline-expansion (`resolveConditionForms` + `tryExpandConditionForm`) to
(Rifle|Shotgun|Pistol) AND NOT HeavyGun. Swinger shares the anim gate but is
cut content (`hasCard: false`) — ignored by design. See `docs/assumptions.md`
"Martial Artist & Ground Pounder condition mapping".

## 2. In-game measurement queue (legendary effects extracting zero modifiers)

These legendary effects extract **zero modifiers** — the OMOD/MGEF records
exist but the numeric effect lives in scripts or the exe, not in a decodeable
magnitude/curve. Each needs either an in-game measured golden case
(`src/lib/engine/__tests__/golden/cases.json`) or a deeper VMAD script chase
before it can be modeled:

Feral's, Barbarian, Fracturer's, Electrician's, Locked, Glowing, Ghost's,
Vampire's, Suppressor's, Medic's, Durability, Pick Pocketer's, Nimble,
Resilient, Steadfast, Defender's, Blocker, Stabilizer's, Lightweight,
V.A.T.S. Enhanced, Riposting.

Triage rule: utility-only effects stay hidden by the zero-modifier display
rule (`src/data/omods.ts` — modifier-less non-default OMODs are filtered from
pickers), so they cost nothing while unmeasured. The **damage-relevant subset
is the actual queue** — anything that would change a paper-damage, cadence, or
sustain number if modeled (e.g. Suppressor's/Riposting matter only once
enemy/incoming modeling lands; V.A.T.S. Enhanced touches AP economy which is
live today).

Workflow per effect:
1. `esm-walk` the OMOD → MGEF/SPEL chain to confirm there is truly no
   record-level magnitude (some past "zero modifier" reads were extractor
   bugs — see the misattributed Float/Conditions repair and the `p62_` junk-
   prefix fix in `docs/assumptions.md`).
2. If genuinely script/exe-driven: measure in-game, pin a golden case, and
   model the value in `src/data/overrides/legendary-values.ts` with a source
   comment (existing pattern for script-computed legendary values).

## 3. In-game confirmations for shipped mechanics (from closed todo docs)

From **launcher explosion damage** (shipped 2026-07-13, see
`docs/assumptions.md` "Launcher explosion damage"):

- **Pip-Boy summing verification**: does the damage card show WEAP impact +
  EXPL (Fat Man 1391, Missile Launcher 973)? Fill the two `expected: null`
  golden cases in `src/lib/engine/__tests__/golden/cases.json`. Hellstorm
  (379+379=758) is the sharpest probe — its two halves are separately
  authored tier-46 curves.
- **Explosive-legendary stacking on Gauss** (0.15 intrinsic + 0.2 legendary
  = 0.35 assumed additive) — measure if a Gauss + Explosive roll is
  available.
- **Cremator projectile DoT** — not a measurement item: the WEAP-side fire
  curve's "partial" caveat is an open ESM/VMAD chase (the explosion component
  shipped; the DoT chase did not).

From **mixed damage-type OMOD conversion** (shipped 2026-07-13, see
`docs/assumptions.md` "Mixed damage-type OMOD conversion (DamageTypeValues)"):

- **Three `expected: null` golden cases** queued in
  `src/lib/engine/__tests__/golden/cases.json`, user measuring during review:
  Gauss Minigun + Tesla Coil Capacitor @50 (mixed phys+energy per-hit), same +
  Science! rank 1 (validates the energy-scoped dbm hitting both the
  materialized component and its 15% explosion twin), and War Glaive + Plasma
  Blade (the −0.4 ballistic / +0.6 energy conversion on a melee weapon).
- **Twin type generalization**: explosion twins inheriting the parent
  component's damage type is user-confirmed for energy (Tesla Gauss tick =
  phys + energy); the generalization to fire/cryo/poison parents is assumed.
  A Cremator-family or cryo-converted weapon with a type-scoped buff would
  confirm.
- **Negative-MUL netting edge**: a negative type-scoped MUL on a missing type
  is dropped per-modifier, not netted against positives (Tesla +0.5 energy
  alongside a blanket −0.3 energy mod still yields the full 0.5×). Confirmed
  by the zero-base reasoning; an in-game Tesla + automatic-receiver combo
  reading would pin it.
- **Lobber Barrel semantics**: `DLC01_mod_LightningGun_Barrel_Lobber` now
  extracts as `SET 0` energy — it zeroes the beam's energy damage,
  presumably rerouting damage through a changed PROJ/EXPL payload that the
  WEAP-side extraction doesn't chase per-OMOD. Review in-game before trusting
  Lightning Gun + Lobber numbers.
- **Shock & Stun obtainability**: `mod_melee_SuperSledge_ShockAndStun` sits at
  `obtainable: false` (why it was swapped out of the golden queue for the War
  Glaive). If it's actually acquirable in-game (script-granted rewards have no
  record-level reverse refs), rescue it via `forceVisibleOmodIds` in
  `overrides/corrections.ts`.
- **Tesla Coil Capacitor enchantment**: the capacitor's `hasEnchantments`
  (arc/chain shock) is not modeled — same ENCH translation gap as the
  zero-modifier legendaries above.
- **GHL_MadScientist keyword gating**: gated on `weaponKeyword
  WeaponTypeEnergy` rather than `damageTypeScope` — and the Gauss Minigun
  carries `WeaponTypeEnergy` intrinsically, so the ghoul card already applies
  to a bare (no-capacitor) Gauss Minigun. Decide whether that matches in-game
  behavior; if not, re-route it damageTypeScope-style like Science!.

From **Carnivore's/Herbivore's food scaling** (shipped 2026-07-13, see
`docs/assumptions.md` "Carnivore's / Herbivore's food scaling") — optional
confirmations, nothing blocking:

- Pip-Boy effect-card reading for a doubled food under Strange in Numbers
  (expect ×2.5).
- Rudy's Pozole exemption: its plain FortifyCharisma/Luck effects should NOT
  scale (the one data-driven exemption among the 77 audited foods).
