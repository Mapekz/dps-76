# TODO: Concentrated Fire — extraction route (P3)

## What

Replace the hand-authored Concentrated Fire override
(`src/data/overrides/perk-overrides.ts`, `extraPerkModifiers.ConcentratedFire`)
with real extraction of its two entry points. The override shipped 2026-07-19
(damage half: commit 4d9a63c; hit-chance multiplier half: 48a3676) with
values that ARE the ESM values — this todo is about provenance/regeneration
hygiene, not a wrong number.

## ESM facts (verified 2026-07-18/19, 20260710 dump)

- Perk ranks: `ConcentratedFire01/02/03` 0x0004D890 / 0x001D2459 / 0x001D245A.
- AV `ConcentratedFireRank` 0x00900A59 (rank multiplier), max-stacks GMST
  `iVATSConcentratedFireBonus` 0x007CF698 = 20.
- On `STAT_DamagePerk` 0x0023A0EB:
  - EP135 "Mod VATS Concentrated Fire Damage Mult": float 0.01 × rank AV, no
    weapon gate → the per-stack `dbm` entries.
  - EP109 "Mod VATS Concentrated Fire Chance Bonus": float 4.0
    (HasKeyword(WeaponTypeAutomatic)==0) / 1.0 (==1) × rank AV →
    the per-stack `vatsHitChanceMult` entries (USER-RESOLVED 2026-07-19: a
    multiplier on the game's computed VATS hit chance, not additive).

## Steps (from the Plan-agent design, plan file
## go-through-every-single-silly-whistle.md Phase B)

1. **Gate on an esm-walk first**: confirm HOW `ConcentratedFire01-03` set the
   rank AV — an Ability→SPEL→Peak-Value-Modifier chain (which
   `buildAvifRoutes` + `translate()` in `scripts/extract/normalize/mgef.ts`
   would pick up automatically) vs. a direct entry point (needs a
   Furious-style special case, mgef.ts ~936-974). Also find WHY both EP names
   sit in `extract-perks.ts`'s `ENTRY_POINT_IGNORED` (~lines 63-71) before
   removing them — the suppression's origin was never recorded.
2. `ENTRY_POINT_BUCKETS` rows: `'Mod VATS Concentrated Fire Damage Mult':
   'dbm'`, `'Mod VATS Concentrated Fire Chance Bonus': 'vatsHitChanceMult'`.
3. Known gap to close: `ENTRY_POINT_EXTRA_CONDITIONS` (mgef.ts ~89-95) is
   only consulted by extract-perks' direct entry-point loop, NOT by
   `buildAvifRoutes`/`translate()`'s route path — the route shape needs an
   `extraConditions?: Condition[]` field so the extracted modifiers carry
   `vatsOnly` + `stacks(counter:'concentratedFire', max:20)` (and the
   EP109 auto/semi `weaponKeyword` gates).
4. **Remove the override in the SAME commit** — extracted + override
   together would double-stack the dbm bonus (and double-multiply the pill).
   `pnpm extract:diff` + the existing rank×stacks tests
   (`perk-modifiers.test.ts`, `engine.test.ts`) must show identical output.

## Why deferred

The override is value-identical to the ESM today; the extraction route needs
the esm-walk (step 1) plus a normalize-layer refactor (step 3) — real work
with zero numeric payoff until the next game patch changes the values.
