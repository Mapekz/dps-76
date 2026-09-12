# AGENTS.md

Guidance for coding agents working in this repository.

## What this is

A Fallout 76 outgoing-DPS calculator. It computes the full paper-damage formula (crit,
sneak, power attack, weakpoint, tenderizer, legendary effects, mutations, consumables)
for a player build, with every game value extracted from the game's `SeventySix.esm`.

Three docs carry the map, and this file does not restate them:

- `docs/architecture.md` holds the layer map, the calculation call chain, the Modifier IR
  fold arithmetic, the UI flow, and a module index. Read it before any structural change.
  `doc-citations.test.ts` checks its paths against the real module tree, so it fails CI
  instead of rotting.
- `CONTEXT.md` is the glossary. Use its words for domain concepts; it also marks the
  synonyms to avoid.
- `docs/agents/domain.md` explains how the rest of the doc set fits together.

What follows is only what those cannot tell you: the conventions and traps that nothing
in the tree confesses on its own.

## Toolchain

Bun is the package manager and script runner (`bun install`, `bun run <script>`), not
npm, yarn, or pnpm. `package.json` lists every script. These are the parts a script name
does not reveal.

- Vite and `tsc` run under Node. Their shebangs make `bun run` delegate, and CI pins Node
  24. Never run Vite under `bun --bun`; Vite 8's Rolldown bundler hits an open Bun N-API
  bug ([oven-sh/bun#26388](https://github.com/oven-sh/bun/issues/26388)).
- TypeScript 7. `tsc` is the native Go binary and ships no `tsserver`, so editors need the
  dedicated TS7 language-server extension.
- Vite 8 bundles Rolldown natively. Tailwind v4 via `@tailwindcss/vite`. Base URL is
  `/dps-76/` for production builds (GitHub Pages) and `/` for dev.
- The React pipeline runs on Oxc, with no Babel anywhere. `@vitejs/plugin-react` does the
  JSX transform and Fast Refresh through Oxc, and `vite.config.ts` sets `compiler: true`
  to lazy-load `oxc-transform-react`, the Rust port of React Compiler, for
  auto-memoization.
- `src/workers/refresh-shim.ts` must stay the first import in `suggestions.worker.ts`.
  Under `compiler: true` the plugin Fast-Refresh-wraps every file it transforms and cannot
  tell a Worker from the main window, so the plain-TS files the Worker shares with the app
  arrive carrying `$RefreshReg$` calls whose runtime only ever reaches the main window.
  The shim installs no-ops in worker scope, dev-only and stripped from production.
  Excluding the worker file just moves the error to the next shared file, and Vite's
  `worker.plugins` override is build-only and inert in dev. Tracked as dps-76#87; delete
  the shim once that lands.
- Lint is oxlint (`.oxlintrc.json`), formatting is oxfmt (`.oxfmtrc.json`). Both are Rust,
  neither is ESLint or Prettier, and oxlint's `react/*` rules replace the old
  `react-hooks/*` and `react-refresh/*` names. React Compiler's own bailout diagnostics
  run as lint rules, and a bailout is an error to fix rather than suppress.
  `BuildUrlInput.tsx` shows the `React.useEffectEvent` fix for ref-during-render, and
  `useSuggestions.ts`'s `isReportStale` shows the render-time derivation that replaces
  setState-in-effect. The few standing suppressions each carry their reason in a comment
  at the site.
- `.oxfmtrc.json`'s `ignorePatterns` is load-bearing. oxfmt formats JSON with no
  per-language opt-out, so without it every extraction would reformat hundreds of
  generated files, and prose docs plus vendored skill files (hash-pinned in
  `skills-lock.json`) would get silently reflowed.
- `@` aliases `src/`: `import { computeScenarios } from '@/lib/engine/scenarios'`.

## Game data is extracted, not hand-authored

`SeventySix.esm` feeds `scripts/extract/`, which shells out to the `esm` CLI and emits
checked-in JSON under `src/data/<mode>/generated/`. The `src/data/overrides/*` overlay
lands on top, and `getDataset(mode)` is the one place the two merge.

- Re-run `bun run extract` rather than hand-editing anything under `generated/`. Wrong or
  missing values belong in `src/data/overrides/*`, and every entry needs a source comment.
- Extraction writes a gitignored `_meta.json` holding the unresolved-items and
  `excludedDetailed` reports. Read both after every run. Silent gaps are bugs.
- Run `bun run extract:diff` after every extraction, and `bun run wire-dict:build` after
  anything that adds or removes app-facing ids, since a stale wire dictionary fails CI.
- The strict unresolved gate is on by default: extraction fails on unresolved entries that
  `scripts/extract/unresolved-classification.ts` does not disposition. CI has no ESM, so
  the classification remainder test gates it there instead.
- Curve tables come from the dump too (`bun run extract --only curvetables`). Treat any
  hand-edited curve JSON as stale.
- `scripts/extract/obtainability.ts` derives an `obtainable` flag on weapons and omods
  from ESM reverse references. `obtainable: false` records stay in the JSON and are hidden
  app-side. Rescue a false negative with `forceVisibleWeaponIds` or `forceVisibleOmodIds`
  in `overrides/corrections.ts`, no re-extract needed. Script-granted quest rewards live
  in VMAD properties, have no record-level reverse refs, and always need that rescue list.
- Perk, mutation, and legendary stat semantics come from the game's hidden plumbing perks
  (`STAT_DamagePerk`, `STAT_CritDamagePerk`, `STAT_DamageVsPerk`). Each `STAT_*` actor
  value maps to a formula bucket in `scripts/extract/normalize/mgef.ts`. OMOD properties
  come from recursively flattened `Includes` chains.

A new damage mechanic usually needs four things: a `Bucket` or `Condition` in
`src/types/modifiers.ts`, evaluation in `src/lib/engine/resolve.ts`, a routing entry in
`normalize/mgef.ts` or `extract-omods.ts`, and, for any value the ESM does not prove, an
entry in `docs/assumptions.md`. Decide whether it folds additively or multiplicatively
inside the DBM parenthesis. Everything except `'Mod Weapon DMG Bonus Mult'` routing is
additive.

Nukes & Dragons import lives in `src/lib/nukes-dragons.ts` and parses `p=` (perk loadout)
and `s=` (SPECIAL as 7 hex digits). The PerkId registry joins to ESM perk families by
normalized display name in `src/data/perk-modifiers.ts`. Misses get patched in
`overrides/perk-overrides.ts` and reported by `getUnjoinedPerkIds()`.

Only one ESM is extracted today. `pts` re-exports `live`, and the Header's mode toggle
stays disabled until a PTS dump lands.

## Testing

`bun run test` is the sole runner and CI runs it. `bun:test`'s `describe`, `it`, `expect`,
and `vi` cover the whole suite. There are no DOM or component tests and no coverage
tooling.

- Test-file isolation is mandatory: `test` uses `--parallel`, which implies
  `--isolate`; `test:watch` uses `--isolate` directly. Bare `bun test`
  shares one module registry across files, so one file's `vi.mock` silently patches the
  module another file imports. Reproduced in both file orderings:
  `build-reducer.test.ts`'s `@/lib/consumable-rules` mock breaks
  `src/lib/persist/__tests__/codec.test.ts`.
- The `--path-ignore-patterns` arguments keep the runner out of `.agents/` and `.claude/`,
  so a vendored skill's own tests can never join this suite.
- `vi.mock` factories run unhoisted but eager under Bun, with no `vi.hoisted` or
  `vi.importActual`. A partial mock must import the real module by namespace before
  calling `vi.mock`, then snapshot any delegated function into a local const. Calling it
  off that namespace inside the factory recurses into the mock once installed, and hangs
  rather than throwing. Worked pattern in `src/lib/persist/__tests__/codec.test.ts` and
  `src/lib/__tests__/loadout-ordering.test.ts`.
- Engine unit tests use synthetic weapons and modifiers with hand-computed expectations.
  Extraction fixture tests pin normalization against checked-in real `esm` output. Golden
  cases in `src/lib/engine/__tests__/golden/cases.json` hold in-game measured numbers, and
  `expected: null` cases stay skipped until someone measures them.

## Where the conventions live

| Topic | Doc |
|---|---|
| Commit messages (Conventional Commits) | `docs/agents/commits.md` |
| Issue tracker: `Mapekz/dps-76` via `gh`, label vocabulary | `docs/agents/issue-tracker.md` |
| Which domain doc owns which fact | `docs/agents/domain.md` |
| Doc genres, placement, ADR shape | `.agents/skills/docs-writing/SKILL.md` |
| The full ESM new-dump sync cycle | `.agents/skills/esm-sync/SKILL.md` |
| Weapon roster vetting after a sync | `.agents/skills/weapon-vetting/SKILL.md` |
| Verifying an ESM record or mechanic | `.agents/skills/esm-walk/SKILL.md` |
| Driving the app in a browser to confirm a change | `.agents/skills/verify/SKILL.md` |

Task procedures live in `.agents/skills/`. Read the relevant `SKILL.md` directly when
the client does not discover it automatically.
