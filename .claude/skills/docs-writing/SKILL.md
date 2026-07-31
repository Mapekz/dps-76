---
name: docs-writing
description: Conventions for writing and maintaining dps-76's docs (CONTEXT.md, docs/assumptions.md, docs/adr/, docs/analysis/) so new additions stay terse instead of re-accreting narrative. Use when adding or editing any file under docs/, CONTEXT.md, or an ADR, when a docs/assumptions.md entry is growing past a few lines, or when deciding where a new fact/decision/investigation should live.
---

# Writing dps-76's docs

This repo has four doc genres with different rules. Picking the wrong one —
or writing a registry entry like a blog post — is how `docs/assumptions.md`
grew to 2000+ lines holding barely 100 real claims, and how
`docs/analysis/fire-rate-reload-sensitivity.md` (265 lines, zero inbound
references) ended up with a session changelog inside it. This skill is the
judgment layer that keeps a new addition from repeating either mistake.

**Scope boundary**: this covers *documentation* — prose files under `docs/`,
`CONTEXT.md`, `docs/adr/`. It does not cover code comments in general
(reasonable comment density is normal engineering judgment) except for the
one rule below about where mechanic explanations belong.

## The four genres

Before writing, name which genre the fact belongs to. Each has a different
lifecycle and a different size budget.

1. **Glossary** (`CONTEXT.md`) — one word per domain concept. Each term gets
   an `_Avoid_` line naming rejected synonyms; a **Flagged ambiguities**
   section records collisions already resolved. Terms are *refined* over
   time, never accumulate history.
2. **Registry** (`docs/assumptions.md`, `docs/move-speed-census.md`) — one
   claim per bullet: a status tag, the claim, a code pointer, a tracking
   issue if still open. Entries are *retired* the moment something is
   measured or extracted — a registry is a todo list with receipts, not an
   archive. Section names are cited verbatim elsewhere in the codebase and
   are effectively API — see below. A registry should have a test attached
   (`src/data/__tests__/doc-citations.test.ts`,
   `move-speed-census.test.ts`) so drift fails CI instead of rotting silently.
3. **ADR** (`docs/adr/NNNN-*.md`) — one durable architectural decision, see
   shape below.
4. **Investigation** (`docs/analysis/*`) — a dated, point-in-time writeup
   (sensitivity analysis, a one-off measurement session). Has a *lifecycle*:
   any durable claim it produces gets folded into a registry entry or a
   doc-comment before the investigation itself is done; the investigation
   file does not outlive the ESM sync or balance patch it was measured
   against. Budget: if it's pushing past ~100 lines or has a "what changed
   this session" section, that content belongs in the commit message that
   landed the change, not in the doc.

If what you're writing doesn't fit one of these four, it's probably meant
for `CLAUDE.md` (durable, load-bearing project facts an agent needs every
session) or a GitHub issue (a task, not a fact) — see the placement matrix.

## Placement matrix

