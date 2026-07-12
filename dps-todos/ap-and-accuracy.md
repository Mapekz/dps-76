# TODO: VATS Accuracy & Recoil

> **AP economy + manual-aim hit rate: DONE (2026-07-11).** Full steady-state AP
> drain/regen/uptime model, the "AP-limited" VATS DPS line, and the manual-aim
> `hitRatePct` input all shipped — `src/lib/engine/ap-economy.ts`,
> `docs/assumptions.md` "AP economy". VATS hit-chance modeling was explicitly
> deferred at the time and is the only scope left in this doc (originally
> titled "AP Costs, Accuracy & Recoil"; folded in the former `vats-accuracy.md`
> raw notes below since nothing referenced them elsewhere).

## What's left: VATS accuracy % and recoil/spread

No `accuracy`/`vatsAccuracy` bucket exists yet (`src/types/modifiers.ts`); VATS
accuracy is hardcoded to 100% (`src/lib/engine/scenarios.ts`, see comment "VATS
accuracy is assumed 100%"). Lowest priority of the remaining engine work —
revisit only once enemy defenses (phase-3-enemies.md) make hit-chance actually
matter for a mitigation-aware DPS number.

## Known accuracy sources (to extract + model)
- VATS Enhanced: +50% VATS accuracy (2-star weapon mod)
- Vector: +10-50% (4-star armor mod)
- Photoropter furniture: +25%
- Eye of the Hunter: +30% (leggo perk, depends on enemy distance)
- Awareness perk: +5/18/30/45/50% at 1/15/30/45/60/100 PER
- Orange Mentats: +10%
- VATS Matrix overlay (power armor mod): ×1.1
- Conc Fire: ×1.04 per shot
- Aligned mods: +10 AccuracyBonus
- Glow Sights mods: +15 AccuracyBonus

## Recoil / spread
Ignored for now. Full accuracy model requires weapon-specific spread values and
aim-down-sight multipliers.

## Dependencies
- `playerConditions.agility` exists (AP economy, already wired)
- `playerConditions.perception` exists (for Awareness perk)
