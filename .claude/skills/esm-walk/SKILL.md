---
name: esm-walk
description: Walk SeventySix.esm records to verify an item/effect is real and player-obtainable, decode what a perk/OMOD/legendary actually does, and decide where a fix belongs. Use when a user questions whether an item/mod exists in game, when reviewing _meta.json unresolved reports, or when chasing a mechanic's ESM footprint.
---

# ESM record walking

Run the walker instead of raw `esm` CLI calls — it follows the whole chain
(OMOD → ENCH → MGEF → "Perk to Apply" → PERK entry points; SPEL/ALCH effects;
curves; GLOBs; conditions) and prints one compact digest:

```bash
pnpm esm:walk <formid|edid> [--refs] [--depth N] [--esm <path>]
```

- Accepts editor ids or `0x...` formids; falls back to a search when not found.
- `--refs` appends reverse references grouped by record type (obtainability).
- `--depth` caps chain-following (default 2; use 3 for OMOD → granted-perk).
- ESM path resolves from `--esm`, else the `FO76_ESM_PATH` env var.
- The script (`scripts/esm-walk.ts`) already applies the known esm-CLI quirks
  (one-shot `-p --json` mode, the Ability/Entry-Point field misattribution
  repair) and batches per-record fetches with bulk `get`.
- Walking a KYWD or AVIF reverse-chases its SPEL/PERK consumers
  (`refs --type SPEL`/`PERK --paths`) instead of dumping the (mostly empty)
  record itself — the same hop `esm chase` does from the OMOD side, below.

## Raw CLI power tools (when the digest truncates)

Reach for these directly when the walker's digest isn't enough — a field it
truncates, a record type it doesn't special-case, or a wider reverse-ref scan
than `--refs` gives you. One-shot calls need `-p` (otherwise the CLI drops
into a REPL after printing).

- **Bulk `get`**: `esm -p --esm <esm> get <sel1> <sel2> … --json` fetches many
  records in one call. One target → the classic single object; two or more →
  a JSON array, one entry per selector in input order, each tagged with its
  own `sel` (a bad selector becomes `{"sel":…, "error":…}` instead of failing
  the whole call). The wrapper exposes this as `client.bulkGet()`.
- **`get --resolve none|stub|full`**: inlines FormID references instead of
  leaving them as bare `0x...` strings — `stub` gives
  `{formid, editor_id, record_type}` (cheap, one extra field per ref); `full`
  recursively inlines the referenced record itself. A `CURV` record fetched
  directly already inlines its own curve points regardless of `--resolve`.
- **`refs --type <SIG>`**: narrows rows to referencing records of one 4-char
  type (e.g. `--type OMOD`), applied server-side so `--limit`/`--depth`
  interact correctly with the filter — one type per call, not a list.
- **`refs --paths`**: annotates each row with the JSON field path(s) from the
  referrer to the target (e.g. `Effects[2].Conditions[0].Parameter 1`) —
  decodes every emitted row, so it's off by default; this is how `esm chase`
  locates the exact `Effects[N]` a keyword/AVIF gates.
- **`refs --depth N`** (1–6): direct refs only at 1; raise for a reference
  reached through an intermediary (e.g. a quest alias).
- **Gotcha**: `refs`'s default `--limit 100` truncates AND appends a
  non-JSON `note: output capped at N of M results; use --limit 0 to show all`
  trailer to stdout — that breaks a naive `JSON.parse`. Pass an explicit large
  limit (or `--limit 0` for everything) and always pass `--formid` (not a bare
  positional) — the CLI misparses numeric editor_ids when auto-detecting.

## `esm chase` — unique-weapon OMOD effects

```bash
esm -p --esm <esm> chase <omod-formid|edid> [--depth N] [--ref-limit N] [--json]
```

