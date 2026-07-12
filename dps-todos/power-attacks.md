# TODO: Power Attacks — Melee Timings & 1h/2h Split

> **Power-attack model: DONE.** Base race multiplier (×1.5 normal / ×2.0 in
> Power Armor, excluding power tools + unarmed), the additive
> `powerAttackBonus` bucket, and Charged's (4★) cadence model are all shipped
> — `powerAttackRaceMult` in `src/lib/engine/paper-damage.ts`, cadence in
> `src/lib/engine/scenarios.ts`. Power tools (automatic melee) already work:
> `WeaponHasSecondaryCharging`/auto-melee keywords merge via
> `effective-weapon.ts`, fire rate = speed / 0.11 like automatic guns. See
> `docs/assumptions.md` "Power attacks & melee cadence" for full detail.
> **Still open below:** real melee animation timings (same workstream as
> [fire-rate.md](fire-rate.md)) and the 1h/2h weaponClass split.


## What's left

### Melee swing speeds (replace the 1 swing/sec stub)
Melee weapons are still stubbed at 1 swing/sec in `src/lib/fire-rate.ts`
(`weapon.speed` applies relatively on top of the stub, but the base cadence
isn't animation-derived). Need actual per-weapon animation timings:
- Deathclaw Gauntlet: `animDelaySec` = ?
- Super Sledge: `animDelaySec` = ?
- Pickaxe: `animDelaySec` = ?

Use the same Speed/AnimDelaySec formula as ranged semi-auto weapons, with the
same 0.8248 physical speed multiplier. Full detail tracked in fire-rate.md —
treat these two docs as one melee-cadence workstream.

### 1h vs 2h distinction
`weaponClass` is still `'melee' | 'unarmed'` only (`src/types/index.ts`) — no
1h/2h split. Add `'melee1h'`/`'melee2h'` (or a `meleeType: '1h' | '2h'` field)
so Gladiator vs Slugger perks can apply correctly.

## Dependencies
- `Stat.PowerAttackDamageBonus` already exists in `src/data/stats.ts`
- `playerConditions.isInPowerArmor` already exists in `PlayerConditions`
