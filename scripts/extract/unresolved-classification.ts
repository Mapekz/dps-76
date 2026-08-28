export type UnresolvedDisposition = 'resolve-pending' | 'out-of-scope' | 'deferred-with-issue';

export interface UnresolvedClassification {
  /** Matches an unresolved entry. String = exact prefix match; RegExp for pattern classes. */
  match: string | RegExp;
  disposition: UnresolvedDisposition;
  /** Why this class is not extracted — one terse sentence. Required. */
  reason: string;
  /** GitHub issue ref, required when disposition === 'deferred-with-issue'. */
  issue?: `#${number}`;
}

export interface UnresolvedClassifiedSummary {
  total: number;
  classified: number;
  unclassified: number;
  byDisposition: Record<string, number>;
}

export const unresolvedClassifications: UnresolvedClassification[] = [
  // ——— record-scoped rules (entry prefix = record edid) ———————————————————
  // Hostile Takeover event-scoped fortify toggles — event content, not player
  // build state; a DPS-calculator loadout can't hold them. (verified 2026-08-27)
  {
    match: /^HTO_crFortifyDamage_/,
    disposition: 'out-of-scope',
    reason: 'Hostile Takeover public-event NPC support buffs; not player build state',
  },
  // P62 ("The Drifter" season) content: every P62_ record walked 2026-08-27 is
  // obtainable:false with zero reverse refs (Ruiner's, StaggerProof, OverLoaders,
  // Splinter, Voltaic). TRAP on Ruiner's specifically: the extractor emitted
  // `wholeDamage ADD 500` with all four gates parked kind:'unresolved' — a
  // forceVisible rescue without an extractor fix would ship an unconditional
  // +500. Re-adjudicate this whole class when P62 ships.
  {
    match: /^P62_/,
    disposition: 'out-of-scope',
    reason: 'unreleased P62 season content, obtainable:false with no reverse refs',
  },
  // Chameleon mutation: invisibility archetype/audio/UI scripts + camo-break
  // conditions only; ESM-walked 2026-08-27, nothing offensive drops.
  {
    match: 'Mutation_Chameleon:',
    disposition: 'out-of-scope',
    reason: 'stealth/invisibility plumbing; no offensive component',
  },
  // Lucid legendary armor: Mod Incoming Weapon Damage MULT (EHP), feral-tier
  // curve — defense-only, the engine models player offense (walked 2026-08-27).
  {
    match: /^mod_Legendary_(?:Armor|PowerArmor)1_Lucid:/,
    disposition: 'out-of-scope',
    reason: 'incoming-damage reduction (EHP); engine models offense only',
  },
  // Relic Reaper unique-shovel custom mods: Luck-scaled Mod Item Spawn Count
  // loot bonuses (packaged meals/caps/chems) — economy, not damage.
  {
    match: /^SDOW_Mod_Custom_RelicReaper_/,
    disposition: 'out-of-scope',
    reason: 'Luck-scaled loot-quantity mods on the Relic Reaper shovel; no damage component',
  },
  // Ghoul-feral bloodpacks: rad-eating/GHL_SURV_Feral/thirst plumbing.
  {
    match: /^Bloodpack(?:Glowing|Irradiated):/,
    disposition: 'out-of-scope',
    reason: 'ghoul-feral survival consumable plumbing; no offense',
  },
  // Dogmeat companion AI limb-cripple proc — companion-side, not player build.
  {
    match: 'crDogmeatCripple:',
    disposition: 'out-of-scope',
    reason: 'companion AI perk, not player build state',
  },
  // Enemy-side NPC perks (Deathclaw pack rage/toughness, generic cr ranged
  // damage): attach to creature races, never to the player.
  {
    match: /^(?:crDeathclaw_(?:toughness|rage)_perk|crRangedDmgPerk)/,
    disposition: 'out-of-scope',
    reason: 'NPC-side creature perks; never player build state',
  },

  // ——— message-scoped rules (match anywhere in the entry) ————————————————
  // MGEF skip markers that name their own accounting: Happy-Go-Lucky is served
  // by extraPerkModifiers; the LiveLove magazine MGEF is the dead
  // companion-gated variant (Live & Love 5 itself lives in buffValueOverrides).
  {
    match: /skipped — modeled by Happy-Go-Lucky/,
    disposition: 'out-of-scope',
    reason: 'already modeled via extraPerkModifiers (the skip note names it)',
  },
  {
    match: /FortifyLuckMagazineLiveLove skipped/,
    disposition: 'out-of-scope',
    reason: 'dead companion-gated MGEF variant; Live & Love 5 is modeled in buffValueOverrides',
  },
  // Jetpack/Light MGEF archetypes: PA jetpacks and headlamps — movement/utility.
  // (Cloak is deliberately NOT here: the Cloak archetype is the game's damage-aura
  // delivery — Tesla coils, Electrified retaliation — and needs adjudication.)
  {
    match: / archetype Jetpack — needs override/,
    disposition: 'out-of-scope',
    reason: 'PA jetpack movement effect',
  },
  {
    match: / archetype Light — needs override/,
    disposition: 'out-of-scope',
    reason: 'headlamp/light effect',
  },
  // Excavator PA set bonus: +carry weight via PowerArmorEquipped_Excavator
  // (the paint/misc mods all write the same set-counter AV).
  {
    match: /ActorValues on PowerArmorEquipped_Excavator — unmapped/,
    disposition: 'out-of-scope',
    reason: 'Excavator set-bonus carry-weight plumbing',
  },
  // Rad Scrubbers PA mod: rad-immunity script effect, plus the HasPerk
  // gate rad-food consumables carry against it — all rads-side.
  {
    match: /PowerArmor_RadScrubbersEffect archetype Script/,
    disposition: 'out-of-scope',
    reason: 'PA rad-scrubber rad-immunity script',
  },
  {
    match: /HasPerk\(PA_RadScrubbers\)=0/,
    disposition: 'out-of-scope',
    reason: 'rad-food gate against the Rad Scrubbers PA mod; rads-side',
  },
  // Survival/QoL actor values with no offensive component (each name verified
  // against its carriers 2026-08-27; see .claude/skills/esm-sync/NOTES.md).
  // Deliberately NOT swept: DamageResist (armorPenFlat candidate), UnarmedDamage/
  // UnarmedEnergyDamage, Mod_Brawler_AV, Mod_IgnoreArmor_AV (model candidates),
  // and the low-count LGND_*/VATS*/KillStreak*/PainTrainBleed tail (pending walks).
  {
    match:
      /no route for AV (?:Rads|SURV_[A-Za-z_]+|Addiction[A-Za-z]+|GHL_SURV_Feral|RadResistExposure|MutationCount|CarryWeight|STAT_XPMult|HealRate|STAT_SprintAPCost|PoisonResist|FallSpeedMult|STAT_ResistRadIngestion|FireResist|FrostResist|WaterBreathing|STAT_Lockpicking|PABatteryDamageRate|STAT_GunAccuracy|HungerThirstTier|STAT_ChemDuration|SprintSpeedMult|76CharGenHasPickedUpPipBoy|FallingDamageMod|MutationEmpathStrength|JumpHeightMult|STAT_ItemDegradation|STAT_StealthBoyDuration) — needs mapping/,
    disposition: 'out-of-scope',
    reason: 'survival/QoL/defense actor value; no player-offense component',
  },
  {
    match:
      /ActorValues on (?:CarryWeight|ArmorQuietMod|STAT_LimbDamageResistance|ArmorShadowHide|ReflectMeleeDamage|FallingDamageMod|Mod_Stabilized_AV|Mod_ReducedPowerAttack_AV|Mod_StealthMove_AV|Mod_SprintAPArmor_AV|SprintSpeedMult|STAT_ChemDuration|PABatteryDamageRate|ArmorBlockPercent|Fishing_[A-Za-z]+|SURV_[A-Za-z_]+|RadsRate|HealRate) — unmapped/,
    disposition: 'out-of-scope',
    reason:
      'survival/QoL/defense actor value write; no player-offense component (Stabilized=scope sway, ReducedPowerAttack=AP cost, LimbDamageResistance=wearer defense, ReflectMeleeDamage=deliberately excluded per armor-corrections.ts)',
  },
  {
    match: /perk mod_armor_StabilizedPerk: entry point Mod Actor Scope Stability — not/,
    disposition: 'out-of-scope',
    reason: 'scope-sway QoL; matches Mod_Stabilized_AV reasoning',
  },

  // ——— archetype-sweep classes (every distinct MGEF walked 2026-08-27; see
  // NOTES.md "archetype sweep") ————————————————————————————————————————————
  // Brew/consumable drunk-status duration timers — inert plumbing.
  {
    match: /_Duration archetype Script — needs override/,
    disposition: 'out-of-scope',
    reason: 'drunk/buzzed status duration timer; inert plumbing',
  },
  // Mutation/magazine/chameleon Pip-Boy icon dummies — UI only.
  {
    match: /UIDummy\w* archetype Script — needs override/,
    disposition: 'out-of-scope',
    reason: 'Pip-Boy status-icon UI dummy effect',
  },
  // PA paint/cosmetic ability effects: voice modules, horns, lights, skins,
  // jetpack geometry cloaks — no Assoc. Item, nothing cast (spot-walked).
  {
    match:
      /MGEF \w*(?:VoiceModule|Klakson|SkellScream|SamurEye|Lights?FX|Jetpack\w*_Geo)\w* archetype/,
    disposition: 'out-of-scope',
    reason: 'PA paint/cosmetic FX cloak; casts nothing',
  },
  // Targeting-HUD cloaks (PA helmet DetectLife, camera) — utility highlight.
  {
    match: /TargetingHUD_Cloak archetype Cloak/,
    disposition: 'out-of-scope',
    reason: 'targeting-HUD enemy-highlight cloak; utility only',
  },
  // Stimpak-archetype heals (Vampire regen, Medic Pump auto-stim, Minty
  // Breather): healing only, no outgoing-damage tie (walked 2026-08-27).
  {
    match: / archetype Stimpak — needs override/,
    disposition: 'out-of-scope',
    reason: 'healing-only Stimpak-archetype effect; engine models offense',
  },
  // Post-attack invisibility legendary (Ghost's / cloak-on-melee) — stealth
  // utility, not a damage number.
  {
    match: /Legendary_CloakEffect archetype Invisibility/,
    disposition: 'out-of-scope',
    reason: 'post-attack invisibility utility',
  },
  // Team-support / defensive star-4 cloak procs (walked: Conductor's restores
  // 20 AP+HP to team; Aegis = 5× team resists; Stalwart's = PA condition).
  {
    match:
      /MGEF (?:Legendary_Weapon_ConductorsAddCloakEffect|Legendary_PowerArmor_AegisApplyCloakEffect|Legendary_PowerArmor_StalwartsApplyCloakPerkEffect) archetype Cloak/,
    disposition: 'out-of-scope',
    reason: 'team-support/defensive cloak proc; no enemy damage',
  },

  // ——— weapon-enchantment condition gates (all 49 walked 2026-08-27) ————————
  // Daily Ops execute/weakness gates (Resilient mutation counter-mechanic):
  // a game mode the calculator does not represent.
  {
    match: /condition: (?:HasSpell\(DailyOps_Mutation_Resilient\)=1|GetIsInDailyOps\(\)=1)/,
    disposition: 'out-of-scope',
    reason: 'Daily Ops-mode execute gate; mode not modeled',
  },
  // (HasRefType location-gate rule removed 2026-08-28: its entries resolved
  // when the essential/dead constant-folding extracted those enchantment rows.)

  // Meat Week "Brew Haha" spotlight event gate on brews — event-scoped global.
  {
    match: /condition: GetGlobalValue\(Spotlight_BrewHaha\)=0/,
    disposition: 'out-of-scope',
    reason: 'Meat Week Brew Haha event-spotlight gate on brews; event state not modeled',
  },
  // World pets prowess perks — pet content, not player build state.
  {
    match: /^WorldPets_/,
    disposition: 'out-of-scope',
    reason: 'world-pet prowess perk; pet content, not player build state',
  },
  // Recon scopes (weapon + PA helmet): enemy-marking utility, script-driven.
  {
    match: /MGEF ReconScopeEquippedEffect: zero magnitude, no curve/,
    disposition: 'out-of-scope',
    reason: 'recon scope enemy-marking utility; script-driven, no damage',
  },
  // PA Overdrive Servos: sprint AP drain (movement QoL). Kinetic Servos /
  // APRegen legs deliberately NOT swept — apRegen feeds sustained DPS and
  // needs a walk.
  {
    match: /perk PA_OverdriveServos: entry point Mod Sprint AP Drain Rate/,
    disposition: 'out-of-scope',
    reason: 'sprint AP drain; movement QoL',
  },
  {
    match: /ActorValues on PA_OverdriveServos_AV — unmapped/,
    disposition: 'out-of-scope',
    reason: 'sprint AP drain counter write; movement QoL',
  },
  // Brawler / Ignore Armor lining AV writes: the deliberately-skipped
  // duplicate arm — the effect routes via the ench/flat rows (ded3ad0; see
  // docs/assumptions.md "Armor lining Brawler / Ignore Armor").
  {
    match: /ActorValues on (?:Mod_Brawler_AV|Mod_IgnoreArmor_AV) — unmapped/,
    disposition: 'out-of-scope',
    reason:
      'duplicate arm of a routed lining effect (ench/flat rows carry it); skipping avoids double-count',
  },
  // Armor-legendary piece-count gate rows (Bolstering/Vanguard/Mutant's/…):
  // the per-piece scaling itself extracts via wornPieces curves where
  // offensive; these GetValue(count)=N gate rows are the plumbing.
  {
    match: /perk Legendary_Armor_\w+: GetValue\(LGND_EquippedArmorCount_/,
    disposition: 'out-of-scope',
    reason: 'armor-legendary piece-count gate row; per-piece scaling models via wornPieces curves',
  },

  // ——— unknown entry points: QoL classes (names enumerated 2026-08-27; the
  // damage-relevant shortlist — Gun Fu, Blitz, Gun Range Mult, Splash, Grim
  // Reaper's, Quick Hands, etc. — is deliberately absent, pending fixes) ————
  {
    match:
      /^unknown entry point: (?:Mod Item Weight|Mod Crafting Dupe Chance|Mod Item Spawn Count|Mod Crafting Return Quantity|Mod Crafting Creation Recipe Level|Mod Scrap Reward Mult|Mod ingredients harvested|Mod Workshop (?:Repair|Build) Cost|Mod Move Camp Cost|Mod (?:Buy|Sell) Prices|Mod Barter Charisma|Mod Charisma Challenge Chance|Mod Max Barter Currency|Mod Fast Travel Cost|Mod Item Repair (?:Mult|Condition)|Mod Item Condition Loss|Mod Damaged Condition Regen Delay|Mod Crafted Item Bonus Health)$/,
    disposition: 'out-of-scope',
    reason: 'crafting/economy/item-condition entry point',
  },
  {
    match:
      /^unknown entry point: (?:Mod Auto (?:Hacking|Lockpicking) Chance|Mod Hacking Guesses|Mod Lockpick Sweet Spot|Mod Terminal Lockout Time|Set Lockpicks Unbreakable|Set Player Gate Lockpick)$/,
    disposition: 'out-of-scope',
    reason: 'lockpicking/hacking entry point',
  },
  {
    match:
      /^unknown entry point: (?:Mod Detection (?:Light|Movement|Sneak Skill)|Ignore Running During Detection|Apply Sneaking Spell|Mod Actor Scope Stability|Mod Scope Hold Breath AP Drain Mult)$/,
    disposition: 'out-of-scope',
    reason: 'detection/stealth/aim-stability entry point',
  },
  {
    match: /^unknown entry point: Mod (?:Exp|Exp Speech|Kill Experience)$/,
    disposition: 'out-of-scope',
    reason: 'XP/progression entry point',
  },
  {
    match:
      /^unknown entry point: (?:Mod Addiction Chance|Mod Bleedout Time|Mod Breath Timer|Mod Falling Damage|Mod Rads (?:for Rad Health Max|to Health Mult|to Radshield Mult)|Set Rads To Health Mult|Mod Recovered Health|Mod Armor Rating|Mod Evasion Chance|Mod Percent Blocked|Mod Incoming (?:Battery|Explosion|Limb) Damage|Mod Incoming Spell (?:Duration|Magnitude)|Mod Incoming Stagger|Mod Typed Incoming (?:Spell Magnitude|Weapon Damage)|Mod Reflect Damage Chance|Mod Mine Explode Chance|Mod Sprint AP Drain Rate|Mod VATS Attacker Accuracy)$/,
    disposition: 'out-of-scope',
    reason: 'player-defense/survival entry point (incoming damage, rads, evasion, bleedout)',
  },
  {
    match:
      /^unknown entry point: (?:Mod Mysterious (?:Stranger|Savior) Chance|Set Team Medic|Set (?:Consume|Alt) Revive Item|Mod Commanded Actor Limit|Apply Friendly Hit Spell|Add Leveled List On Death|Apply On Death Spell|Apply On Kill Participation Spell|Set Can Explode Pants|Activate|Iron-Sights Activate|Mod Actor Grenade Speed Mult|Mod NPC Normalized (?:Level|Max level|Min Level)|Mod Body Part Damage Mult|Apply Weapon Swing Spell|Apply Weapon Attack Spell|Mod VATS Attack Action Points)$/,
    disposition: 'out-of-scope',
    reason:
      'social/event/NPC-scaling/misc entry point (Swing=ally-heal carriers, Attack=Bullet Shield/event NPCs, Body Part=NPC boss encounters, VATS Attack AP=test/inert carriers — walked 2026-08-27)',
  },
];

function entryMatchesRule(entry: string, rule: UnresolvedClassification): boolean {
  return typeof rule.match === 'string' ? entry.startsWith(rule.match) : rule.match.test(entry);
}

export function classifyUnresolved(
  entries: readonly string[],
  rules: readonly UnresolvedClassification[] = unresolvedClassifications,
): {
  classified: Map<UnresolvedClassification, string[]>;
  unclassified: string[];
} {
  const classified = new Map<UnresolvedClassification, string[]>();
  const unclassified: string[] = [];

  for (const entry of entries) {
    const rule = rules.find((r) => entryMatchesRule(entry, r));
    if (rule) {
      const bucket = classified.get(rule);
      if (bucket) bucket.push(entry);
      else classified.set(rule, [entry]);
    } else {
      unclassified.push(entry);
    }
  }

  return { classified, unclassified };
}

/** Fold `classifyUnresolved` output into the `_meta.json` summary shape. */
export function summarizeUnresolvedClassification(
  entries: readonly string[],
  result: ReturnType<typeof classifyUnresolved>,
): UnresolvedClassifiedSummary {
  const byDisposition: Record<string, number> = {};
  for (const [rule, matched] of result.classified) {
    byDisposition[rule.disposition] = (byDisposition[rule.disposition] ?? 0) + matched.length;
  }

  return {
    total: entries.length,
    classified: entries.length - result.unclassified.length,
    unclassified: result.unclassified.length,
    byDisposition,
  };
}