The single most-repeated rule in this repo (previously stated three times,
independently, in `CLAUDE.md`, `docs/agents/domain.md`, and
`docs/assumptions.md`'s own preamble — now stated once, here):

| Content | Goes to |
|---|---|
| Investigation narrative, rejected alternatives, how a bug was found | commit message |
| How a mechanic works — even an ESM-proven one, not an assumption | the implementing function's doc-comment |
| An in-game measurement TODO | a GitHub issue, label `needs-measurement` |
| An unproven number the engine relies on | a `docs/assumptions.md` entry |
| A decision a future reviewer will want to undo | an ADR, with a `## Do not undo this` section |

The two most common failure modes are writing mechanic prose into a registry
entry (it belongs in code, next to the code it explains) and writing
investigation narrative into anything but a commit message (git already
owns that history — a doc that repeats it just has to be kept in sync with
itself).

## Registry entries: one claim, terse

```markdown
- **Claim, in one clause** — **STATUS-TAG**: the unproven part, in one more
  clause. Code pointer in backticks. Issue number if tracked.
```

- **Status vocabulary is fixed, reuse it**: `ESM-PROVEN` (kept only as
  load-bearing context for a nearby assumption, not as its own entry),
  `USER-CONFIRMED`, `ASSUMPTION`, `INFERENCE`, `MEASURED`, `CLOSED`. Don't
  invent a variant like `ASSUMPTION, unconfirmed` or `ASSUMPTION
  (user-supplied)` — the qualifier goes in the prose, the bold tag stays one
  of the six words.
- **A settled entry is deleted, not marked done.** If a claim graduates to
  `ESM-PROVEN`/`CONFIRMED`/`CLOSED` and isn't load-bearing context for a
  still-open assumption nearby, it isn't an assumption anymore — remove it
  rather than leaving a green checkmark in a registry of open questions.
- **Section names and bold sub-anchors are API.** `doc-citations.test.ts`
  enforces this by scanning every `docs/assumptions.md "<name>"` citation in
  `src/`, `scripts/`, and generated JSON. Renaming, merging, or splitting a
  section means updating every citer first (for generated files: edit
  `scripts/extract/*` and re-run `bun run extract`, never hand-edit the
  JSON) — run the test before and after to confirm.
- **If a claim needs more than ~5 lines to state**, the excess is almost
  always mechanic explanation — move it to the implementing function's
  doc-comment and leave a pointer (`Engine: src/lib/engine/foo.ts —
  <mechanic> is documented there, not repeated here.`) plus whatever
  genuinely-unproven residue remains.

## ADRs

```markdown
# <the decision, stated as a declarative assertion — not "ADR-0002: ...">

Prose: what forced the decision and what was decided, with code pointers
inline. No `## Context`/`## Decision`/`## Consequences` headers — at the
15–50 line size these files actually run, the file is read whole regardless,
and three boxes invite padding (a `## Consequences` section that has nothing
to say still gets something written into it).

## Do not undo this

A future reviewer might reasonably want to `<X>` — don't: `<why, in enough
detail that "just try it" doesn't survive a re-read>`.
```

The `## Do not undo this` section is the one required heading — it's what
makes every standing prohibition in the repo greppable in one command
(`grep -A4 '^## Do not undo this' docs/adr/*.md`), and it's the part an
agent actually needs: `docs/agents/domain.md` tells agents to *cite* ADRs
when their output would contradict one (`ADR-0002 (Mode is a comparison
axis, not build data)`), which only works if the ADR states a clear, findable
"don't." Everything above the heading is prose for a human deciding whether
to reopen the decision, not something an agent parses.

## Mechanics every doc here follows

- 80-column hard wrap.
- Every claim carries a repo-root-relative code pointer in backticks, often
  with a line range.
- Findings carry inline ISO dates (`2026-07-15`, `SHIPPED 2026-07-18`);
  documents themselves are undated — git owns document history, a dated H1
  (like `docs/analysis/fire-rate-reload-sensitivity.md`'s) is the exception,
  not the pattern to copy.
- Bold marks a coined term at first use; backticks mark identifiers, paths,
  Buckets, FormIDs. FormIDs are written `0x00661FDF` — 8 digits, uppercase
  hex, lowercase `x`.
- Tables for parametric comparison (per-source magnitudes, per-weapon
  values); bullets for everything else.
- Cross-references are unlinked, backticked, relative paths —
  `docs/move-speed-census.md`, not a markdown link. (This is a deliberate
  difference from `FCM-Fallout-Chat-Mod`'s docs, which do use markdown
  links — don't unify the two conventions.) `README.md` is the one
  exception: it's the human-facing front door and already uses markdown
  links for external URLs, so linking to `CLAUDE.md`/`CONTEXT.md` from
  there is consistent with its own style, not with the rest of `docs/`.
- A deliberate omission gets a named bucket instead of silence —
  `excluded:not-reachable`, `excluded:non-player`, "out of scope",
  "deliberately unmapped", "verified empty" are all real dispositions used
  in `docs/move-speed-census.md`; pick one rather than just not mentioning
  the thing.

## Two habits that prevent the next rot

- **Defer, don't restate.** If another doc or skill already owns a fact,
  name it and stop — don't re-explain it "for completeness."
  `.claude/skills/esm-walk/SKILL.md` is the model: it states outright that
  generic ESM/CLI mechanics live in `FO76-Tools`'s `esm-cli` skill and it
  covers "only the dps-76-specific judgment layer." Before writing a
  paragraph explaining how something works, check whether a doc-comment,
  another skill, or an ADR already says it.
- **The inbound-reference test.** Before creating a new doc file, ask what
  will cite it — a test, a code comment, another doc, an issue. If the
  honest answer is "nothing yet," that's a signal to fold the content into
  an existing registry/doc-comment instead of starting a new file that
  nothing points at. This is the exact difference between
  `docs/move-speed-census.md` (3 code citations + a CI-enforcing test) and
  `docs/analysis/fire-rate-reload-sensitivity.md` (zero) — the latter is why
  investigation docs need the lifecycle rule above.

## Where fixes go

- A `docs/assumptions.md` entry that's grown past ~5 lines: split — mechanic
  explanation to the implementing function's doc-comment (find it via the
  `Engine:` line at the top of the section), terse residue stays.
- A citation guard failure (`doc-citations.test.ts`): almost always fix the
  *doc* (the citing comment or `docs/assumptions.md`'s heading/anchor), not
  the test's allowlist. Only add to `IDENTIFIER_ALLOWLIST` for genuinely
  non-code tokens (ESM GMST names, external tooling, formula notation
  explicitly defined inline) — a real rename or dead reference should be
  fixed at the source, not allowlisted away.
- A new ADR that drifts from the shape above (extra headers, no guard
  section): fix the ADR, don't treat the newest one as having redefined the
  convention — see `docs/adr/0005`'s history for exactly this drift and
  correction.
- Deciding whether a new fact is CLAUDE.md-worthy vs. docs-worthy: `CLAUDE.md`
  is for what every session needs regardless of task (architecture, build
  commands, module map); `docs/` is for what only some tasks need (a specific
  unproven number, a specific past decision). If in doubt, `docs/` — it's
  read on demand, `CLAUDE.md` is read every session.
