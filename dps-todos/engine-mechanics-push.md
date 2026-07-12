# Engine Mechanics Push — decisions locked 2026-07-11

Grill-interview resolution of the remaining engine queue from
[data-quality-review.md](data-quality-review.md). Build order:
**Stage A damage terms → Stage B AP economy → Stage C melee cadence.**

In scope: explosive payload term, DoT line, target-distance and
weapon-condition inputs, full AP/VATS steady-state economy + manual-aim hit
rate, power-attack model, Charged cadence, Thrill-Seeker's.
Out of scope (own plans / later): enemy defenses ([phase-3-enemies.md](phase-3-enemies.md)),
Onslaught ([onslaught.md](onslaught.md)), consumables overhaul, VATS hit
chance, real melee animation timings ([fire-rate.md](fire-rate.md)).

## Stage A — damage terms

### A1. Explosive payload component (Explosive 2★, `explosivePayload` 0.2)
- **Per component**: each damage component spawns an explosive twin at 20% of
  that component's base damage. Twins are summed for display today but stay
  per-component so each faces its own resist when the phase-3 mitigation calc
  lands (user-specified: "each comp faces off resist before combining").
- Twins flow through the **full** paper fold: dbm and all multipliers, PLUS
  explosive-scoped bonuses (Demolition Expert's `damageTypeScope`, the
  `explosionMult` bucket) and armor-pen effects once resists exist.

### A2. DoT line (`dotDamage` bucket)
- **Refresh-only** semantics (user-confirmed): re-applying a DoT resets its
  timer, never stacks. Contribution = magnitude/sec while attacking.
- Display: a separate "DoT +X/s" line on the scenario cards. Burst and
  sustained numbers unchanged.

### A3. Target distance — three-way input (Close / None / Far, default None)
- New Target-section control + condition kind (`targetDistance`); each
  effect's own ESM thresholds map abstractly: "within X" rows activate on
  Close, "beyond X" rows on Far.
- ESM enumeration pass required: find EVERY damage effect with target-distance
  conditions (user names Sniper's, Guerrilla + Guerrilla Master, "down
  ranger" — verify actual record names; expect more). Sniper's
  `abPerkFortifyDmgFar` is zero-magnitude with the scaling in script — if the
  value resists extraction it goes to the in-game measurement queue.
- **DONE (2026-07-11):** `targetDistance` condition + three-way UI control
  shipped; Guerrilla/Down Ranger/Sniper's routed via `STAT_DmgVsClose`/`Far`
  fallback routes. Sniper's needed an extractor fix (GLOB-valued magnitude,
  not script-scaled) rather than the measurement queue. Guerrilla Master
  stays unresolved — its close-range dbm curve reads the Onslaught stack
  count (AV 0x00000395), deferred to the Onslaught plan as decided above.

### A4. Weapon condition slider (0–200%, 10% steps, default 100%)
- 100% = full condition, 200% = over-repaired max (user-specified).
- New `weaponCondition` curve input. Chase Polished's null curve input AV and
  verify the Tarnished record.
- Condition affects ONLY these effects — FO76 weapon damage does not degrade
  with condition otherwise.
- **DONE (2026-07-11):** `weaponCondition` curve input + slider shipped;
  Polished's null curve-input AV resolved via an edid-keyed override, proven
  by the cut `DEL_Legendary_Weapon_PolishedPerk` predecessor
  (`GetEquippedWeaponHealthPercent`). Tarnished confirmed cut (`HTO_` dev
  records) — not implemented, noted in docs/assumptions.md.

## Stage B — AP economy + manual-aim hit rate
- Steady-state model: AP pool (base + AGI), regen/s, AP cost per VATS shot
  (WEAP field — extractor addition), V.A.T.S. Optimized cost reduction,
  Conductor's per-crit restore (crit cadence already known from the crit
  meter).
- **On-kill restores ignored** (Grim Reaper's Sprint, Conductor's kill half)
  until enemy TTK exists — annotate in the UI, don't compute.
- Display: an extra **"AP-limited" DPS line + uptime %** on the VATS card;
  today's numbers unchanged.
- Manual-aim **hit rate % input** (default 100) scales free-aim sustained
  DPS — models the user's 30–70% realistic miss note. VATS accuracy stays
  100% (VATS hit-chance modeling explicitly out).
