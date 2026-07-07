# TODO: Weapon Mods

## What
Add legendary weapon effects first, then normal weapon mods (receiver, barrel, sights, etc.).

## Phase 1: Legendary effects
FO76 legendary weapon effects can add flat damage, multiplicative damage, fire rate, etc.
Implement as a list of effects on `WeaponConfig.legendaryEffects` that modify base stats.

Common damage-relevant legendaries:
- Bloodied: +damage scaling as health decreases
- Two Shot: extra projectile
- Anti-Armor: 50% armor penetration
- Junkie's: +damage per addiction
- Furious: +damage per hit (stacking)
- Instigating: 2× damage on first hit of full-health enemy
- Aristocrat's: +damage with more caps
- Quad: 4× magazine size

## Phase 2: Normal mods
Normal mods can change: baseDamage component, fire rate (receiver), accuracy (barrel/sights).
Model as stat modifiers on `WeaponConfig.mods` slots applied before the formula.

## Dependencies
- Legendary perk cards parsed from N&D (partially done in regular-perk fix)
- Weapon `WeaponConfig.mods` object already exists in types
- `WeaponConfig.legendaryEffects: string[]` already exists in types
