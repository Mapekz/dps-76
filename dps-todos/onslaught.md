# TODO: Onslaught Mechanic

## What
Model the Onslaught stacking mechanic — the shared stack counter behind
Furious, Pounder's (melee only), Gunslinger Expert/Master, and Guerrilla
Expert/Master. User-confirmed (2026-07-10): the mechanic is "determined by the
game ESM pretty clearly when you look up those mentioned effects" — derive it
from those records, do not use wiki numbers.

## Current state (2026-07 data-quality overhaul)
- The Furious wiki override (+5%/consecutive hit, max 9) was **purged** from
  `src/data/overrides/legendary-values.ts`; the effect is inert and badged
  `pendingMechanic` via `corrections.ts omodBadgeOverrides` (so is Pounder's).
- Pounder's (`mod_Legendary_Weapon4_Melee_Pounders`) has `hasEnchantments: true`
  but zero extracted modifiers (Script archetype).
- Gunslinger/Guerrilla Expert+Master perks are inert placeholders in
  `src/data/live/perks.ts` (`statsModified: []`).
- IR scaffolding that already exists: `StackCounter` includes `'onslaught'`
  (`src/types/modifiers.ts`), `PlayerConditions.onslaughtStacks` (0–10,
  defaults 10), and stat fields `OnslaughtDamageBonus` /
  `OnslaughtWeakspotPerStack` in `src/data/stats.ts` (both 0.0). The old
  `furiousStacks` input in ConditionsSection becomes redundant once this lands.

## Steps
1. **ESM derivation pass**: `esm get` each contributor —
   `mod_Legendary_Weapon1_DmgConsecutiveHits` (Furious),
   `mod_Legendary_Weapon4_Melee_Pounders`, the Gunslinger/Guerrilla
   Expert/Master perk records — and chase their SPEL/MGEF/AVIF chains for the
   Onslaught actor value, per-stack magnitudes, stack cap, decay, and which
   sources *enable* vs *scale* the counter (compare the Adrenal pattern:
   `abEnableKillStreak` enable-effects + curve-bearing value effects).
2. Extend `normalize/mgef.ts` with whatever route/curve-input the Onslaught AV
   uses (add to `CURVE_INPUT_AVS` if curve-driven).
3. Engine: fold the contributors against the `onslaught` stack counter;
   collapse `furiousStacks` into `onslaughtStacks` (one counter, per the shared
   mechanic) — migration note for the URL codec.
4. Remove the `pendingMechanic` badges for Furious/Pounder's once they emit
   real modifiers; wire Gunslinger/Guerrilla families in `perk-modifiers`.
5. Golden cases: `expected: null` entries for Furious at 0 / max stacks.

## Dependencies
- None hard; badge/override plumbing from the 2026-07 overhaul is in place.
- `docs/assumptions.md` entry required for anything the ESM chase can't prove.
