# TODO: Data-Quality Overhaul — User Review Items

Open items from the 2026-07-10 data-quality overhaul (junk filtering +
legendary translation; plan: `~/.claude/plans/grill-me-i-curious-iverson.md`).
Everything below is a decision or measurement only the user can supply.

## 1. Review the exclusion evidence
- `src/data/live/generated/_meta.json → excludedDetailed` lists every named
  weapon/omod ruled unobtainable, with its reverse-reference signals.
- `pnpm extract:diff --base <ref>` regenerates the markdown diff report.
- Rescue false negatives via `forceVisibleWeaponIds` / `forceVisibleOmodIds`
  in `src/data/overrides/corrections.ts` (works without re-extracting);
  hide false positives via `hiddenWeaponIds` / `hiddenOmodIds`.
- 12 script-granted uniques were already hand-rescued (Cold Shoulder, Whistle
  In The Dark, Medical Malpractice, ...) — sanity-check that list; also
  spot-check the ones deliberately left hidden (e.g. `AlienBlaster_DailyOps`,
  `BoneTambo`, `MTR06_10mmSMG_ScorchedKiller`, `mod_AlienRifle_Receiver_Invader`,
  `mod_Nitro_Receiver_Base`).

## 2. Two Shot measurement (golden case)
Extracted ENCH says dbm **+0.75** + 1 projectile (projectile feeds no damage
term yet); wiki claimed +25%. Golden case `Two Shot Fixer @50` in
`src/lib/engine/__tests__/golden/cases.json` has `expected: null` — measure
the pip-boy damage card in-game with a Two Shot Fixer and fill it in. If the
measurement contradicts +75%, a corrected override goes back into
`legendary-values.ts` with the measured value and source comment.

## 3. Hidden zero-modifier legendaries
66 visible-slot legendary effects still carry zero modifiers (mostly Script
archetype: Executioner's, Vampire's, Suppressor's, many 4-stars) and are
hidden by the display rule. For any that should appear in the picker as
selectable-but-pending, add entries to `omodBadgeOverrides` in
`corrections.ts` (`'pendingMechanic'` or `'needsEnemyDefenses'`). Supplying
real values needs either an ESM script chase or in-game measurement (wiki
values are banned per the overhaul policy).
The full gap list: `_meta.json → unresolved` ("archetype Script — needs
override" / "no route for AV ..." entries).

## 4. Atomic Shop weapons policy
`atx_alienprobe` ("The Invader") is excluded by the long-standing `^atx_`
weapon prefix rule (it only slipped through before because the old regex was
case-sensitive). Decide whether ATX weapons belong in the picker; if yes,
drop the prefix from `EXCLUDED_EDID_PATTERNS` in `extract-weapons.ts` and
let obtainability derivation gate them instead.

## 5. Adrenal curve gate (standing)
Every `pnpm extract --only buffs` run prints the adrenal-curve check
(`scripts/extract/checks/adrenal-curve-check.ts`). When the esm CLI's
curve↔effect association bug is fixed it will print the "retire the override"
message — then delete the Adrenal Reaction entry in `buff-overrides.ts` and
regen buffs. Until then curve extraction on multi-effect spells stays suspect.

## 6. Max HP input default
Juggernaut's curve reads absolute current HP; `PlayerConditions.maxHealth`
defaults to 300 (docs/assumptions.md). Sanity-check the default against
typical builds, or ignore — the Conditions section now has a Max HP field.

## Related follow-up plans
[[onslaught]] · [[consumables-overhaul]] — both deferred by explicit scope
decision during the overhaul grill.