Automates the "chase pattern" for a `mod_Custom_*`-style unique OMOD: it reads
the OMOD's `Data.Properties[]` rows and classifies each one — a bare number
(nothing to chase), an ENCH/SPEL attached directly to the weapon (forward
`get`), a PERK grant (`Value 1` is property 116/"Perks"; forward `get`s the
granted PERK, whose `Effects` ARE the mechanic), or a KYWD/AVIF hook (reverse
`refs --type SPEL` and `refs --type PERK`, each with `--paths`, to find the
SPEL/PERK whose Conditions test `WornHasKeyword(<keyword>)`, then slices out
just the gated `Effects[N]` via the field path) — and prints a compact
evidence tree, not full record dumps.

Reach for `esm chase` specifically when decoding a unique weapon's
`mod_Custom_*` OMOD; use `pnpm esm:walk` for everything else (MGEF archetypes,
curves, GLOBs, conditions, PERK entry points) — the two share the same
underlying reverse-chase hop, `esm chase` just automates the OMOD-property
taxonomy end to end. It implements "the chase pattern" documented in
`../FO76-Tools/.claude/skills/patch-notes/mechanics-kb.md` — read that first if
a property doesn't fit its 3-way classification.

## Reading the digest

- **Entry points**: `"Mod X" fn <Function> value <Float>` — bucket routes live
  in `scripts/extract/normalize/mgef.ts` (`ENTRY_POINT_BUCKETS`). EP 189/190
  are the Onslaught pair.
- **Curves**: `curve (x,y)…` with `curve INPUT axis: AV <name>` — the input AV
  maps to a `CurveInput` in `CURVE_INPUT_AVS` (mgef.ts). Low engine AVs
  (0x392 healthFraction, 0x395 onslaught…) have no AVIF record.
- **GLOB magnitudes**: the digest marks each one `← real value (flat is 0)` or
  `← IGNORE (flat wins)`. Trust those annotations — overriding nonzero flat
  magnitudes with the sibling GLOB once corrupted every chem.
- **Conditions**: GLOB comparison values resolve inline
  (`GetRandomPercent() ≤ 0x…<SomeGlob=50>`). `WornHasKeyword(HasLegendary_*)`
  is a self-gate the OMOD's own keyword satisfies.
- **PERK with "NO effects"**: the bonus is engine/script-side; only the
  description states it (Lifegiver ranks 2/3) — model via
  `overrides/perk-overrides.ts` with a description-sourced comment.

## Obtainability verdicts (`--refs`)

1. Check the record's `obtainable` flag in the generated JSON first
   (derivation: `scripts/extract/obtainability.ts`).
2. Read the grouped refs: COBJ/GMRW/LGDI/QUST/CONT/MISC/FLST are
   player-facing signals; LVLI counts only via player-facing chains
   (`⚠NONPLAYABLE` referrers are flagged).
3. **NO refs at all is normal** for script/VMAD quest rewards, gold-bullion
   vendor items, and account-side (ATX) grants — check the rescue lists
   before assuming junk.
4. **The record graph cannot distinguish shipped from unshipped content.**
   P62/"The Drifter" gear (Splinter, Chaos Engine, Tempest, Combo-Breaker's)
   looks perfectly obtainable on-record but never released. Confirm against
   release history or ask the user before rescuing anything unfamiliar —
   "exists in ESM" ≠ "legit mod players can use".

## Where fixes go

- Visibility: `src/data/overrides/corrections.ts` —
  `hiddenWeaponIds`/`hiddenOmodIds` (false positives),
  `forceVisible*Ids` (false negatives). Source comment required; no
  re-extract needed.
- Wrong/missing values the ESM can't express: `overrides/perk-overrides.ts`,
  `legendary-values.ts`, `buff-overrides.ts`.
- New mechanics: bucket/condition in `src/types/modifiers.ts` + `resolve.ts` +
  extractor mapping + `docs/assumptions.md` entry.
- After any extractor change: `pnpm extract … [--only …]`, review `_meta.json`
  unresolved/excludedDetailed deltas and `pnpm extract:diff`. Diff generated
  values against git — a mapping change that shifts UNRELATED values is a
  regression, not noise.
