# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Fallout 76 DPS (Damage Per Second) calculator web application. It computes the full paper-damage formula (crit, sneak, power attack, weakpoint, tenderizer, legendary effects, mutations, consumables) for player builds, with game data extracted directly from the game's ESM file.

## Development Commands

- `bun run dev` - Start development server with HMR
- `bun run build` - Type check and build for production
- `bun run build:gh-pages` - Build for GitHub Pages deployment (sets NODE_ENV=production)
- `bun run test` - Run vitest suite (engine unit tests, extraction fixtures, golden cases)
- `bun run lint` / `bun run lint:fix` - Run oxlint (Rust-based; not ESLint)
- `bun run fmt` / `bun run fmt:check` - Format with oxfmt
- `bun run preview` - Preview production build locally
- `bun run extract --esm <path-to-SeventySix.esm> --mode live [--only weapons,perks,omods,buffs]` - Regenerate game data from an ESM dump (requires the `esm` CLI on PATH). `--esm` can be omitted if the `FO76_ESM_PATH` env var is set instead; `bun run esm:walk` uses the same fallback.
- `bun run extract:diff [--base HEAD]` - Markdown review report of generated-data changes vs a git ref; run after every extraction

This project uses **Bun** as the package manager and script runner (`bun install`, `bun run <script>`),
not npm/yarn/pnpm. Vite, Vitest, and `tsc` still run under **Node** — their `#!/usr/bin/env node`
shebangs make `bun run <script>` delegate to Node automatically, so Node stays installed
(CI pins `node-version: '24'`). Only script execution (`extract`/`extract:diff`/`vet:weapons`)
and dependency installation use the Bun runtime itself; never run Vite/Vitest under `bun --bun` —
Vite 8's Rolldown bundler hits an open Bun N-API bug ([oven-sh/bun#26388](https://github.com/oven-sh/bun/issues/26388)).

## Architecture Overview

### Data Pipeline (ESM → generated JSON → app)

Game data is **extracted, not hand-authored**:

1. `scripts/extract/` shells out to the `esm` CLI against a SeventySix.esm dump
   (`esm-client.ts` wraps it; a warm daemon makes repeated `get`s cheap).
2. Extractors emit checked-in JSON under `src/data/<mode>/generated/`
   (`weapons.json`, `perks.json`, `omods.json`, `mutations.json`,
   `consumables.json`). They also write a local-only `_meta.json` (gitignored
   — it embeds the absolute ESM path used) with unresolved-items and
   `excludedDetailed` reports — review both after every run.
   Weapons/omods carry an `obtainable` flag derived from ESM reverse
   references (`scripts/extract/obtainability.ts`: COBJ/GMRW/LGDI/QUST/CONT/
   MISC/FLST direct refs, recursive player-facing LVLI chains, modcol OMOD
   chains, obtainable-WEAP inheritance). `obtainable: false` records stay in
   the JSON but are hidden app-side; rescue false negatives via
   `forceVisibleWeaponIds`/`forceVisibleOmodIds` in `overrides/corrections.ts`
   — no re-extract needed. Script-granted quest rewards (VMAD properties)
   have NO record-level reverse refs and always need the rescue list.
3. `src/data/overrides/` is the hand-maintained layer that survives
   regeneration: N&D key fixes (`perk-overrides.ts`), script-computed
   legendary values (`legendary-values.ts`, `buff-overrides.ts`), weapon
   corrections and hidden ids (`corrections.ts`). Every entry needs a source
   comment.
4. `src/data/dataset.ts` is the merge chokepoint: `getDataset(mode)` applies
   every overlay once and resolves the live/pts split in one place. The
   `src/data/*.ts` accessors (`getWeapons(mode)`, `getOmodSlots`,
   `getLoadoutModifiers`, ...) are thin reads over it.

Key extraction insight: perk/mutation/legendary stat semantics are data-driven
from the game's hidden "plumbing" perks (`STAT_DamagePerk`,
`STAT_CritDamagePerk`, `STAT_DamageVsPerk`) — each `STAT_*` actor value maps to
a formula bucket via `scripts/extract/normalize/mgef.ts`. OMOD properties come
from recursively flattened `Includes` chains.

