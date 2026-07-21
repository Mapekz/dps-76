# TODO: Armor Mods — Outgoing Damage (P1)

## What
Armor mods/legendary effects that boost the *player's* outgoing damage, as
distinct from incoming-damage mitigation ([armor-mods-incoming.md](armor-mods-incoming.md)).

## Status: SHIPPED (2026-07-18, Phase 3 — Armor pipeline + slim effects checklist)
The extraction pipeline (`armor-omods.json`, commit 66870c6) plus the engine
and UI half (this pass) closed almost all of this doc's original scope. Slim
checklist, not a per-piece picker (user decision) — see `docs/assumptions.md`
"Armor" for the engine-side design/fixes and
`src/data/armor-modifiers.ts` for the curated inventory (filter-derived, not
hand-listed — whatever qualifies from data shows up).

### Shipped effects (31 checklist rows)
- **Unyielding** — 6-SPECIAL stepped `healthFraction` curves (+3/+2/+1 by HP
  threshold, all but Endurance), per-piece `curveScale` scaling.
- **2★ SPECIAL** ×7 (Strength/Perception/Endurance/Charisma/Intelligence/
  Agility/Luck) — flat +2 ADD, per-piece `value` scaling.
- **Battle-Loader's** — 15/30/45/60/75% `reloadSkipChance` by worn-piece tier
  (self-scaling via `wornPieceCount`, not value-scaled). Needed a condition-
  shape override (`armor-values.ts`) — the extracted modifiers carried
  `unresolved` conditions that permanently deactivated them; see
  `docs/assumptions.md`.
- **Limit-Breaking Armor** — 5-tier `critConsumption` MUL_ADD (self-scaling).
  Replaces the old hand-authored `PlayerConditions.limitBreakingPieces`
  manual toggle; `codec.ts` migrates legacy URLs.
- **Powered** (2★, `apRegenFlat` +5), **Active** (3★, `apMax` +20), **Healthy**
  (3★, `maxHealth` +20) — flat per-piece.
- **Bruiser's** / **Ranger's** (4★, +5% melee/ranged dbm per piece, up to
  +25%) — NEWLY FOUND during this pass; needed a condition-shape override
  (their worn-piece gate was wrongly typed as a `weaponKeyword` check on an
  armor-added keyword, permanently unreachable as extracted).
- **Propelling** (4★ PA, `moveSpeedBonus` +5% per piece, feeds Fast Fighter).
- **Core Assembly**, **Internal Database**, **Sensor Array**, **Motion-Assist
  Servos** (PA Misc slot mods — the "Powered"-style AP-regen/SPECIAL PA mods
  this doc originally chased by different working names) — single-slot.
- **Lighter Build** / **Ultra-Light Build** (armor Lining slot, `apMax`
  curves, level-scaled) — up to 2 pieces (Torso + Limb).
- 9 **underarmor styles** (Casual/Enclave/Raider/Standard/Vault/Marine/
  Brotherhood/Civil Engineer/Secret Service) — multi-stat flat SPECIAL
  bonuses, single-slot.

### Newly-found data-quality exclusions (not shipped, documented)
- **Overeater's** — its only extracted modifier is a script/zero-magnitude
  `maxHealth` curve; the real mechanic (+DR/ER per active food/drink buff) is
  incoming-scope and unextracted. Moved to `armor-mods-incoming.md`.
- **Punishing** — its two extracted modifiers are noise from a shared
  `LegendaryCommonWeaponPerk` ally-heal-blocking clause (same collision class
  Crippling's override already documents), not a real effect. Its actual
  reflect-damage mechanic (`ActorValues` on `ReflectMeleeDamage`) never
  extracted — moved to `armor-mods-incoming.md`.

### Corrected: Zealot's is incoming-scope, not outgoing
The original scope note below (2026-07-13) assumed Zealot's/Assassin's-style
"+damage vs faction" armor effects would need `enemyType`/`enemyTypeAny`
wiring, the same shape as their WEAPON legendary counterparts. Extraction
(commit 66870c6) revealed the ARMOR versions are actually **Perk-grants**
(incoming-damage-resist perks, not outgoing dbm bonuses) — moved to
`armor-mods-incoming.md`, which now owns this finding.

## Remaining deferred (not this pass — user-scoped, unchanged)
- **Unyielding `<` → `<=` threshold flip (game-patch watch, 2026-07-19)** —
  an announced future game build changes the HP-threshold comparison to
  inclusive (`<=`) at 20/40/60%; the current implementation matches the
  CURRENT build (strict `<` for the higher tier — exactly 20% HP yields +2,
  not +3). When the patch lands, revisit the stepped-curve boundary handling
  in `src/lib/curve-tables.ts` (see `docs/assumptions.md` "Unyielding
  threshold semantics — GAME-CHANGE-PENDING").
- **Optimized Bracers** — power-armor intrinsic perk (`PA_OptimizedBracers`,
  "Power attacks cost 25% less"), `modifiers: []`, no OMOD grant path found +
  melee AP isn't modeled (`scenarios.ts` gates AP economy to `!isMelee`).
  Doubly blocked.
- **Kinetic Servos** — script-AV route (its PA Misc-slot AP-regen value is
  script-computed, not extractable — unlike Core Assembly/Photovoltaic
  Coating/BatteryRegenUp, which DID extract cleanly and are shipped above).
- **Rejuvenator's** (4★ armor) — its per-tier AP-restore curves live on the
  hidden Thirst ability SPEL (hydration-tier-gated, same record whose +35%
  baseline is already modeled); only the armor tier-count input is missing.
- **Auto-Stim legendary / Medic Pump** — user-named HP-regen sources for a
  "blood sacrifice" VATS build; not yet located in any generated data, needs
  an `esm-walk` from scratch and likely a new HP-regen engine concept.
- **Nocturnal** (armor) — a WEAPON legendary named "Nocturnal" IS extracted
  (`mod_Legendary_Weapon1_DamageNight`, flat +50% dbm, gated by an
  `unresolved` `GetValue(Invisibility)=0` condition); whether a *separate*
  armor effect shares the name, and what the Invisibility gate actually means
  (sneak-state vs. time-of-day), is still unconfirmed — out of scope for the
  armor-omod sweep since it never surfaced there.
- **Emergency Protocols / Shrouded / Sleek** (move-speed sources) — not found
  in the armor-omod curated inventory (either script-driven, non-obtainable,
  or a bucket/shape this pass's filter doesn't recognize); cross-link
  [move-speed-sources.md](move-speed-sources.md).

## Verification
Done: Unyielding (curve-scaling hand-verified against extracted data,
`armor-modifiers.test.ts`), a 2★ SPECIAL bonus (scaling test), Battle-Loader's
(condition-tier test), Number Cruncher exemption (armor selections don't
leak into `scaledByWeaponApCost`). Golden `expected: null` placeholders for
Unyielding ×5 and Battle-Loader's ×3 await an in-game measurement
(`dps-todos/measurement-backlog.md`). Optimized Bracers stays unverifiable
until it ships (deferred above).
