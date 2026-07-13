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

## 1. Perk-sourced weapon-stat fold gap (engine fix, no measurement needed)

`buildEffectiveWeapon` (`src/lib/engine/effective-weapon.ts`) only folds the
weapon-stat buckets (`reloadSpeed`, `fireRateSpeed`, `isAutomatic`,
`projectileCount`, `ammoCapacity`, `vatsApCost`) from **OMOD-sourced**
modifiers, and `resolveLoadout` calls it before perks are even gathered. Any
perk that emits one of those buckets extracts correctly but is functionally
inert:

- **Guerrilla Expert** — +1%/Onslaught-stack reload speed
  (`AbPerkFortifyReloadSpeedMult` → `reloadSpeed`), gated `WeaponTypeRanged`.
- **GHL_GunTricks**, **GroundPounder**, **MartialArtist** — same shape,
  verified still present in the current dump.

Fix: thread perk-sourced weapon-stat modifiers through the same fold. This is
an architecture change in `resolveLoadout` ordering (weapon-stat modifiers
must be gathered from perks *before* `buildEffectiveWeapon`, while everything
downstream keeps consuming the effective weapon), and it touches every perk in
that shape at once — that breadth is why it was left as a known gap rather
than patched per-perk. Note the fold is also condition-blind today
(OMOD modifiers are unconditional; perk modifiers like Guerrilla Expert's
carry `WeaponTypeRanged` gates and Onslaught-stack curves), so the fold entry
point needs condition evaluation, not just a bigger modifier list.

Not affected (no action): Guerrilla Master's `dbm` curve and Gunslinger
Expert's `weakpointBonus` — those buckets fold from the full modifier list
regardless of source kind.

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

From **Carnivore's/Herbivore's food scaling** (shipped 2026-07-13, see
`docs/assumptions.md` "Carnivore's / Herbivore's food scaling") — optional
confirmations, nothing blocking:

- Pip-Boy effect-card reading for a doubled food under Strange in Numbers
  (expect ×2.5).
- Rudy's Pozole exemption: its plain FortifyCharisma/Luck effects should NOT
  scale (the one data-driven exemption among the 77 audited foods).
