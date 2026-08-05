---
name: weapon-vetting
description: Keep the vetted weapon roster in check after an ESM sync. Use when running bun run extract against a new SeventySix.esm dump, when the weapons pinning test fails, or when reviewing bun run vet:weapons output.
---

# Weapon roster vetting

The picker's weapon list is **vetted**: every visible entry was adjudicated
(2026-07-12 pass) and pinned in `src/data/vetted-weapons.ts`
(`VETTED_WEAPON_IDS`, 143 entries against a 282-record `weapons.json`),
enforced by `src/data/__tests__/weapons.test.ts`. A fresh extraction only
requires reviewing the **delta**, not re-vetting the whole roster.

## Procedure after each ESM sync

1. **Pre-flight — curvetables must exist next to the dump.**
   `<dump-dir>/misc/curvetables/json/...` is how the esm CLI resolves
   `Damage Curve` formid references into embedded curve points. If the dir is
   missing/empty, extraction silently degrades: every weapon loses its tier
   (flat `Base Damage` only, or lands in the `noDamage` bucket) and
   curve-driven legendary effects extract with 0 modifiers. If the new dump
   lacks it, copy from the previous dump's `misc/curvetables` (tier tables
   rarely change) and note the copy — or re-run the curvetable dump step.
   The daemon caches the loose-file view — `esm-cli` skill covers the
   `esm daemon stop` requirement after adding curvetables.
2. `bun run extract --esm <dump> --mode live` then `bun run extract:diff` — review
   record-level changes (real balance changes vs extraction artifacts;
   `Data/notes/<old>_to_<new>/comprehensive.md` says which records the patch
   actually touched, if that diff pipeline has been run for this sync).
3. `bun run vet:weapons` — prints newly-visible entries (with red-flag
   heuristics), dropped entries (with their exclusion bucket + obtainability
   signals), and duplicate display names.
4. Adjudicate each delta entry with the `esm-walk` skill (its "Obtainability
   verdicts" section covers why script/vendor/Atomic-Shop grants look
   unobtainable by default):
   - Junk that slipped in → `hiddenWeaponIds` (overrides/corrections.ts),
     with evidence comment.
   - Real weapon ruled unobtainable → `forceVisibleWeaponIds`, with source
     comment.
   - Genuinely new/removed content → update `VETTED_WEAPON_IDS`.
   - To hand-confirm one weapon's obtainability signal without eyeballing the
     full grouped `--refs` list, filter to one referrer type server-side:
     `esm --esm <esm> refs --formid <weapon-id> --type <SIG> --json` (e.g.
     `--type COBJ` for craftable, `--type LVLI` for loot chains).
5. `bun run test` — the pinning test must pass; golden cases catch balance
   regressions (a failing golden case after a patch may mean the weapon was
   really rebalanced → re-measure in game before touching expectations).

## If a unique weapon migrates to base-weapon + unique-mod

Should Bethesda ever collapse a standalone unique WEAP into a base weapon +
OMOD, a removal from the pinned list is roster shrinkage to *accept*, not
rescue — decoding the migrated effect is a single `esm walk
<omod-formid|edid>` call (see the esm-walk skill): the OMOD digest
classifies every mechanism inline instead of a manual `get`/`refs` chain.
