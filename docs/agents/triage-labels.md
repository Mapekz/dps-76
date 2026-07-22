# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

All five labels exist on `Mapekz/dps-76`. `wontfix` is GitHub's built-in label; the other four were created for this vocabulary.

Edit the right-hand column to match whatever vocabulary you actually use.

## Note on `ready-for-agent` in this repo

Damage-engine work is frequently blocked on facts an agent cannot obtain: an ESM
lookup, or a number that can only be measured in game. An issue is only
`ready-for-agent` when every such fact is already settled and recorded. If it
still needs an ESM chase or an in-game measurement, it is `needs-info` — the
reporter being you.
