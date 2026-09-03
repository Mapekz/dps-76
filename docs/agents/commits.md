# Commit messages: Conventional Commits

Every commit subject follows [Conventional Commits](https://www.conventionalcommits.org/):
`type(scope): summary`, imperative mood, no trailing period. This matches the repo's actual
history — it isn't a new rule, just making the existing pattern explicit.

- **Types in use**: `feat`, `fix`, `docs`, `refactor`, `chore`, `test`, `build`, `data`, `perf`,
  `style`, `ci`. Pick the narrowest one that fits; don't invent a new type for a one-off commit.
- **Scope** is usually the area touched, not a file path: `engine`, `extract`, `audit`, `claude`,
  `esm-sync`, `skills`, `armor`, `data`. Omit the scope only when a change is genuinely
  cross-cutting.
- **Breaking changes**: append `!` after the type/scope (`feat(engine)!: ...`) and explain the
  break in the body — rare in this repo since it's a single deployed app, not a published API.
- Body lines (when present) explain *why*, not a restatement of the diff — same rule as code
  comments elsewhere in this repo.

Examples from this repo's own history: `feat(engine): Eye of Ra toggle — Voice of Set's upgraded
robot proc (ADR-0024)`, `fix(extract): Pin-Pointer's +50% striking-appendage arm is dead content`,
`docs(esm-sync): close out the deferred-pile ledger post sign-off`.