- **DONE (2026-07-11):** AP pool/regen/drain model shipped in
  `src/lib/engine/ap-economy.ts`; VATS card gains an "AP-limited" DPS line +
  uptime % (hidden at 100% uptime); V.A.T.S. Optimized (`vatsApCost`) and
  Conductor's (`apPerCrit`, hand-supplied override, 110/crit) now do
  something instead of being badged inert. Manual-aim `hitRatePct` scales
  free-aim sustained DPS only. Action Boy/Girl's AV route is correct but
  stays functionally inert — its shared ability's rank gate cross-references
  the paired gender-variant family, which the per-family condition
  simulation can't resolve (docs/assumptions.md); left unwired, not forced.

## Stage C — power attacks + melee cadence
- **Full power-attack model** (Charged's dependency): derive the base
  multiplier from ESM/GMSTs — verify the claimed ×1.5 normal / ×2.0 in Power
  Armor from [power-attacks.md](power-attacks.md) — and fold with the existing
  additive `powerAttackBonus` bucket.
- **Charged (4★ melee)**: hunt charge-per-light-attack and the detonation
  multiplier in AVIF/GMST; **cadence model** like the crit meter — every N
  light attacks enables one boosted power attack, folded into average melee
  DPS automatically.
- **Thrill-Seeker's**: killstreak-scaled reload speed (feeds the sustain
  model) + melee speed (relative swing-rate multiplier), both off
  `adrenalineStacks`.
- Melee base attack rate stays the 1 swing/s stub — speed effects apply
  relatively; absolute timings remain fire-rate.md's problem.
- **DONE (2026-07-11):** Power-attack race mult shipped —
  `powerAttackRaceMult` in `paper-damage.ts` applies ×1.5 (HumanRace
  0x00013746) / ×2.0 in Power Armor (PowerArmorRace 0x0001D31E) as a whole
  factor outside the dbm parenthesis, excluding `WeaponTypeAutomaticMelee`
  (power tools) and `unarmed` weaponClass; the additive `powerAttackBonus`
  bucket is unchanged. `getFireRate`'s melee stub now applies `weapon.speed`
  relatively (`1.0 × speed`) so speed-affecting mods have an effect on melee.
  Charged (4★ melee) needed NO extractor change — its OMOD already ADDs
  `WeaponHasSecondaryCharging` and `effective-weapon.ts` already merges
  `addedKeywords`; the cadence (3 light hits + 1 detonation × (1+3.0),
  averaged over the cycle) is modeled in `scenarios.ts` and folds into
  `burstDps`/`sustainedDps` — `perHit` stays the plain hit. Its
  `pendingMechanic` badge is removed. Thrill-Seeker's ships via two fixes:
  `mgef.ts` FALLBACK_AVIF_ROUTES (`weaponSpeedMult`→`fireRateSpeed`,
  `WeapReloadSpeedMult`→`reloadSpeed`, scale 1) plus a `conditions.ts`
  `GetValue` fix that turns its 10 `Equal To N` killstreak tiers into a new
  `killStreakCount` condition (redundant "≥1" gates on OTHER curve effects
  still consume as before) — and `effective-weapon.ts`'s `foldWeaponStat`
  became condition-aware (it previously ignored modifier conditions
  entirely, which would have summed all 10 tiers unconditionally). Its
  `pendingMechanic` badge is removed. Action Boy/Girl's Stage-B leftover
  (cross-family rank gate) is fixed too: `conditions.ts` gained
  `pairedFamilyFormIds` + HasPerk/OR-group resolution against it, wired from
  `extract-perks.ts`'s new `GENDER_TWIN_PAIRS` map — each rank now emits one
  unconditional `apRegen` modifier (0.15/0.30/0.45) instead of 3
  always-inert tiers. Re-extracted (`--only perks,omods`); 21 new tests
  (engine, effective-weapon, buffs-legendary, extractor normalize); `pnpm
  test` 190 passed + 1 skipped (169+1 baseline, zero regressions); `pnpm
  build` clean; `pnpm lint` unchanged (4 pre-existing react-refresh errors).
  See docs/assumptions.md "Power attacks & melee cadence" for full detail.

## Killed / parked by these decisions
- **Head Hunter's**: not a real in-game effect (user-confirmed) — likely cut
  or unreleased content. Stays hidden by the display rule; removed from the
  measurement queue.
- **Basher's**: keep inert + badged. No bash action in the engine; revisit
  only if a melee-flow rework models it.
- **Crippling / cripple-speed stat**: limb damage is limb-condition only (no
  HP contribution, user-confirmed) → a time-to-cripple stat needs enemy limb
  HP, which arrives with phase-3 enemy extraction.
- **On-kill AP effects**: wait for enemy TTK (phase 3).
