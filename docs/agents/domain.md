# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

This repo is single-context (`CONTEXT.md` at the root, no `CONTEXT-MAP.md`).

- **`CONTEXT.md`** — the glossary.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.
- **`docs/assumptions.md`** — before proposing anything that changes
  damage-engine math; a new unproven value the change introduces needs an
  entry there. Genre rules and where any other new fact goes:
  `.claude/skills/docs-writing/SKILL.md`.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

`CONTEXT.md` carries an explicit `_Avoid_` line under most terms, and a **Flagged ambiguities** section recording collisions already resolved. Treat those as settled; don't reintroduce one.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0002 (Mode is a comparison axis, not build data) — but worth reopening because…_
