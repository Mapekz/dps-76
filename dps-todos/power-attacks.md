# TODO: Power Attacks & Power Tools

## What
Add power attack damage for melee weapons and power tool (automatic melee) support.

## Formula components
**Additive bucket:**
- Power attack damage bonus perk (`Stat.PowerAttackDamageBonus`) — `dbm += powerAttackDBM`

**Multiplicative bucket:**
- Power attack base multiplier: ×1.5 (normal), ×2.0 (in Power Armor)
- These are separate from the additive bucket

## Melee swing speeds (replace the 1 swing/sec stubs)
Currently melee weapons are stubbed at 1 swing/sec. Need actual animation timings:
- Deathclaw Gauntlet: `animDelaySec` = ?
- Super Sledge: `animDelaySec` = ?
- Pickaxe: `animDelaySec` = ?

Use the same Speed/AnimDelaySec formula as ranged semi-auto weapons, with the same
0.8248 physical speed multiplier.

## Power tools (automatic melee)
Power tools are melee weapons with automatic attack mode (auto-swinging). They use
`animDurationSec` like automatic guns (≈ 0.11s). Also drain AP, which is deferred to
the AP/accuracy todo. For damage calc, treat as auto melee (fire rate = speed / 0.11).

## 1h vs 2h distinction
Currently both map to `weaponClass: 'melee'`. Add `'melee1h'` and `'melee2h'` weapon classes
(or a `meleeType: '1h' | '2h'` field) so Gladiator vs Slugger perks apply correctly.

## Dependencies
- `Stat.PowerAttackDamageBonus` already exists in `src/data/stats.ts`
- `playerConditions.isInPowerArmor` already exists in `PlayerConditions`
