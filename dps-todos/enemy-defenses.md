# TODO: Enemy Defenses

## What
Re-enable enemy damage resistance (DR/ER) calculation and body-part multipliers.

## Current state (MVP)
`enemyResistMult = 1.0` (no-op). `calculateDamageResistMult()` exists in
`src/lib/damage-formulas.ts` — kept as dormant scaffolding.

## Enemy resist formula
Already implemented in `calculateDamageResistMult`:
`DamageResistMult = (IncomingDamage × 0.15 / Resist)^0.365`
where `Resist = BaseResistance × (1 - ArmorPenTotal)`.

## To activate
1. Re-add `enemy = getEnemyById(mode, enemyConfig.enemyId)` lookup to `calculateOutgoingDamage`
2. Apply `calculateDamageResistMult(perHitNonWeak, enemyResistance, armorPenPercent)` after
   computing `perHitNonWeak`
3. Re-enable the Enemy column in the UI (`src/App.tsx`)
4. Populate actual enemy DR/ER values in `src/data/live/enemies.ts`

## Body-part multipliers
Weakpoint multiplier is currently a configurable ×2.0 default. When enemy data is wired:
- Override with the actual `enemy.weakpointMultiplier` per enemy/body-part
- Add body-part selection UI (head, torso, limbs)

## Dependencies
- Accurate enemy data in `src/data/live/enemies.ts`
- Armor penetration perk data (e.g. Tank Killer, Incisor)