### Modifier IR and Damage Engine

Every damage source normalizes to one shape (`src/types/modifiers.ts`):
`{ bucket, op: SET|MUL_ADD|ADD, conditions[] }` plus a value discriminated on
`curve` — either `value` (raw decimal, 0.25 = +25%) or `{ curve, curveScale }`
where `curveScale` multiplies the interpolated curve Y. Shorthand: **DBM**
(Damage Bonus Mult) and its flavors — CritDBM, SneakDBM, PowerAttackDBM,
WeakptDBM — are defined once in that file's `Bucket` doc-comment; reuse those
terms rather than re-deriving them.

The engine lives in `src/lib/engine/`:
- `resolve.ts` - condition evaluation + bucket folds via the shared `foldOps` primitive (SET → ×Π(1+MUL_ADD) → +ΣADD)
- `paper-damage.ts` - the spec formula, per damage component
- `crit-meter.ts` - steady-state VATS crit cadence from LCK/Crit Savvy/Limit Breaking
- `scenarios.ts` - one config → Manual Aim / VATS / VATS+Sneak results
- `effective-weapon.ts` - applies equipped OMODs (keywords, speed, auto state) before the engine runs
- `mitigation.ts` - enemy DR/ER mitigation (Phase 2 — Enemy defenses), applied once per scenario to the blended `HitBreakdown` (Option A)

`docs/assumptions.md` is a terse
registry of every value the engine asserts that isn't proven by ESM data —
one claim per bullet with a status tag and a code pointer. Keep entries terse:
investigation narrative belongs in the commit message, in-game measurement
TODOs are tracked as GitHub issues (label `needs-measurement`), and an explanation of how a
mechanic works (even an ESM-proven one) belongs in the implementing
function's doc-comment, not in the registry. Section names are cited
verbatim across the codebase (including generated `omods.json`) — don't
rename or merge one without updating its citations.

### Damage Calculation Flow

