# TODO: Consumables Overhaul

## What
Replace the 10-item hardcoded chem whitelist with full food/drink/alcohol/chem
extraction, category-aware stacking rules, and addiction tracking.

## User-specified rules (2026-07-10, binding)
- **Chems**: only one active at a time. **Alcohol**: only one at a time.
- **Food and non-alcohol drink** stack with each other as long as their
  bonuses are *different* — same-bonus items override each other, and the
  same-bonus test is derivable from the ESM: MGEF **Keywords** plus the
  "**Dispel with Keywords**" flag (same keyword ⇒ the last one applied
  replaces the existing one). Do not hand-author the exclusivity table.
- **Addictions**: uncapped in-game (Junkie's bonus curve tops out at 10 /
  +100%). The game exe actually tracks *withdrawal effects*, and an active
  chem removes its own withdrawal/addiction from the count. UI model the user
  wants: select a list of addictions; activating a chem that causes one of
  them suppresses that addiction until the chem is unselected.

## Current state (2026-07 data-quality overhaul)
- `scripts/extract/extract-buffs.ts` `CONSUMABLE_ITEMS`: 10 curated chems
  (MedX + NukaColaQuantum removed); SPECIAL values extract via the
  `Strength..Luck → special*` routes in `normalize/mgef.ts`
  `FALLBACK_AVIF_ROUTES`.
- `resolveLoadout` folds `specialStrength`/`specialLuck` into player STR/LCK
  (flat unconditional ADDs, no cap) — documented as a stopgap in
  `docs/assumptions.md`.
- No category field on `GeneratedBuff` (`kind` is only mutation|consumable),
  no stacking/exclusivity enforcement anywhere: UI is free multi-select and
  the engine additively stacks everything selected.
- `PlayerConditions.addictionCount` is a manual number input (max 99).

## Steps
1. **Extractor**: enumerate ALCH records with damage- or SPECIAL-relevant
   effects (instead of the whitelist). Classify each into
   chem/alcohol/food/drink from ESM keywords (`ObjectTypeChem`,
   `ObjectTypeAlcohol`, `ObjectTypeFood`, `ObjectTypeDrink` — verify exact
   edids in the dump) and store on a new `GeneratedBuff.category` field.
2. Extract each effect's MGEF keywords + Dispel-with-Keywords flag into the
   generated data (e.g. `dispelKeywords: string[]` per modifier or per buff) —
   this is the same-bonus replacement key.
3. Extract addiction data: which chem causes which addiction (the
   `AddictionOdds*` effects seen on Buffout/Mentats point at the addiction
   AVs) so chem⇄addiction suppression is data-driven.
4. **State/UI** (`BuffsSections.tsx`, `build-reducer.ts`): radio-like
   selection within chem and alcohol categories; multi-select for food/drink
   with last-wins replacement when dispel keywords collide (show what got
   replaced); addiction picker replacing the numeric input, with active-chem
   suppression feeding Junkie's `addictionCount`.
5. **Engine/loadout**: enforcement should live in selection state (the engine
   keeps additively folding whatever it is given); keep the SPECIAL fold from
   the overhaul, now covering food/drink SPECIAL buffs too.
6. Obtainability: reuse `scripts/extract/obtainability.ts` to keep cut/NPC
   ALCH records out; review via `_meta.excludedDetailed` + `pnpm extract:diff`.

## Dependencies
- `scripts/extract/obtainability.ts`, `special*` buckets, per-record `notes`,
  and the badge plumbing all landed in the 2026-07 overhaul.
- Sizeable UI surface — plan a grill/design pass before implementation.
