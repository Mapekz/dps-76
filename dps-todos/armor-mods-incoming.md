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

## Findings from the armor-omod extraction pass (2026-07-18)
`armor-omods.json` (5569 records) surfaced every incoming-damage-shaped
effect below as an `unmapped` ActorValue note (`extract-omods.ts`'s
`unresolved properties` sweep, `_meta.json` `unknownProperties` — none of
these have a `PROPERTY_BUCKETS`/`FALLBACK_AVIF_ROUTES` route yet, so they
extract with `modifiers: []` and self-exclude from the outgoing checklist by
construction). Reviewed here rather than hand-picked, because this doc's
"Mods to add" list above pre-dates the extraction pipeline and undercounts
what's actually there:

- **Perk-grant "Less Damage From X" family** (`LGND_DmgFrom*` ActorValues,
  6 legendary armor 1★ mods, armor+PA variants each): Zealot's
  (`LGND_DmgFromScorched`, was misfiled as an OUTGOING mod in
  `armor-mods-outgoing.md` until this pass — corrected there), Assassin's
  (`LGND_DmgFromHumans`), Hunter's (`LGND_DmgFromAnimals`), Exterminator's
  (`LGND_DmgFromMirelurksAndInsects`), Ghoul Slayer's (`LGND_DmgFromGhouls`),
  Troubleshooter's (`LGND_DmgFromRobots`). All zero-modifier as extracted —
  same "ActorValues on `LGND_Dmg*` — unmapped" note shape, no
  `PROPERTY_BUCKETS` route exists for this AV family yet. Note the WEAPON
  legendary namesakes (same names, different mechanic — +damage vs faction,
  outgoing) already exist and are unrelated; don't conflate when this lands.
- **Reflect/block/resist mods**: Punishing/Welded Rebar/Reactive Plates
  (`ActorValues on ReflectMeleeDamage`, 14 records) — reflects a fraction of
  melee damage back at the attacker; Braced (`ArmorBlockPercent`, 11
  records); Strengthened (`STAT_LimbDamageResistance`, 11 records) — limb-hit
  damage resistance specifically, distinct from the general DR/ER pipeline.
- **Chameleon** (`LGND_Chameleon`, 2 records) — likely a detection/threat
  mechanic (stealth-adjacent), not a direct damage-resist; confirm shape via
  `esm-walk` before modeling.
- **Regenerating** (`HealRate`, 2 records) — HP-regen, same DPS-relevance
  question as Auto-Stim/Medic Pump in `armor-mods-outgoing.md` (does it
  change effective survivability/uptime enough to matter here, or is it out
  of scope as a pure defensive stat).
- **Explicitly out of scope** (neither incoming nor outgoing damage — noted
  for completeness, not this doc's concern): `PowerArmorEquipped_Excavator`
  (143 records, a PA-model gate flag), `CarryWeight` (59, Pocketed/Deep
  Pocketed), `Mod_ReducedPowerAttack_AV` (22, Aerodynamic — AP cost, not
  damage), `ArmorShadowHide`/`Mod_StealthMove_AV`/`ArmorQuietMod` (stealth
  noise/visibility, not a modeled sneak-attack input), `FallingDamageMod`
  (Cushioned), `STAT_ChemDuration` (BioCommMesh), various PA Misc-slot
  utility AVs (`Mod_Brawler_AV`, `Mod_Stabilized_AV`, `Mod_SprintAPArmor_AV`,
  `PABatteryDamageRate`, `PA_OverdriveServos_AV`/`SprintSpeedMult`,
  `PA_RustyKnuckles_AV`, `UnarmedDamage`/`UnarmedEnergyDamage` — unarmed
  builds are out of scope, `Mod_IgnoreArmor_AV` (Weighted — likely an
  incoming-armor-class mechanic, not the player's own armor pen).