1. **Configuration:** Player and Enemy configs live in `BuildState` (`src/state/build-reducer.ts`),
   held by a `useReducer` + split context (`src/state/BuildProvider.tsx`, split into
   `BuildStateContext`/`BuildDispatchContext` so state reads and the dispatch
   function don't force unrelated re-renders). `App.tsx` holds no build state
   itself — it only wires up the provider tree and the hydration/warnings banner.
2. **Calculation:** `resolveLoadout` (`src/lib/loadout.ts`) assembles the
   effective weapon + modifier list (perks, legendary perks, OMODs, legendary
   effects, mutations, consumables) into a `ScenarioInput`; `useScenarioResults`
   (`src/state/useScenarioResults.ts`) is a thin `useMemo` wrapper that feeds
   it to `computeScenarios()` and resolves which scenario is emphasized.
3. **Display:** `ResultsPane` (`src/components/results/`) renders the two
   scenario cards (Free Aim / VATS — see `ScenarioKey` in `build-reducer.ts`;
   sneak is a player condition, not a third scenario).

### Game Mode System

The `useGameMode` hook provides context for 'live' vs 'pts'. Only one ESM is
extracted today — pts re-exports live until a PTS dump is dropped in and
`bun run extract --mode pts` is run. The Header toggle stays disabled meanwhile.

### Component Structure

- `src/components/layout/` - Page shell (`AppShell` mounts `Header` + `BuildColumn` + `ResultsPane`), `BuildUrlInput` (N&D import), `ThemeToggle`
- `src/components/build/` - Player/enemy configuration UI, mounted as `BuildColumn`'s accordion sections: `WeaponSection`, `ArmorSection`, `SpecialLoadoutSection`/`SpecialSection`, `PerkEditorSection`, `TeamSection`, `BuffsSections` (mutations/magazines/bobbleheads/chems/food-drink), `ConditionsSection`, `TargetSection` (enemy/target + body-part selection — the one place enemy config lives; there is no separate enemy column), `StatSummary`
- `src/components/results/` - Damage statistics display: `ResultsPane` renders `HeadlineStrip` + one `ScenarioCard` per scenario (Free Aim / VATS), plus `CritGauge`, `DeltaFlash`, `BreakdownPanel`, `MultiplierChainTable`, `SuggestionsPanel`
- `src/components/diff/` - N&D-import delta annotations (`ActionDelta`, `DiffTooltip`)
- `src/components/ui/` - Reusable UI components (Base UI wrappers with Tailwind styling — not Radix)

### Nukes & Dragons Integration

`src/lib/nukes-dragons.ts` parses N&D build URLs: `p=` (perk loadout, keys
mapped to PerkIds) and `s=` (SPECIAL as 7 hex digits). The PerkId registry
(`src/data/live/perks.ts`) joins to ESM perk families by normalized display
name in `src/data/perk-modifiers.ts`; misses are patched in
`overrides/perk-overrides.ts` and reported by `getUnjoinedPerkIds()`.

## Testing

- Engine unit tests use synthetic weapons/modifiers with hand-computed expectations.
- Extraction fixture tests pin normalization against checked-in real `esm` output
  (`scripts/extract/__tests__/fixtures/`).
- Golden cases (`src/lib/engine/__tests__/golden/cases.json`) hold in-game
  measured numbers; `expected: null` cases are skipped until measured.

## Import Path Alias

The project uses `@` as an alias for `src/`:
```typescript
import { computeScenarios } from '@/lib/engine/scenarios';
import { useGameMode } from '@/hooks/useGameMode';
```

## Build Configuration

- Uses **Vite 8**, which bundles Rolldown natively (no more separate `rolldown-vite` alias/override)
- TypeScript **7** (the native Go compiler — `tsc` *is* the Go binary in TS7, ships no `tsserver`;
  editors need the dedicated TS7 language-server extension). Previously pinned to `~6.0.3` because
  `typescript-eslint@8.x` only supports `typescript <6.1.0`; that pin was dropped, not merely
  bumped — ESLint/typescript-eslint were replaced by `oxlint` (see below), which has no dependency
  on the `typescript` package, so nothing in the toolchain constrains the TS version anymore.
- Linting is **oxlint**, not ESLint — `.oxlintrc.json` at the repo root. `bun run lint` /
  `bun run lint:fix`. Formatting is **oxfmt** — `.oxfmtrc.json`; `bun run fmt` / `bun run fmt:check`.
  Both are Oxc/Rust-based, chosen for speed (lint dropped from ~5s to well under 1s). oxlint's
  `react` plugin covers eslint-plugin-react-hooks + react-refresh under different rule names
  (`react/exhaustive-deps`, `react/only-export-components` — note the renamed prefix vs the old
  `react-hooks/`/`react-refresh/` ESLint plugins). It has **no equivalent** for
  `react-hooks/set-state-in-effect`; that pattern (see `src/hooks/useSuggestions.ts`) is now just a
  plain comment, not a suppressed lint rule. oxfmt formats JSON by default with no per-language
  opt-out, so `.oxfmtrc.json`'s `ignorePatterns` — excluding `src/data/*/generated/**`,
  `src/data/*/curvetables/**`, and all `.md`/`.yml`/`.yaml` — is load-bearing: without it, every
  `bun run extract` would reformat hundreds of generated files, and prose docs/vendored skill files
  (`skills-lock.json` pins their hashes) would get silently reflowed by oxfmt's bundled Prettier.
- Tailwind CSS v4 with @tailwindcss/vite plugin
- Base URL is `/dps-76/` for production builds (GitHub Pages) and `/` for dev

## Adding / Fixing Game Data

1. Prefer re-running `bun run extract` over hand-editing anything in `generated/`.
2. Wrong or missing values go in `src/data/overrides/*` with a source comment.
3. New damage mechanics usually need: a `Bucket` or `Condition` in
   `src/types/modifiers.ts`, evaluation in `src/lib/engine/resolve.ts`, a
   mapping in the extractor (`normalize/mgef.ts` or `extract-omods.ts`), and —
   if any value isn't ESM-proven — a terse entry in `docs/assumptions.md`
   (one claim, a status tag, a code pointer; not a narrated writeup).
4. Check `_meta.json` unresolved reports after extraction — silent gaps are bugs.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `Mapekz/dps-76`, via the `gh` CLI.
See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical vocabulary — `needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root, plus
`docs/assumptions.md` for engine claims. See `docs/agents/domain.md`.
