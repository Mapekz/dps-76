# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the glossary. This repo is single-context; there is no `CONTEXT-MAP.md`.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.
- **`docs/assumptions.md`** — before proposing anything that changes damage-engine math. See the section below for its rules.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo:

```
/
├── CONTEXT.md
├── docs/
│   ├── adr/
│   │   ├── 0001-engine-layer-is-data-adapter-free.md
│   │   ├── 0002-mode-is-a-comparison-axis-not-build-data.md
│   │   └── 0003-nd-and-internal-perk-formats-are-separate.md
│   └── assumptions.md
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

`CONTEXT.md` carries an explicit `_Avoid_` line under most terms, and a **Flagged ambiguities** section recording collisions already resolved — notably that "mod" means **OMOD** (the game record) and never **Modifier IR** (the normalized shape it produces), and that "mode" means Live/PTS and never **Scenario** (Manual/VATS/Sneak). Treat both as settled; don't reintroduce either collision.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Engine claims: docs/assumptions.md

`docs/assumptions.md` is the registry of every value the engine asserts that isn't proven by ESM data. It is a **different kind of document from `CONTEXT.md`** and is deliberately kept separate: the glossary says what a word means and its terms are refined over time, while the registry says what we assert without proof and its entries are retired the moment something is measured or extracted.

Rules when reading or writing it:

- **Entries are terse.** One claim, a status tag, a code pointer. Investigation narrative belongs in the commit message. An explanation of how a mechanic works — even an ESM-proven one — belongs in the implementing function's doc-comment, not here. In-game measurement TODOs go to the measurement backlog.
- **Section names are cited verbatim across the codebase** — ~270 references across `src/`, `scripts/`, and generated data, including `src/data/live/generated/omods.json`, whose citations are emitted by the extractors. Never rename, merge, or split a section without updating every citation; for generated files that means editing `scripts/extract/*` and re-running `bun run extract`, not hand-editing JSON.
- **New unproven values need an entry.** If a change introduces a number the ESM doesn't prove, add one — one claim, a status tag, a code pointer.
- **Don't migrate it into `CONTEXT.md`.** The split is intentional (see above), and merging would break the verbatim citations.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0002 (Mode is a comparison axis, not build data) — but worth reopening because…_
