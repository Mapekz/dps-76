---
name: weapon-vetting
description: Keep the vetted weapon roster in check after an ESM sync. Use when running pnpm extract against a new SeventySix.esm dump, when the weapons pinning test fails, or when reviewing pnpm vet:weapons output.
---

# Weapon roster vetting

The picker's weapon list is **vetted**: every visible entry was adjudicated
(2026-07-12 pass) and pinned in `src/data/vetted-weapons.ts`
(`VETTED_WEAPON_IDS`), enforced by `src/data/__tests__/weapons.test.ts`.
A fresh extraction only requires reviewing the **delta**, not re-vetting all
~200 entries.

## Procedure after each ESM sync

1. **Pre-flight — curvetables must exist next to the dump.**
   `<dump-dir>/misc/curvetables/json/...` is how the esm CLI resolves
   `Damage Curve` formid references into embedded curve points. If the dir is
   missing/empty, extraction silently degrades: every weapon loses its tier
   (flat `Base Damage` only, or lands in the `noDamage` bucket) and
   curve-driven legendary effects extract with 0 modifiers. If the new dump
   lacks it, copy from the previous dump's `misc/curvetables` (tier tables
   rarely change) and note the copy — or re-run the curvetable dump step.
   **The daemon caches the loose-file view: run `esm daemon stop` after
   adding curvetables**, then extract.
2. `pnpm extract --esm <dump> --mode live` then `pnpm extract:diff` — review
   record-level changes (real balance changes vs extraction artifacts; the
   dump dir's `patch_<old>_to_<new>/` reports say which records the patch
   actually touched).
3. `pnpm vet:weapons` — prints newly-visible entries (with red-flag
   heuristics), dropped entries (with their exclusion bucket + obtainability
   signals), and duplicate display names.
4. Adjudicate each delta entry with the `esm-walk` skill:
   - Junk that slipped in → `hiddenWeaponIds` (overrides/corrections.ts),
     with evidence comment.
   - Real weapon ruled unobtainable → `forceVisibleWeaponIds`, with source
     comment. Remember: script/vendor/Atomic-Shop grants have NO record-level
     reverse refs and always look unobtainable.
   - Genuinely new/removed content → update `VETTED_WEAPON_IDS`.
5. `pnpm test` — the pinning test must pass; golden cases catch balance
   regressions (a failing golden case after a patch may mean the weapon was
   really rebalanced → re-measure in game before touching expectations).

## Known future churn

- Bethesda is collapsing unique weapons into base weapons + unique mods
  (announced for a future PTS: The Fixer → Combat Rifle, Unstoppable
  Monster → Deathclaw Gauntlet). Expect waves of unique-WEAP removals whose
  effects reappear as OMODs — that's roster shrinkage to *accept* (update the
  pinned list), not rescue.
- Launcher explosion damage SHIPPED 2026-07-13 (the WEAP→PROJ→EXPL chase,
  docs/assumptions.md "Launcher explosion damage"). Throwables (grenades/
  mines, `projectileOnly` bucket) stay excluded by vetting-scope decision —
  the exclusion is evaluated before the EXPL chase.
