# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Fallout 76 DPS (Damage Per Second) calculator web application. It computes the full paper-damage formula (crit, sneak, power attack, weakpoint, tenderizer, legendary effects, mutations, consumables) for player builds, with game data extracted directly from the game's ESM file.

## Development Commands

- `bun run dev` - Start development server with HMR
- `bun run build` - Type check and build for production
- `bun run build:gh-pages` - Build for GitHub Pages deployment (sets NODE_ENV=production)
- `bun run typecheck` - `tsc -b` only, no build (CI runs this as its own gate)
- `bun run test` - Run the test suite (see "Testing" below)
- `bun run bench` - Run the suggestion-engine hot-path benchmark (`scripts/bench-engine.ts`)
- `bun run lint` / `bun run lint:fix` - Run oxlint (Rust-based; not ESLint)
- `bun run lint:design` - Design-system lint (`scripts/lint-design.ts`) — CI runs this as its own gate, separate from `lint`
- `bun run fmt` / `bun run fmt:check` - Format with oxfmt
- `bun run preview` - Preview production build locally
- `bun run extract --esm <path-to-SeventySix.esm> --mode live [--only weapons,perks,omods,buffs]` - Regenerate game data from an ESM dump (requires the `esm` CLI on PATH). `--esm` can be omitted if the `FO76_ESM_PATH` env var is set instead; `bun run esm:walk` uses the same fallback.
- `bun run extract:diff [--base HEAD]` - Markdown review report of generated-data changes vs a git ref; run after every extraction
- `bun run vet:weapons` - Check the vetted weapon roster against the current extraction (see the weapon-vetting skill)
- `bun run audit:inert` - Audit for modifiers on inert/no-effect buckets
- `bun run wire-dict:build` - Sync append-only wire dictionaries from the merged dataset (`scripts/build-wire-dictionary.ts`)

