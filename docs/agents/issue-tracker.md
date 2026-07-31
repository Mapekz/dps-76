# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues on `Mapekz/dps-76`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

If `gh` reports the wrong account, the push-capable one for this repo is `Mapekz` (`gh auth switch -u Mapekz`).

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Repo-specific conventions

- Issue titles and bodies use the vocabulary defined in `CONTEXT.md` — say **OMOD**, not "attachment"; **Bucket**, not "category"; **Scenario** (Free Aim/VATS; sneak is a condition, not a scenario), not "mode". See `docs/agents/domain.md`.
- An issue proposing a change to damage-engine math should cite the relevant `docs/assumptions.md` section by its verbatim name, and say whether the change adds, retires, or contradicts an entry there.
- In-game measurement tasks (numbers that can only be settled by playing) belong in `docs/assumptions.md`'s measurement backlog conventions rather than as bare issues — check how existing claims are tracked before filing a duplicate.

## Triage labels

The canonical vocabulary — `needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix` — matches this repo's actual label strings
one-to-one (all five exist on `Mapekz/dps-76`; `wontfix` is GitHub's
built-in, the other four were created for this vocabulary). When a skill
mentions a triage role, use that same string as the label.

**`ready-for-agent` in this repo**: damage-engine work is frequently blocked
on facts an agent cannot obtain — an ESM lookup, or a number that can only be
measured in game. An issue is only `ready-for-agent` when every such fact is
already settled and recorded. If it still needs an ESM chase or an in-game
measurement, it is `needs-info` — the reporter being you.
