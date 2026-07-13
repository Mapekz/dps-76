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

## 3.1 Spike first (gate for everything else) — PARTIALLY DONE 2026-07-12

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

**Still to spike** — run the `esm` CLI (`~/.local/bin/esm`; dump path comes
from `FO76_ESM_PATH`, currently `~/dev/fo76/Data/20260710/SeventySix.esm`)
against known NPCs — Earle, Scorchbeast Queen, Super Mutant — to pin down:
- Where HP/DR/ER actually live: `NPC_` record vs `RACE` vs leveled/template
  chains (TPLT). Expect template indirection.
- How enemy level maps to the already-extracted
  `armor_universal_tier*.json` curvetables.

Findings → `docs/assumptions.md`. CLI quirks to remember: `list --limit 0`
returns `[]` (use `--limit 99999`), `search` needs `"*"` not `""`, `list`
never returns names.

## 3.2 Extractor + curated overlay
- `scripts/extract/extract-npcs.ts` + registration in `run-all.ts` + checked-in
  fixtures (`scripts/extract/__tests__/fixtures/`) → `generated/npcs.json`.
- Curated `src/data/overrides/notable-enemies.ts` (~15–20 entries, source
  comment per entry) replaces the placeholder `src/data/live/enemies.ts`;
  merge in `dataset.ts` (the single chokepoint). Keep `legendaryRankModifiers`.
- Review `_meta.json` unresolved report after the run.
- Ask the user which enemies matter to them before finalizing the curated list.

## 3.3 Engine: mitigation
- New `src/lib/engine/mitigation.ts` applying the dormant
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
