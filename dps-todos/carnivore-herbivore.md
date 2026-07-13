# Carnivore's / Herbivore's food scaling (deferred)

Filed 2026-07-13 during the consumables overhaul (grill-session decision:
deferred — the extractor captures the data now so this needs no re-extract
later).

## What's missing

Carnivore's and Herbivore's mutations double food buffs from meat/vegetable
ALCH records respectively and DISABLE food buffs from the opposite type
("Herbivore" doubles veggies, zeroes meat buffs; "Carnivore" the reverse).
Neither interaction is modeled: selected food items apply their flat
extracted modifiers regardless of which mutation (if any) is active.

## What's already there

`scripts/extract/extract-buffs.ts` (consumables overhaul) captures
`GeneratedBuff.ingredientKeywords` — the resolved `IngredientType*` /
`MealType*` KYWD edids off each ALCH record — for exactly this follow-up. No
app-side consumer exists yet.

## Shape of the fix

1. **Classification audit**: `IngredientType*` keywords aren't a clean
   meat/veggie binary — soups, mixed dishes (e.g. stews with both meat and
   vegetable ingredients), and processed foods (jerky, canned goods) need a
   real audit against in-game Carnivore's/Herbivore's tooltips before writing
   a classification rule. Don't guess from keyword names alone.
2. **Engine/state**: once classified, Carnivore's/Herbivore's selection
   (mutation toggle) needs to scale or zero the SPECIAL/damage modifiers of
   ACTIVE food consumables specifically — this is a selection-dependent
   modifier transform, not a flat curve/bucket fold like the rest of the
   mutation system, so it likely needs its own small pass in
   `src/lib/loadout.ts` (or a new bucket-scoped condition) rather than
   reusing the generic `getBuffModifiers` fold.
3. **Docs**: add a "Carnivore's / Herbivore's" entry to
   `docs/assumptions.md` alongside the rest of the mutation table once
   implemented.

## Acceptance

- Herbivore doubles a selected vegetable food's effect magnitude and zeroes a
  selected meat food's.
- Carnivore does the reverse.
- Mixed/ambiguous dishes have a documented, ESM-justified classification (not
  a guess).
