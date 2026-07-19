# TODO: Phase 3 — Enemy Table (effective DPS / TTK)

Last remaining phase of the approved UI-redesign plan
(`~/.claude/plans/i-want-to-redesign-vivid-heron.md`). Phases 1–2 (scenario
axis, sustain model, trace, state layer, persistence, theme/shell, perk editor,
suggestions/hover-diffs/breakdown) shipped 2026-07-10. Supersedes the older
(now-removed) `enemy-defenses.md` — its resist formula is still the right
starting point (`calculateDamageResistMult` in `src/lib/damage-formulas.ts`,
kept as dormant scaffolding), but that doc's activation steps referenced
pre-redesign architecture (`App.tsx` enemy column, `calculateOutgoingDamage`)
that no longer exists. This is the app's #1 priority remaining feature — see
`dps-todos/README.md`.

## Goal
Full-width sortable table of ~15–20 curated notable enemies below the two
panes, showing per-enemy **effective DPS, % damage retained, and TTK** for the
emphasized scenario. Plus a pinned-enemy chip in the results pane
("vs SBQ · 94s") as the above-the-fold ambassador.

## 3.1 Spike first (gate for everything else) — DONE 2026-07-18

**Already shipped** (2026-07-12 sessions, ahead of the rest of this phase):
- **BPTD body-part / weakpoint data**: `scripts/extract/extract-bodyparts.ts`
  → `generated/bodyparts.json` + `src/data/bodyparts.ts`, including the
  `NPC_`→`RACE` extractor resolution. The Target section
  (`src/components/build/TargetSection.tsx`) has a race + body-part picker
  (categories: raid/infestation/headhunt/standard, grouped Combobox) feeding
  `enemyConfig.conditions.targetRace`/`targetBodyPart`, and
  `resolveLoadout` applies the real per-race multiplier via
  `getBodyPartMult` — the old global ×2.0 weakpoint default is gone.
  Location and weakpoint-ness are modeled separately (torso CAN be the
  weakpoint, user-confirmed).

**Spike resolved 2026-07-18** (full report: `scratchpad/phase2-curve-spike.md`,
terse registry: `docs/assumptions.md` "Creature stat curves & NPC
extraction"): HP/DR/ER live directly on `NPC_.Properties[]` (no template
indirection on the sampled bosses), with resist AVs frequently falling back
to the RACE record instead (found during extractor-build, not the spike
itself). Enemy level maps to the curvetables via
`effectiveLevel = clamp(nearbyPlayerLevel + levelOffsetGlobal,
levelMinGlobal, levelMaxGlobal)`, `curveX = effectiveLevel` — the
`Renorm_*` GLOB family sourced from `NPC_.Actor Scaling Info`. Data slice
SHIPPED same session: `scripts/extract/extract-curvetables.ts` re-extracted
all 4 Universal-Tier curve families (creature health/armor + player
damage/armor were the previously-stale hand-copies — see assumptions.md for
the materiality breakdown), and `scripts/extract/extract-npcs.ts` resolved
all 83 curated targets to a stats-bearing NPC_ record with zero unresolved.
Open item carried to the measurement backlog: Scorchbeast Queen's ESM-derived
HP is ~10× a commonly cited community figure — see
`dps-todos/measurement-backlog.md`.

## 3.2 Extractor + curated overlay — SUPERSEDED + SHIPPED 2026-07-18
Scoping changed from this section's original ~15-20 curated
`notable-enemies.ts` overlay to the newer plan's "every race already in the
target picker" decision (`~/.claude/plans/go-through-every-single-silly-whistle.md`
"Phase 2 — Enemy defenses"): `scripts/extract/extract-npcs.ts` → all 83
`CURATED_TARGETS` rows (shared with `bodyparts.ts`), `src/data/npcs.ts`
accessor, threaded through `dataset.ts`. `src/data/overrides/npc-overrides.ts`
is the REPLACES-not-patches override layer (not the `notable-enemies.ts` this
section originally proposed). Epic-creature eligibility
(`GeneratedNpc.epicAllowed`) added the same session as a coordinator
follow-up — see docs/assumptions.md "Creature stat curves & NPC extraction".
- `scripts/extract/extract-npcs.ts` + registration in `run-all.ts` + checked-in
  fixtures (`scripts/extract/__tests__/fixtures/`) → `generated/npcs.json`.
