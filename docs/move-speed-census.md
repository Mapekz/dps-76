# Movement-speed sources → `moveSpeedBonus` sweep

Fast Fighter ("50% of bonus movement speed as reload speed",
`overrides/perk-overrides.ts`) reads the `moveSpeedBonus` bucket, which today
only auto-derives from AV `SpeedMult` routes that extract cleanly
(`normalize/mgef.ts`, 2026-07-15). The user wants **every non-sprinting
movement-speed bonus** modeled so Fast Fighter's input is complete.

**Registry enforcement:** `src/data/__tests__/move-speed-census.test.ts` pins
every extracted `moveSpeedBonus` modifier against a hand-maintained allowlist.
A new `SpeedMult` source after `bun run extract` fails CI until dispositioned here.

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
- Emergency Protocols (PA Misc torso mod, all 10 chassis): `moveSpeedBonus` +25%, gated
  `healthBelowPct 20 (strict)` + `inPowerArmor` — the first armor-OMOD source of this bucket.
- Propelling (4★ PA legendary, +5%/piece): `moveSpeedBonus`, gated `inPowerArmor` — an
  app-supplied override (`overrides/armor-values.ts`): Propelling has no plain-armor sibling
  record, and its granting COBJ is gated on the `Workbench_Crafting_PowerArmor` bench keyword —
  it can only ever be crafted onto a PA piece, even though its own enchantment carries no ESM
  condition to that effect.

## Excluded (sprint / swim / event — deliberate)

- **Sprint-only** perks: Freight Train (+10%, `IsSprinting()=1`), Dead Man
  Sprinting r1/r2 (+10/+20%, healthBelowPct + sprint), Jaguar Speed r1/r2
  (ghoul, +10/+20%, glowAtLeast + sprint) — `IsSprinting()=1` marked inactive
  at extraction; calculator models non-sprint combat.
- **Swimming** perks: Wasteland Survival 1 r7–r9 (`IsSwimming()=1`) — same
  treatment; swimming move-speed is out of scope for Fast Fighter.
- **Spotlight Player Perk** (+15%, event-global gated): left inert (event-only,
  not a standard build card).

## Discovered, not player-facing

Perks that emit `moveSpeedBonus` in extracted data but must never reach the
player loadout fold (census test marks them `excluded:*`).

- **NukaSwiftPerk** (`0x00661FDF`, +200%, `hasCard:false`): esm-walk
  2026-07-15 — `NukaSwiftSpell` (`0x00661FE2`) carries
  `AbPerkFortifyActorSpeedMult` magnitude 200, **duration 0** (instant burst,
  not a sustained buff). No reverse refs on the PERK (script/VMAD grant pattern;
  no ALCH/SPEL/VMAD player-facing path found). Not UI-selectable; excluded as
  `excluded:not-reachable`.
- **WL006_SentryBotMovementSpeedPerk** (`0x005A2637`, −40%, `hasCard:false`):
  NPC sentry-bot speed modifier ("Modifies the speed of the sentry bot.").
  Negative `SpeedMult` would wrongly penalize Fast Fighter if it ever reached
  the fold; excluded as `excluded:non-player`.

## Deliberately unmapped (needs measurement or different AV)

- **The Fixer** custom mod (`P01B_mod_Custom_Fixer` `0x0046D29E`): grants
  `ArmorShadowHide` (Stealth in Shadows) + `Mod_StealthMove_AV` (Sneaking
  Speed). This is the **sneak-locomotion** AV, *not* the general `SpeedMult`
  (`0x2DA`) that feeds `moveSpeedBonus`; reviewed 2026-07-13 and left
  unmapped (`extract-omods.ts:47-49`). Open question: does in-game Fast Fighter
  count sneak speed? Stopwatch with Fast Fighter + Fixer while sneaking would
  settle it.

## Verified empty / blocked

- **Foods beyond Fish Sandwich** — none in extracted data. No other ALCH in
  `consumables.json` carries `SpeedMult`.
- **Chems + addiction penalties** — none in extracted data. No chem carries
  `SpeedMult`; `addictions.json` has no speed-penalty withdrawal modifier. The
  Fast Fighter curve's `(0,0)` endpoint clamp for negative `SpeedMult` is
  documented but moot until data appears.
- **Armor / power-armor OMODs** — swept (`armor-omods.json`): Propelling and
  Emergency Protocols are modeled (see "Modeled today" above). **Shrouded** —
  not chased further, still unresolved. **Sleek** — found, but its AV is
  `Mod_StealthMove_AV` (sneak-locomotion), the same non-`SpeedMult` axis as
  The Fixer's grant above — moved into "deliberately unmapped", same open
  question about whether Fast Fighter counts sneak speed.
- **Weight-class / encumbrance** — out of scope. Engine-native movement
  penalty with no MGEF; `conditions.ts:228-233` only consumes
  `IsOverEncumbered` as a gate on other effects, not as a `moveSpeedBonus`
  source.

## Open question (measurement)

Does the in-game Fast Fighter conversion count sprint-only bonuses while not
sprinting? Current model says no (`IsSprinting()=1` inactive). A reload-time
stopwatch with Fast Fighter + Freight Train equipped, standing still, would
settle it. Same for sneak speed (The Fixer) — see above.
