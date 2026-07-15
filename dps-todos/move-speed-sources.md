# Movement-speed sources → `moveSpeedBonus` sweep

Fast Fighter ("50% of bonus movement speed as reload speed",
`overrides/perk-overrides.ts`) reads the `moveSpeedBonus` bucket, which today
only auto-derives from AV `SpeedMult` routes that extract cleanly
(`normalize/mgef.ts`, 2026-07-15). The user wants **every non-sprinting
movement-speed bonus** modeled so Fast Fighter's input is complete.

## Modeled today

- Speed Demon (mutation): +20% / +25% with Strange in Numbers
  (`Mutation_FortifyMoveSpeed`, conditions translated from
  UseNormalVersion/UseSuperVersion).
- Wasteland Fish Sandwich (consumable): +20%, unconditional.
- Gun Runner r1/r2 (+10/+20%): `moveSpeedBonus`, gated on
  `weaponKeyword WeaponTypeRanged` — non-sprint `IsSprinting()=0` consumed at
  extraction (calculator never sprints).
- Squad Maneuvers r1/r2 (+10/+20%): `moveSpeedBonus`, gated on
  `teammateCount ≥ 1` — non-sprint gate consumed likewise.
- Portable Power r1–r3 (+10/20/30%): `moveSpeedBonus`, gated on
  `inPowerArmor` (WornHasKeyword `ArmorTypePower` mapped at extraction) — needs
  the Conditions-section power-armor toggle.

## Excluded (sprint / swim / event — deliberate)

- **Sprint-only** perks: Freight Train (+10%, `IsSprinting()=1`), Dead Man
  Sprinting r1/r2 (+10/+20%, healthBelowPct + sprint), Jaguar Speed r1/r2
  (ghoul, +10/+20%, glowAtLeast + sprint) — `IsSprinting()=1` marked inactive
  at extraction; calculator models non-sprint combat.
- **Swimming** perks: Wasteland Survival 1 r7–r9 (`IsSwimming()=1`) — same
  treatment; swimming move-speed is out of scope for Fast Fighter.
- **Spotlight Player Perk** (+15%, event-global gated): left inert (event-only,
  not a standard build card).

## Deliberately unmapped (needs measurement or different AV)

- **The Fixer** custom mod (`P01B_mod_Custom_Fixer` `0x0046D29E`): grants
  `ArmorShadowHide` (Stealth in Shadows) + `Mod_StealthMove_AV` (Sneaking
  Speed). This is the **sneak-locomotion** AV, *not* the general `SpeedMult`
  (`0x2DA`) that feeds `moveSpeedBonus`; reviewed 2026-07-13 and left
  unmapped (`extract-omods.ts:47-49`). Open question: does in-game Fast Fighter
  count sneak speed? Stopwatch with Fast Fighter + Fixer while sneaking would
  settle it.

## Not yet swept (no SpeedMult MGEF extracted, or outside current extractors)

- Armor / power-armor OMODs with move-speed properties (Emergency Protocols,
  Shrouded, Sleek — see dps-todos/armor-mods-outgoing.md) — blocked on the
  armor-OMOD extraction pipeline.
- Food/drink buffs beyond the fish sandwich (speed-themed foods, events).
- Chems (e.g. any Speed-branded variants) and their addiction penalties
  (negative SpeedMult — penalties currently clamp out of Fast Fighter via
  the curve's (0,0) endpoint; revisit if the game says otherwise).
- Weight-class / encumbrance movement modifiers (engine-native, likely no
  MGEF — probably out of scope, document if so).

## Open question (measurement)

Does the in-game Fast Fighter conversion count sprint-only bonuses while not
sprinting? Current model says no (`IsSprinting()=1` inactive). A reload-time
stopwatch with Fast Fighter + Freight Train equipped, standing still, would
settle it. Same for sneak speed (The Fixer) — see above.
