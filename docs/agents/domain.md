# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the glossary. This repo is single-context; there is no `CONTEXT-MAP.md`.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.
- **`docs/assumptions.md`** — before proposing anything that changes damage-engine math. See the section below for its rules.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo: `CONTEXT.md` (glossary) + `docs/adr/` (decisions) +
`docs/assumptions.md`/`docs/move-speed-census.md` (registries) — genre rules
and where each kind of fact goes: `.claude/skills/docs-writing/SKILL.md`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

`CONTEXT.md` carries an explicit `_Avoid_` line under most terms, and a **Flagged ambiguities** section recording collisions already resolved. Treat those as settled; don't reintroduce one.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Engine claims: docs/assumptions.md

`docs/assumptions.md` is the registry of every value the engine asserts that isn't proven by ESM data — read it before proposing anything that changes damage-engine math. It is deliberately a different kind of document from `CONTEXT.md` (registry, not glossary) and must not be merged into it — full conventions, entry format, and the citation-guard test: `.claude/skills/docs-writing/SKILL.md`. New unproven values a change introduces need an entry there.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0002 (Mode is a comparison axis, not build data) — but worth reopening because…_
