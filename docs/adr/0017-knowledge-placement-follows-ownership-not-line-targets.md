# Knowledge placement follows ownership, not line targets

`docs/assumptions.md` grew to 1026 lines with 187 entries, only 24% carrying a
status tag, and had already been hand-trimmed twice in fifteen days (2087 →
1319 → 940 lines) only to regrow. A 2026-08 simplification review proposed
fixing this by evacuating mechanic prose into doc-comments and cutting the
file to roughly 450 lines. Two parts of that proposal were wrong, for the same
underlying reason: line count was treated as the thing to optimize, when the
actual defect was that the file mixes two kinds of content with no way to
tell them apart.

The review's evacuation list included deleting the `Known gaps / deferred`
section as "a backlog GitHub issues already track." Reading the section
instead of counting its lines: it is a **deliberate non-modeling register**,
not a backlog. It records routing rationale with FormID provenance — for
example, why five specific self-targeted `Mod Incoming Weapon Damage` sources
correctly stay unmodeled and route to an inert `incomingDamageMult` bucket
rather than being dropped as `unresolved`, plus the rule for classifying a
future target-redirected occurrence. No function's doc-comment can own "this
mechanic is deliberately not modeled" — the function doesn't exist. Deleting
this section would have destroyed the exact knowledge that stops a future
agent from "fixing" something that was never broken, in a codebase where that
is the most expensive class of mistake to make.

Comment density was tried and rejected as a placement criterion. Several of
the destinations the evacuation proposal targeted (`class-freak-mutations.ts`
at 57% comment, `omod-eligibility.ts` at 56%) are already small files that are
mostly prose describing an obscure game rule — that is correct for what they
are, not evidence they're already "full."

Decision: when moving a claim out of `assumptions.md` (or placing a new one),
ask what invalidates the knowledge and whether one code location owns it —
never how many lines are left in the file.

- **One owning code location → the claim moves to that location's
  doc-comment**, where it travels in the same diff as the code it describes
  and can't drift from it unnoticed.
- **The claim spans modules, or describes an absence of code (a mechanism
  deliberately not implemented, a routing rule for a case that doesn't exist
  yet) → it stays in the file.** These have no code location to own them.
- **Delete outright** only when a doc-comment already states the same claim,
  in full, somewhere else — not merely on the grounds that the file is long.

`docs/assumptions.md` splits into two labelled parts under this rule: unproven
claims (tagged, one claim per bullet — the true registry) and deliberate
non-modeling plus cross-cutting rationale (the register nothing else can own).
Tool-owned generated files (`PRODUCT.md`, `.impeccable/*`) are outside this
rule entirely — they are config and output for the `/impeccable` skill, not
documentation, and hand-editing or "consolidating" them is churn the next tool
run overwrites.

## Do not undo this

Don't re-propose a line-count target for `docs/assumptions.md`. The tag rate
on the unproven-claims section is the metric that matters; a shorter file with
mechanic prose still mixed into the registry has not fixed anything.

Don't delete or fold the `Deliberate non-modeling` section (formerly `Known
gaps / deferred`) into an issue tracker. It answers a different question than
an issue does — issues track work to do; this section explains why specific
things that look unfinished are not bugs.

Don't treat a file's comment density as a signal that it has "enough"
documentation already, or as grounds to route a claim there or away from
there. Ask whether the specific code location owns the specific claim.

Don't hand-edit `PRODUCT.md` or `.impeccable/*` as part of a documentation
consolidation pass. They are `/impeccable` skill config and generated output;
treat them the way `components.json` or `skills-lock.json` are treated.