This project uses **Bun** as the package manager and script runner (`bun install`, `bun run <script>`),
not npm/yarn/pnpm. Vite and `tsc` still run under **Node** — their `#!/usr/bin/env node`
shebangs make `bun run <script>` delegate to Node automatically, so Node stays installed
(CI pins `node-version: '24'`). Tests run on the Bun runtime itself (`bun test`, see "Testing"
below), same as script execution (`extract`/`extract:diff`/`vet:weapons`/`bench`) and dependency
installation; never run Vite under `bun --bun` — Vite 8's Rolldown bundler hits an open Bun N-API
bug ([oven-sh/bun#26388](https://github.com/oven-sh/bun/issues/26388)).

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
   Curve tables (`bun run extract --only curvetables`) are likewise always
   re-extracted from the dump's `misc/curvetables/` via the `esm` CLI, never
   hand-copied — treat any hand-edited curve JSON as stale by default.
3. `src/data/overrides/` is the hand-maintained layer that survives
   regeneration: N&D key fixes (`perk-overrides.ts`), script-computed
   legendary values (`legendary-values.ts`, `buff-overrides.ts`), weapon
   corrections and hidden ids (`corrections.ts`). Every entry needs a source
   comment.
4. `src/data/dataset.ts` is the merge chokepoint: `getDataset(mode)` applies
   every overlay once and resolves the live/pts split in one place. The
   `src/data/*.ts` accessors (`getWeapons(mode)`, `getOmodSlots`,
   `getLoadoutModifiers`, ...) are thin reads over it. Share-link and
   localStorage encoding resolve ids through `src/data/wire-dictionary/` — see
   `docs/adr/0018-build-share-urls-encode-dictionary-indices.md`.

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
- `resolve.ts` - condition evaluation + bucket folds via the shared `foldOps` primitive: `(last SET ?? base) + (Σ MUL_ADD) × base + Σ ADD` — additive, not multiplicative (see `docs/architecture.md`'s Modifier IR reference for the one exception)
- `paper-damage.ts` - the spec formula, per damage component
- `crit-meter.ts` - steady-state VATS crit cadence from LCK/Crit Savvy/Limit Breaking
- `scenarios.ts` - one config → Free Aim / VATS results (sneak is a player condition, not a third scenario)
- `effective-weapon.ts` - applies equipped OMODs (keywords, speed, auto state) before the engine runs
- `mitigation.ts` - enemy DR/ER mitigation (Phase 2 — Enemy defenses), applied once per scenario to the blended `HitBreakdown` (Option A)

`docs/assumptions.md` is a terse registry of every value the engine asserts
that isn't proven by ESM data — see `.claude/skills/docs-writing/SKILL.md`
for entry format, section-name-as-API rules, and where non-assumption
content (investigation narrative, mechanic explanations, measurement TODOs)
actually belongs.

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
   see `CONTEXT.md`'s **Scenario** entry for the sneak-is-a-condition rule).

### Game Mode System

The `useGameMode` hook provides context for 'live' vs 'pts'. Only one ESM is
extracted today — pts re-exports live until a PTS dump is dropped in and
`bun run extract --mode pts` is run. The Header toggle stays disabled meanwhile.

### Component Structure

- `src/components/layout/` - Page shell (`AppShell` mounts `Header` + `BuildColumn` + `ResultsPane`), `BuildUrlInput` (N&D import), `ThemeToggle`
- `src/components/build/` - Player/enemy configuration UI, mounted as `BuildColumn`'s accordion sections (`TargetSection` is the one place enemy config lives; there is no separate enemy column) — see `docs/architecture.md`'s UI flow section for the actual section list and order, rather than restating it here where it can drift out of sync with `BuildColumn.tsx`
- `src/components/results/` - Damage statistics display: `ResultsPane` renders `HeadlineStrip` (which renders the scenario cards), plus `CritGauge`, `DeltaFlash`, `BreakdownPanel`, `MultiplierChainTable`, `SuggestionsPanel`
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
- `bun test --parallel --path-ignore-patterns='**/.claude/**'` (`bun run test`) is the sole
  runner (CI runs it) — `bun:test`'s `describe`/`it`/`expect`/`vi` cover the whole suite (no
  DOM/component tests, no coverage tooling). The ignore pattern is load-bearing: without it,
  `bun test` also walks the vendored skill docs symlinked under `.claude/skills/`. `--parallel`
  (which implies `--isolate`) is **mandatory, not a perf knob**: bare `bun test` shares one
  module registry across files, so a
  `vi.mock` in one file can silently patch the module another file imports.
  Confirmed reproducible instance: `build-reducer.test.ts`'s `@/lib/consumable-rules`
  mock leaks into `src/lib/persist/__tests__/codec.test.ts` and breaks it, in
  either file order, without `--isolate` — see
  `src/lib/__tests__/enemy-defenses.test.ts`'s doc-comment.
- `vi.mock` factories run unhoisted-but-eager under Bun (no `vi.hoisted`/
  `vi.importActual`); a partial mock must import the real module by
  namespace *before* calling `vi.mock` and snapshot any delegated function
  into a local const first, not call it off that namespace inside the
  factory (it recurses into the mock once installed — confirmed: hangs,
  doesn't throw). See `src/lib/persist/__tests__/codec.test.ts` and
  `src/lib/__tests__/loadout-ordering.test.ts`'s doc comments for the
  worked pattern.

## Import Path Alias

The project uses `@` as an alias for `src/`:
```typescript
import { computeScenarios } from '@/lib/engine/scenarios';
import { useGameMode } from '@/hooks/useGameMode';
```

## Build Configuration

- Uses **Vite 8**, which bundles Rolldown natively (no more separate `rolldown-vite` alias/override)
- TypeScript **7** (the native Go compiler — `tsc` *is* the Go binary in TS7, ships no `tsserver`;
  editors need the dedicated TS7 language-server extension). Nothing in the toolchain pins the TS
  version — `oxlint` (see below) has no dependency on the `typescript` package.
- **The whole React pipeline runs natively on Oxc — no Babel anywhere.**
  `@vitejs/plugin-react@6` does the JSX transform and Fast Refresh via `oxc`'s built-in
  transformer (no `babel` option exists on the plugin at all), and `vite.config.ts` passes
  `compiler: true`, which lazy-loads `oxc-transform-react` — the Rust port of React Compiler,
  running on the Oxc AST — to auto-memoize components and hooks. Left at the default
  `compilationMode` (`infer`: compile everything it can, skip what it can't); `'all'` would
  force plain non-component functions through it too.
  - **`src/workers/refresh-shim.ts` is load-bearing for this** and must stay the *first* import
    in `suggestions.worker.ts`. In `compiler: true` mode the plugin Fast-Refresh-wraps every
    file it transforms regardless of whether the compiler compiled it, and its `isClient` check
    (`consumer !== 'server'`) doesn't distinguish the main window from a Web Worker. The
    suggestions Worker shares most of its import graph with the app, so dual-consumed plain-TS
    files (`src/state/build-reducer.ts`, `src/lib/engine/scenarios.ts`, …) arrive carrying
    `$RefreshReg$` calls whose runtime only ever reaches the main window. The shim installs
    no-ops in worker scope (dev-only; stripped from the production bundle). Two things that do
    **not** work, so don't retry them: excluding the worker file just moves the error to the next
    shared file, and Vite's `worker.plugins` override is build-only, inert in dev. Tracked
    upstream as dps-76#87 — delete the shim once that check is fixed.
- Linting is **oxlint**, not ESLint — `.oxlintrc.json` at the repo root. `bun run lint` /
  `bun run lint:fix`. Formatting is **oxfmt** — `.oxfmtrc.json`; `bun run fmt` / `bun run fmt:check`.
  Both are Oxc/Rust-based, chosen for speed (lint dropped from ~5s to well under 1s). oxlint's
  `react` plugin covers eslint-plugin-react-hooks + react-refresh under different rule names
  (`react/exhaustive-deps`, `react/only-export-components` — note the renamed prefix vs the old
  `react-hooks/`/`react-refresh/` ESLint plugins), plus the React Compiler's own static analysis
  run as lint rules. **oxlint 1.79 removed the single `react/react-compiler` rule and split it
  into 22 granular ones**, so `.oxlintrc.json` enumerates 17 of them (`react/refs`,
  `react/set-state-in-effect`, `react/purity`, `react/preserve-manual-memoization`, …) and
  deliberately omits 5 — `invariant`, `todo`, `syntax`, `unsupported-syntax`,
  `rule-suppression` — which report "the Rust compiler port hit an unimplemented case" rather
  than a defect anyone here can fix. (With `--deny-warnings` there is no non-fatal tier to park
  those in; it's on or off.) These rules report where the compiler bails out of optimizing, and
  **a bailout is a lint error to fix, not suppress** — see `BuildUrlInput.tsx` for the
  `React.useEffectEvent` fix for ref-during-render and `useSuggestions.ts`'s `isReportStale` for
  the derived-render-time replacement of setState-in-effect. Two standing exceptions, both
  commented at their site: `no-redeclare` is off for TS files (1.79 began flagging the legal
  `export const X` + `export type X` companion-object idiom; reported as oxc-project/oxc#25936
  and closed NOT_PLANNED, with the maintainer advising exactly this since `tsc` already errors
  TS2451 on a real redeclaration), and `react/exhaustive-effect-dependencies` is suppressed on
  `useSuggestions`'s recompute effect, whose deps are deliberate restart-on-change triggers the
  rule has no way to express. oxfmt formats JSON by
  default with no per-language opt-out, so `.oxfmtrc.json`'s `ignorePatterns` — excluding
  `src/data/*/generated/**`, `src/data/*/curvetables/**`, and all `.md`/`.yml`/`.yaml` — is
  load-bearing: without it, every `bun run extract` would reformat hundreds of generated files,
  and prose docs/vendored skill files (`skills-lock.json` pins their hashes) would get silently
  reflowed by oxfmt's bundled Prettier.
- Tailwind CSS v4 with @tailwindcss/vite plugin
- Base URL is `/dps-76/` for production builds (GitHub Pages) and `/` for dev

## Adding / Fixing Game Data

1. Prefer re-running `bun run extract` over hand-editing anything in `generated/`.
2. Wrong or missing values go in `src/data/overrides/*` with a source comment.
3. New damage mechanics usually need: a `Bucket` or `Condition` in
   `src/types/modifiers.ts`, evaluation in `src/lib/engine/resolve.ts`, a
   mapping in the extractor (`normalize/mgef.ts` or `extract-omods.ts`), and —
   if any value isn't ESM-proven — a terse entry in `docs/assumptions.md`
   (one claim, a status tag, a code pointer; not a narrated writeup). ESM
   plumbing (`STAT_DamagePerk` et al.) informs bucket routing; when adding a
   new damage-modifying mechanic, confirm whether it's additive or
   multiplicative in the dbm parenthesis — except `'Mod Weapon DMG Bonus Mult'`
   routing (`normalize/mgef.ts`), always additive.
4. Check `_meta.json` unresolved reports after extraction — silent gaps are bugs.
5. After `bun run extract` (or any change that adds/removes app-facing ids),
   run `bun run wire-dict:build` and review its report before committing —
   `src/data/wire-dictionary/__tests__/dictionary.test.ts` fails CI if the
   dictionary is stale.

## Agent skills

- **Issue tracker**: GitHub Issues on `Mapekz/dps-76` via the `gh` CLI; label
  vocabulary and conventions are in `docs/agents/issue-tracker.md`.
- **Domain docs**: `CONTEXT.md` + `docs/adr/` + `docs/assumptions.md` — see
  `docs/agents/domain.md`.
- **Docs conventions**: the four doc genres, placement matrix, and ADR shape
  live in `.claude/skills/docs-writing/SKILL.md`.
