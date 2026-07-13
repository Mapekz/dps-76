# Carnivore's / Herbivore's food scaling — DONE 2026-07-13

> **Shipped 2026-07-13**, same-day follow-up to the consumables overhaul.
> Full semantics in `docs/assumptions.md` "Carnivore's / Herbivore's food
> scaling"; implementation in `src/lib/diet-mutations.ts`.

## What shipped

- **Classification audit resolved from the game's own perk conditions** (no
  keyword-name guessing): the Mutation_Carnivore/Herbivore SPELs grant perks
  with "Mod Spell Magnitude" entry points — Carnivore ×2.0 on
  `IngredientTypeMeat` spells (×2.5 with Strange in Numbers, via the same
  UseNormal/SuperVersion condition forms as every mutation), ×0 on
  `IngredientTypeVegetable`; Herbivore ×2.0/×2.5 on `Vegetable|Herb|Fruit`,
  ×0 on `Meat`. The asymmetry (Carnivore doesn't zero herb/fruit dishes) is
  real ESM data.
- **Effect-level gate**: only MGEFs carrying
  `SURV_EffectTypeFood{Buff,Hunger,Healing}` scale — captured per-modifier at
  extraction (`GeneratedBuff.foodScalableModifierIds`). Audited all 77
  meat/veg damage-relevant foods: one exemption exists (Rudy's Pozole's plain
  FortifyCharisma/Luck) and it's honored data-driven.
- **Engine**: `applyDietScaling` in `getBuffModifiers` — doubled modifiers
  become ×2.0/×2.5 `strangeInNumbers`-conditioned variants; zeroed ones drop.
- **Mixed dishes**: zero records carry both meat+vegetable tags (pinned by
  test); if one ever ships, zeroing wins (entry points compose ×2 × ×0).
- **UI/state**: Carnivore ↔ Herbivore mutually exclusive in the build
  reducer (each serum cures the other); active Food & Drink rows badge
  "×2 diet" / struck-through "no effect".

## Remaining

Nothing blocking. Optional in-game confirmations: pip-boy effect-card
readings for a doubled food under SIN (×2.5) and the pozole exemption.
