# Aura damage is a parallel stream

ADR-0020 established that proc-triggered damage (Electrician's, Fracturer's,
Circuit Breaker) and weapon-intrinsic DoT belong in parallel streams
(`procDps`, `dotDps`), not in `Bucket` folds. Continuous damage **auras**
follow the same reasoning: PA Tesla Coils, Miasma, and Plague Walker each
tick on their own cadence via Cloak-archetype MGEF chains, bypass dbm/crit/
sneak entirely, and are independent of the equipped weapon's fire rate.

Decided: auras are `AuraSource[]` (`src/types/auras.ts`), assembled in
`resolveLoadout` from armor OMOD `auraChase` and mutation `auraChase`
extracted data, folded by `computeAuraDps` (`src/lib/engine/aura-damage.ts`)
into `ScenarioResult.auraDps` — parallel to `procDps`/`dotDps`. `totalDps`
adds `auraDps` alongside the other streams (ADR-0007).

Sources (2026-08-28):

- **PA Tesla Coils** — ESM-proven: radiation, magnitude 20, 1s tick, flat
  ×5 curve (`Armor_PA_Mod_TeslaCoil.json`), area 10, `IsInCombat` gate.
- **Miasma** (4★ armor) — script-set magnitude/radius (`AcidCloak` AV);
  shipped `magnitudePending` (unmeasured badge, no DPS number).
- **Plague Walker** — ESM base magnitude 10 (normal) / 12 (super-serum via
  `strangeInNumbers` split); disease-count scaling unverified — base only.

In-combat gates extract from ESM but the engine assumes sustained combat
(always in combat for aura streams — see `docs/assumptions.md`).

No new persisted state: Tesla/Miasma flow through existing `armorEffects`
checklist selections; Plague Walker through existing `mutations` toggle.

## Do not undo this

Route future Cloak-archetype continuous damage through `AuraSource`/
`computeAuraDps`, not a new `Bucket` or folded into `sustainedDps`.