- Curated `src/data/overrides/notable-enemies.ts` (~15–20 entries, source
  comment per entry) replaces the placeholder `src/data/live/enemies.ts`;
  merge in `dataset.ts` (the single chokepoint). Keep `legendaryRankModifiers`.
- Review `_meta.json` unresolved report after the run.
- Ask the user which enemies matter to them before finalizing the curated list.

## 3.3 Engine: mitigation — DONE 2026-07-18
Shipped as `src/lib/engine/mitigation.ts` (`applyMitigation`) + `src/lib/enemy-defenses.ts`
(`getEnemyDefenses`); `armorPen`/new `armorPenFlat` buckets (regime
`mitigation`, `hasEngineEffect: true`); `armorPen` badge clears in the OMOD
picker (`classifyOmodDisplay`'s dead `needsEnemyDefenses`/`enemyFacing`
branch removed, `OmodBadge` type variant retired). Taking One for the Team's
flat DR debuff shipped exactly as scoped below. `enemyDamageResist` was
renamed `playerDamageResist` mid-session (coordinator correction — Berserker's/
Iron Fist read the WIELDER's own DR, not the enemy's; see
docs/assumptions.md "Berserker's (Damage Unarmored)") — the enemy's resists
are consumed ONLY by mitigation.ts, never by a curve input. Details + measured
Option-A divergence: docs/assumptions.md "Resist mitigation". Original scoping
notes below kept for the record (Bully's-style `Resist = BaseResistance ×
(1 − ArmorPenTotal)` single-line formula was extended per the shipped spec to
add the flat-debuff term, and `enemyType` activation referenced below was
already live before this phase, as the note says).

- Old: New `src/lib/engine/mitigation.ts` applying the dormant
  `calculateDamageResistMult` (`src/lib/damage-formulas.ts`) **per damage
  component** (physical vs energy vs elemental use the matching resist):
  `DamageResistMult = (IncomingDamage × 0.15 / Resist)^0.365`,
  `Resist = BaseResistance × (1 − ArmorPenTotal)`, factor clamps [0.01, 0.99].
- New `armorPen` bucket in `src/types/modifiers.ts` (Incisor / Stabilized /
  Tank Killer / Anti-Armor legendary) — follow the CLAUDE.md new-mechanic
  checklist: bucket + resolve.ts fold + extractor mapping (`normalize/mgef.ts`
  or `extract-omods.ts`) + assumptions.md entry.
- Activate the dormant `enemyType` conditions in `resolve.ts:evalCondition`
  via an `EnemyProfile` (raceEdid / keywords) so Exterminator-style
  damage-vs-X perks finally evaluate per enemy.
- **Taking One for the Team's enemy-Resist debuff** — user-reported
  2026-07-13, esm-walk-confirmed 2026-07-14 (see
  [wholedamage-perks.md](wholedamage-perks.md) and docs/assumptions.md
  "Known gaps"): the hidden companion perk
  `LGN_TakingOneForTheTeam_DamageIncrease_Perk` bundles a `Peak Value
  Modifier` DamageResist debuff (Detrimental, 10s, no Energy Resist) onto the
  attacker alongside its damage-taken bonus — magnitudes **-6 / -10 / -15 /
  -50** DR at ranks 1–4 (MGEF `..._DamageIncrease_Effect01-04`, formIds
  0x005A5DEF/0x005B01AB-AD). The rank-4 jump to 50 (vs an expected ~20) is
  non-arithmetic — flag as a possible ESM data-entry anomaly, not confirmed
  intentional, when modeling. Likely lands as an `armorPen`-shaped ADD once
  that bucket exists, rather than a new bucket.
- Output shape per enemy: `effective: { perHit, sustainedDps, retainedPct, ttk }`.
  TTK = enemy HP / effective sustained DPS (decide burst-vs-sustained per row;
  plan says emphasized-scenario metric drives the table).

## 3.4 UI
- `src/components/enemies/EnemyTableSection.tsx` is already scaffolded behind
  `ENEMY_TABLE_ENABLED = false` — build the real table (new `ui/table.tsx`),
  sortable columns, default toughest-first, reuse `DeltaFlash` on cells, then
  flip the flag.
- Consult the dataviz skill before the table (mark/color validation);
  numbers in Spline Sans Mono `tabular-nums`, ink tokens, phosphor/flare only
  for deltas.
- Pinned-enemy chip in the results pane; emphasized-scenario selection
  (view.emphasized) is the table's metric.

## Verification
- Fixture tests pin NPC normalization against real `esm` output.
- Golden cases for at least one enemy with user-measured in-game damage
  (existing pattern: `expected: null` until measured).
- Suggestion sweep still ~µs/eval? Re-run `perf.bench.ts` — per-enemy
  mitigation multiplies eval count by the enemy list size if suggestions
  become enemy-aware (they don't have to be in v1).

## Related data gaps (not Phase 3 blockers, found during Phase 2)
- Bloody Mess has empty rank modifiers in generated `perks.json` — verified
  still true 2026-07-13 (`ranks: [0,0,0]` modifiers, no override).
- ★4 legendary "BonusDamage x4/x5/x6" raw ESM names; x5 ≡ x6 values — needs
  `legendary-values.ts` overrides. **Re-verify first**: the 20260710 sync's
  4★ enemy-status AV rework may have superseded these records.
- Some magazine omods (10mm, Gatling Gun) do capacity via script MGEF
  (unresolved report).
- **Deferred — UC Titan / Head Hunt bosses / Bigfoot epic ranks** (Phase A —
  epic boss HP mult, 2026-07-19): only SBQ and Storm Goliath got a fixed
  `GeneratedNpc.epicRank` this phase (both rank 3, ESM-proven via their
  summon quest VMAD — see `docs/assumptions.md` "Creature stat curves & NPC
  extraction"). These three were probed and came back rank-less — record the
  findings here so a future session doesn't re-walk the same ground:
  - **UC Titan**: summon quest `E09A_Launcher` 0x0063461B ("Event: Seismic
    Activity") — all 5 `EncounterWaves` entries carry only a `Difficulty`
    field, no `BossEpicLevel`/`BossEpicChance` anywhere, and no
    `defaultforcelegendaryalias` alias script either.
  - **Head Hunt bosses**: 3★ drops come from LVLI
    `Burn_LL_BountyHunt_LegendaryTemplate_3Star_HeadHunt` 0x00833A16 (quest
    `Burn_BountyHunt_Headhunt` 0x007EBDF4) — a loot-list assignment, not an
    epic-rank upgrade. No epic-rank signal anywhere in the quest.
  - **Bigfoot**: 4★ drops come from LGDI
    `RA_LegendaryItems_Weapons_BigfootOnly_Rank4` 0x008833D6 — same
    loot-list pattern, no epic-disallowed keyword, and (per the extractor's
    keyword check) no `BOSS_EPIC_RANK_QUESTS` entry either — Bigfoot has no
    summon-quest analogue among the curated bosses at all.
  - **Earle / Wendigo Colossus** (added 2026-07-19): the user knows him as
    3★ in-game, but NO ESM proof exists — `E06_Colossus` 0x00583D14 carries
    neither VMAD rank shape (checked exhaustively: all 3 EncounterWaves, all
    4 alias scripts), and `SQ_WendigoColossusSummonAllies`, `RB_Master`,
    `E06_PocketWatch`, and the NPC_'s own Keywords/Perks are all empty too.
    The extractor keeps him in `BOSS_EPIC_RANK_QUESTS` so every run emits an
    unresolved note. To close: an in-game HP reading vs. the un-multiplied
    curve prediction (~237–408k over his 80–100 window) would discriminate —
    ×3.2 on top is unmissable — and would justify a USER-MEASURED rank
    entry; alternatively a future dump/deeper mechanism find.
  - **Takeaway**: a boss's drop-list star rating is NOT the same ESM signal
    as a forced epic rank — don't infer one from the other. If a future
    in-game measurement pins a real fixed rank for any of these three, add
    it to `BOSS_EPIC_RANK_QUESTS` (`scripts/extract/extract-npcs.ts`) with a
    source comment citing the actual quest/mechanism found, not the loot
    list.
