# DPS 76

A Fallout 76 outgoing-DPS calculator. Configure your player build — perks, weapon, SPECIAL stats, and conditions — then optionally import a build URL from [Nukes & Dragons](https://nuclearwinter.wiki/nukes-and-dragons/) to see per-hit damage and DPS for weakpoint and non-weakpoint hits.

**Live app:** <https://mapekz.github.io/dps-76/>

> **Scope**: outgoing DPS plus enemy defenses (resist mitigation). The Live/PTS toggle UI is present but disabled until a PTS ESM dump lands. Deferred work is tracked as [GitHub Issues](https://github.com/Mapekz/dps-76/issues).

## Tech stack

- React 19 + TypeScript (strict)
- Vite 8 (Rolldown-based bundler, built in)
- Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com/) (Base UI primitives)
- `bun test` — see [`CLAUDE.md`](./CLAUDE.md#testing) for the suite breakdown

## Getting started

Uses **Bun** as the package manager and script runner — not npm/yarn/pnpm. See
[`CLAUDE.md`](./CLAUDE.md) for why Vite/tsc still run under Node under the hood.

```sh
bun install
bun run dev        # dev server with HMR at http://localhost:5173
bun run build      # typecheck (tsc -b) + production build → dist/
bun run lint       # oxlint
bun run preview    # serve the production build locally
```

### GitHub Pages deploy

```sh
bun run build:gh-pages   # NODE_ENV=production build with base URL /dps-76/
```

CI deploys automatically via `.github/workflows/deploy.yml` on push to `main`.

## Architecture

Game data is extracted from the ESM (not hand-authored), merged through an overlay
pipeline, and fed to a synthetic-data-testable damage engine — see
[`CLAUDE.md`](./CLAUDE.md) for the full data-pipeline and module map, and
[`CONTEXT.md`](./CONTEXT.md) for the domain vocabulary (Bucket, Scenario, Loadout, ...).
