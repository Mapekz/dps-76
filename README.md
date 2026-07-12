# DPS 76

A Fallout 76 outgoing-DPS calculator. Configure your player build — perks, weapon, SPECIAL stats, and conditions — then optionally import a build URL from [Nukes & Dragons](https://nuclearwinter.wiki/nukes-and-dragons/) to see per-hit damage and DPS for weakpoint and non-weakpoint hits.

**Live app:** <https://mapekz.github.io/dps-76/>

> **MVP scope**: currently calculates outgoing DPS only. Enemy/incoming damage is scaffolded but dormant. The Live/PTS toggle UI is present but disabled for now. See `todos/` for the deferred feature backlog.

## Tech stack

- React 19 + TypeScript (strict)
- Vite 8 (Rolldown-based bundler, built in)
- Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com/) (Radix UI primitives)
- No test framework (tests are manual)

## Getting started

This project uses **pnpm**. Do not use npm or yarn.

```sh
pnpm install
pnpm dev        # dev server with HMR at http://localhost:5173
pnpm build      # typecheck (tsc -b) + production build → dist/
pnpm lint       # ESLint
pnpm preview    # serve the production build locally
```

### GitHub Pages deploy

```sh
pnpm build:gh-pages   # NODE_ENV=production build with base URL /dps-76/
```

CI deploys automatically via `.github/workflows/deploy.yml` on push to `main`.

## Data model

Two parallel datasets live under `src/data/`:

```
src/data/
  live/    perks.ts  weapons.ts  enemies.ts  armor.ts  power-armor.ts  curvetables/
  pts/     perks.ts  weapons.ts  enemies.ts  armor.ts  power-armor.ts  curvetables/
```

Each `curvetables/` directory contains ~360 JSON files (creature HP/armor curves and player damage curves). Data is accessed mode-aware via `src/data/index.ts` (`getPerks(mode)`, `getWeapons(mode)`, etc.) and the `useGameMode` React context (`src/hooks/useGameMode.tsx`).

The default game mode is `'live'`. PTS mode is selectable in code but the toggle UI is currently disabled.

## Project structure

```
src/
  components/
    layout/     Header.tsx  ThreeColumnLayout.tsx  BuildUrlInput.tsx
    player/     PlayerColumn.tsx
    enemy/      EnemyColumn.tsx  (scaffolded, not rendered in MVP)
    stats/      DamageStatsColumn.tsx
    ui/         shadcn/ui wrappers (24 components)
  data/         live/ + pts/ datasets + index.ts + stats.ts + perk-ids.ts
  hooks/        useGameMode.tsx  useDamageCalc.ts
  lib/          damage-formulas.ts  curve-tables.ts  fire-rate.ts  nukes-dragons.ts  utils.ts
  types/        index.ts  (all shared types)
  main.tsx      App.tsx
```
