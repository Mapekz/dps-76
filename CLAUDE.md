# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Fallout 76 DPS (Damage Per Second) calculator web application. It computes the full paper-damage formula (crit, sneak, power attack, weakpoint, tenderizer, legendary effects, mutations, consumables) for player builds, with game data extracted directly from the game's ESM file.

## Development Commands

- `pnpm dev` - Start development server with HMR
- `pnpm build` - Type check and build for production
- `pnpm build:gh-pages` - Build for GitHub Pages deployment (sets NODE_ENV=production)
- `pnpm test` - Run vitest suite (engine unit tests, extraction fixtures, golden cases)
- `pnpm lint` - Run ESLint
- `pnpm preview` - Preview production build locally
- `pnpm extract --esm <path-to-SeventySix.esm> --mode live [--only weapons,perks,omods,buffs]` - Regenerate game data from an ESM dump (requires the `esm` CLI on PATH)
- `pnpm extract:diff [--base HEAD]` - Markdown review report of generated-data changes vs a git ref; run after every extraction

This project uses **pnpm** as the package manager, not npm or yarn.

## Architecture Overview

### Data Pipeline (ESM → generated JSON → app)

Game data is **extracted, not hand-authored**:

1. `scripts/extract/` shells out to the `esm` CLI against a SeventySix.esm dump
   (`esm-client.ts` wraps it; a warm daemon makes repeated `get`s cheap).
2. Extractors emit checked-in JSON under `src/data/<mode>/generated/`
   (`weapons.json`, `perks.json`, `omods.json`, `mutations.json`,
   `consumables.json`, plus `_meta.json` with unresolved-items and
   `excludedDetailed` reports — review both after every run).
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
where `curveScale` multiplies the interpolated curve Y.

The engine lives in `src/lib/engine/`:
- `resolve.ts` - condition evaluation + bucket folds via the shared `foldOps` primitive (SET → ×Π(1+MUL_ADD) → +ΣADD)
- `paper-damage.ts` - the spec formula, per damage component
- `crit-meter.ts` - steady-state VATS crit cadence from LCK/Crit Savvy/Limit Breaking
- `scenarios.ts` - one config → Manual Aim / VATS / VATS+Sneak results
- `effective-weapon.ts` - applies equipped OMODs (keywords, speed, auto state) before the engine runs

`src/lib/damage-formulas.ts` retains only the dormant enemy DR/ER scaffolding
(paper damage v1 has no enemy mitigation). `docs/assumptions.md` documents
every value the engine asserts that isn't proven by ESM data — keep it current.

### Damage Calculation Flow

1. **Configuration:** Player and Enemy configs are managed in `App.tsx` state
2. **Calculation:** `resolveLoadout` (`src/lib/loadout.ts`) assembles the
   effective weapon + modifier list (perks, legendary perks, OMODs, legendary
   effects, mutations, consumables) into a `ScenarioInput`; the `useDamageCalc`
   hook is a thin wrapper that feeds it to `computeScenarios()`
3. **Display:** `DamageStatsColumn` renders the three scenario columns

### Game Mode System

The `useGameMode` hook provides context for 'live' vs 'pts'. Only one ESM is
extracted today — pts re-exports live until a PTS dump is dropped in and
`pnpm extract --mode pts` is run. The Header toggle stays disabled meanwhile.

### Component Structure

- `src/components/layout/` - Page layout (Header, ThreeColumnLayout, BuildUrlInput)
- `src/components/player/` - Player configuration UI (PlayerColumn: weapon/mods/legendary pickers, SPECIAL, conditions)
- `src/components/enemy/` - Enemy configuration UI (EnemyColumn — built but unmounted until enemy defenses land)
- `src/components/stats/` - Damage statistics display (DamageStatsColumn)
- `src/components/ui/` - Reusable UI components (Radix UI wrappers with Tailwind styling)

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

- Uses **rolldown-vite** (experimental Rolldown bundler) instead of standard Vite
- TypeScript with strict mode; `pnpm.overrides` live in `pnpm-workspace.yaml` (pnpm 11)
- Tailwind CSS v4 with @tailwindcss/vite plugin
- Base URL is `/dps-76/` for production builds (GitHub Pages) and `/` for dev

## Adding / Fixing Game Data

1. Prefer re-running `pnpm extract` over hand-editing anything in `generated/`.
2. Wrong or missing values go in `src/data/overrides/*` with a source comment.
3. New damage mechanics usually need: a `Bucket` or `Condition` in
   `src/types/modifiers.ts`, evaluation in `src/lib/engine/resolve.ts`, a
   mapping in the extractor (`normalize/mgef.ts` or `extract-omods.ts`), and an
   entry in `docs/assumptions.md` if any value is not ESM-proven.
4. Check `_meta.json` unresolved reports after extraction — silent gaps are bugs.
