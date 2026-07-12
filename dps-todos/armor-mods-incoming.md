# TODO: Armor Mods — Incoming Damage Resistance

> **Blocked on [phase-3-enemies.md](phase-3-enemies.md)** — this half has
> nothing to multiply against until `mitigation.ts` (the activated
> `calculateDamageResistMult`) exists. Do after phase 3, alongside
> [armor-mods-outgoing.md](armor-mods-outgoing.md) which can ship independently
> and sooner.

## What
Armor mods/legendary effects that reduce *incoming* damage — damage/energy
resist from armor pieces and their mods.

## Mods to add
- **WWR** (Weapon Weight Reduction? — confirm exact FO76 name/effect via
  esm-walk before implementing): reduces ranged incoming damage.
- **Bolstering**: increases DR/ER at low health.
- **Overeater's**: +DR/ER per active food/drink buff.

## Dependencies
- `mitigation.ts` and the `armorPen`-style per-component resist fold from
  phase-3-enemies.md #3.3.
- `EnemyProfile`/`enemyType` condition activation (also phase-3-enemies.md),
  since several of these mods interact with enemy attack type.

## Where to implement
Same checklist as the outgoing half: bucket/condition in
`src/types/modifiers.ts`, fold in `resolve.ts` or `mitigation.ts`, extractor
mapping, `docs/assumptions.md` entry, `src/data/live/armor.ts` data, armor
picker UI (shared with armor-mods-outgoing.md — build the picker once, feed
both halves).
