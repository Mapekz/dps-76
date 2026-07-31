---
name: esm-walk
description: Walk SeventySix.esm records to verify an item/effect is real and player-obtainable, decode what a perk/OMOD/legendary actually does, and decide where a fix belongs in dps-76. Use when a user questions whether an item/mod exists in game, when reviewing _meta.json unresolved reports, or when chasing a mechanic's ESM footprint.
---

# ESM record walking (dps-76)

The walker and the mechanics-chaser are native `esm` subcommands now:

```bash
esm -p walk <formid|edid> [--refs] [--depth N] [--ref-limit N]   # the interactive tool: digest + chain following; OMOD mechanisms classified inline
esm -p chase <selector> [--depth N] [--ref-limit N]              # pipeline JSON evidence contract (OMOD/PERK/SPEL/ALCH/ENCH only) — interactively just walk
```

`bun run esm:walk` remains as a thin alias for `esm -p walk`. Generic CLI
mechanics — path resolution, bulk `get`, `refs` flags, how to read the walk
digest (GLOB flat-wins rule, curves, conditions), generic obtainability
guidance, curve-table conventions, field-name churn — live in the `esm-cli`
skill that ships with the binary: `esm skill` prints it, and it's checked in
at `../FO76-Tools/.claude/skills/esm-cli/`. Read that first for anything
about driving the CLI itself. What follows is only the dps-76-specific
judgment layer.

## Digest → extractor mapping

- **Entry points**: `"Mod X" fn <Function> value <Float>` — bucket routes live
  in `scripts/extract/normalize/mgef.ts` (`ENTRY_POINT_BUCKETS`). EP 189/190
  are the Onslaught pair.
- **Curve inputs**: the digest's `curve INPUT axis: AV <name>` maps to a
  `CurveInput` via `CURVE_INPUT_AVS` (mgef.ts). Low engine AVs
  (0x392 healthFraction, 0x395 onslaught…) have no AVIF record.
- **GLOB magnitudes**: trust the digest's `← real value` / `← IGNORE (flat
  wins)` annotations — overriding nonzero flat magnitudes with the sibling
  GLOB once corrupted every chem.
- **PERK with "NO effects"**: the bonus is engine/script-side; only the
  description states it (Lifegiver ranks 2/3) — model via
  `overrides/perk-overrides.ts` with a description-sourced comment.

## Perk rank verification (PCRD)

The generic fact — PCRD is the perk-card source of truth, `Perks[]` reflects
the live/rebalanced rank count, and rank chains/ability spells linger as cut
content after a compression — is documented in the `esm-cli` skill ("Perk
rank verification (PCRD)" section; `esm skill` prints it), same as the other
generic ESM mechanics referenced above. What follows is dps-76's own judgment
layer on top of that fact: how to apply it before writing an extractor
override.

Before modeling a perk rank or an orphaned ability spell, check the PCRD
card's `Perks` array, not just the EditorID rank chain. FO76 rank chains and
ability spells linger in the ESM after cuts — a chain can have 3 PERK
records and an "engine-attached-looking" spell while the live PCRD card
lists only 1 rank (Lock and Load, 2026-07-16: r2/r3 and
`AbPerkLockAndLoad`'s flat 20/40/60% reload were both cut content the record
graph alone couldn't distinguish from live).

1. Find the PCRD, use its `Perks` array (rank-ordered Male Perk formids) as
   the ground-truth rank list — not the EditorID-numbered chain.
2. `esm refs` any orphaned spell before treating it as engine-attached:
   "orphaned + matches the card's description text" is live-ish, "orphaned +
   referenced only by cut ranks" is dead.
3. Model only description-backed effects; leave undocumented record tiers
   out pending in-game measurement rather than assuming the record graph is
   complete.

## Obtainability verdicts (`--refs`)

1. Check the record's `obtainable` flag in the generated JSON first
   (derivation: `scripts/extract/obtainability.ts`).
2. Signal reading (player-facing referrer types, LVLI chains, NONPLAYABLE) is
   in the esm-cli skill. dps-76 specifics: script/VMAD quest rewards,
   gold-bullion vendor items, and account-side (ATX) grants have NO
   record-level reverse refs — check the rescue lists
   (`forceVisible*Ids` in `overrides/corrections.ts`) before assuming junk.
3. **Shipped ≠ on-record.** P62/"The Drifter" gear looks perfectly obtainable
   on-record but never released. Confirm against release history or ask the
   user before rescuing anything unfamiliar.

## Where fixes go

- Visibility: `src/data/overrides/corrections.ts` —
  `hiddenWeaponIds`/`hiddenOmodIds` (false positives),
  `forceVisible*Ids` (false negatives). Source comment required; no
  re-extract needed.
- Wrong/missing values the ESM can't express: `overrides/perk-overrides.ts`,
  `legendary-values.ts`, `buff-overrides.ts`.
- New mechanics: bucket/condition in `src/types/modifiers.ts` + `resolve.ts` +
  extractor mapping + `docs/assumptions.md` entry.
- After any extractor change: `bun run extract … [--only …]`, review `_meta.json`
  unresolved/excludedDetailed deltas and `bun run extract:diff`. Diff generated
  values against git — a mapping change that shifts UNRELATED values is a
  regression, not noise.
