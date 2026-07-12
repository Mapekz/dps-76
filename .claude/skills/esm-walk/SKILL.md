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
- ESM path defaults from `src/data/live/generated/_meta.json → esmPath`.
- The script (`scripts/esm-walk.ts`) already applies the known esm-CLI quirks
  (one-shot `-p --json` mode, the Ability/Entry-Point field misattribution
  repair). Only drop to raw `esm get` for fields the digest truncates.

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
