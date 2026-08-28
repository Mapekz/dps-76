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

  // ——— batch 4: tail-walk sweep (every entry below ESM-walked 2026-08-28;
  // evidence in .claude/skills/esm-sync/NOTES.md) ——————————————————————————
  // `perk X: entry point Y — not modeled` is a SECOND emitter (the OMOD/grant
  // chase in translateGrantedPerk) of the same EP names the `unknown entry
  // point:` rules above already exclude — same reasoning, sibling phrasing.
  {
    match:
      /: entry point (?:Mod Incoming (?:Explosion|Battery|Limb) Damage|Mod Sprint AP Drain Rate|Mod Item Weight|Mod Incoming Stagger|Mod Addiction Chance|Mod Item Condition Loss|Mod Percent Blocked|Mod VATS Attack Action Points|Mod Power Attack Action Points|Mod Spell (?:Magnitude|Duration)|Mod Actor Scope Stability|Mod Incoming Spell (?:Duration|Magnitude)|Mod Evasion Chance|Mod Armor Rating|Mod Recovered Health|Mod Breath Timer|Mod Bleedout Time|Mod Falling Damage) — not modeled/,
    disposition: 'out-of-scope',
    reason:
      'defense/survival/QoL entry point via the OMOD-grant chase; same names excluded in the unknown-entry-point rules above',
  },
  // Daily Ops execute-gate sibling row: the ANDed Health<=2 condition of the
  // same Resilient-counter effect the DailyOps rule already excludes.
  {
    match: /weapon enchantment: condition: GetValue\(Health\)=2/,
    disposition: 'out-of-scope',
    reason: 'sibling row of the Daily Ops Resilient execute gate; mode not modeled',
  },
  // The extractor's own deliberate-skip note for the lining mult arm.
  {
    match: /Mod_IgnoreArmor_AV — multiplicative arm intentionally not extracted/,
    disposition: 'out-of-scope',
    reason: 'deliberate extractor skip (double-count vs flat rows); the note is the record',
  },
  // Piece-count gate family, av-write phrasing (rule above covers the
  // perk-GetValue phrasing).
  {
    match: /ActorValues on LGND_EquippedArmorCount_\w+ — unmapped/,
    disposition: 'out-of-scope',
    reason:
      'armor-legendary piece-count counter write; per-piece scaling models via wornPieces curves',
  },
  // Defense/QoL/economy/native-engine dead-end AVs — each walked: Overkill
  // kill-streak counter, VATS crit-mult RNG bounds, V63 refracting, Night
  // Light ToD, Rejuvenator survival, Doctor's Orders revive, blocking/reflect/
  // evade/auto-block defense family, aim/sneak QoL, LifeSaver, Slayer's
  // incoming-by-race family, Weightless carry-weight, Tanky's DR, Chameleon/
  // Nocturnal/Medic's armor, RD01 stability/jump, PA_Strength placeholder
  // paints, Bloody Mess gore-VFX enables, Choo-Choo's PainTrain pseudo-weapon
  // (PA sprint-ram, never a roster weapon — supersedes the earlier
  // "needs GetIsID modeling" note).
  {
    match:
      /(?:ActorValues on|no route for AV) (?:KillStreakPerKillCount|VATSCriticalMultAdjust(?:Min|Max)|RefractingProjectileChance|NightLight_IgnoreToD|LGND_RejuvenatorTier|CheatDeathResetOnWeakPointChance|LGND_DmgFromBlocking|ReflectBlockedDamage|ReflectDamage|LGND_AutoBlockChance|AutoBlockChanceProjectile|STAT_SpeedMultWhileAiming|STAT_Sneak(?:Sound)?|STAT_EvadeChance|LifeSaver|PA_Strength_AV|LGND_DmgFrom(?:Ghouls|Robots|Scorched|Humans|MirelurksAndInsects|Animals|Supermutants)|Legendary_Armor_Weight(?:Weapons|Ammo|FoodDrinkChems|Junk)Value|Legendary_Tankys_PowerArmorCount|LGND_Chameleon|LGND_ResistancesNight|LGND_Medic|RD01_PowerArmor_(?:StabilizedBracersStabilityScoped|StabilizedBracersStabilityHipFire|ElasticServosJumpHeight)_AV|BloodyMess(?:BurnEnable)?|PainTrain(?:Bleed)?)\b/,
    disposition: 'out-of-scope',
    reason:
      'defense/QoL/economy/native-engine dead-end actor value; no modelable player-offense component',
  },
  // Melee-retaliation elemental armor family → tracked decision issue.
  {
    match: /^mod_Legendary_(?:Armor|PowerArmor)3_(?:Toxic|Burning|Frozen|Electrified):/,
    disposition: 'deferred-with-issue',
    issue: '#88',
    reason:
      'retaliation-on-being-hit elemental DoT; deliberately unmodeled pending a hits-taken model',
  },
  // AP-refund-on-kill family → tracked decision issue.
  {
    match:
      /(?:ActorValues on|no route for AV) LGND_APOnKill\b|^mod_Custom_SlugBuster:|^mod_Legendary_Weapon2_APViaKill:/,
    disposition: 'deferred-with-issue',
    issue: '#89',
    reason: 'AP-refund-on-kill; deferred pending enemy TTK modeling',
  },
  // Kinetic Lining (ModKineticLiningPerk): on-damage-taken AP restore — same
  // hits-taken-rate class as #88/#89; descriptive note on the torso records.
  {
    match: /^mod_PowerArmor_.*_Torso_Misc_Kinetic:.*restores AP by 20% of damage taken/,
    disposition: 'deferred-with-issue',
    issue: '#89',
    reason: 'on-damage-taken AP restore; deferred pending hits-taken modeling',
  },
  // Fallout Worlds custom-ruleset hunger/thirst suppressor on chems.
  {
    match: /HasMagicEffect\(VaultFed_NoHungerNoThirst_Effect\)/,
    disposition: 'out-of-scope',
    reason: 'Fallout Worlds custom-ruleset hunger/thirst gate on chems; survival-side',
  },
  // Stagger CC — the engine has no CC/stagger surface at all.
  {
    match: / archetype Stagger — needs override/,
    disposition: 'out-of-scope',
    reason: 'stagger CC rider; no stagger/CC modeling surface exists in the engine',
  },
  {
    match: /^DLC04_PaddleBall(?:_NWOT)?: weapon enchantment: condition: GetRandomPercent\(\)=/,
    disposition: 'out-of-scope',
    reason: 'tiered roll for the Paddle Ball stagger rider; stagger CC not modeled',
  },
  // Cut content: CUT_-prefixed records and cut-perk gates; hyphenated POST-
  // melee "Stun Pack" family (underscore POST_ is filtered at the extractor,
  // the hyphen spelling slips through — extractor widening tracked in NOTES).
  {
    match: /^CUT_|HasPerk\(CUT_/,
    disposition: 'out-of-scope',
    reason: 'cut/test content (CUT_ prefix convention)',
  },
  {
    match: /^POST-/,
    disposition: 'out-of-scope',
    reason: 'deprecated hyphenated-POST melee mod tree (includes CUT_ template); zero reverse refs',
  },
  // Creature-side cryo slow on an NPC boss weapon.
  {
    match: /crGeneric_CryoSlow_Effect/,
    disposition: 'out-of-scope',
    reason: 'NPC boss weapon slow effect; creature-side',
  },
  // Gulpershine ToxicGin: enemy damage-OUTPUT debuff (defense-side).
  {
    match: /ToxicGin_PoisonEnemies/,
    disposition: 'out-of-scope',
    reason: 'enemy damage-output debuff (player damage-taken side)',
  },
  // ATX Brotherhood jetpack cosmetic weapon-out gate.
  {
    match: /condition: IsWeaponMagicOut\(\)=1/,
    disposition: 'out-of-scope',
    reason: 'ATX jetpack cosmetic weapon-out gating',
  },
  // Informational chain-note the explosion extractor leaves on purpose.
  {
    match: /Chain-flagged explosion/,
    disposition: 'out-of-scope',
    reason: 'informational note from the explosion chain handling; not a gap',
  },
  // Unstoppable Monster magazines: avoid-damage procs modeled in
  // buffValueOverrides (verified 2026-08-28); the perk-side rows are the
  // same effect's plumbing.
  {
    match: /^Magazine_Unstoppables0\d(?:Perk|_Potion):/,
    disposition: 'out-of-scope',
    reason: 'avoid-damage proc modeled via buffValueOverrides; perk rows are the same effect',
  },
  // Anti-Aristocrat's (Eat The Rich): damage scaled on TARGET caps — real
  // offense but obtainable:false with ZERO reverse refs anywhere in the dump;
  // dormant/unreleased. Re-adjudicate if it ever ships.
  {
    match: /^mod_Custom_EatTheRich:/,
    disposition: 'out-of-scope',
    reason: 'dormant/unreleased unique mod (obtainable:false, zero reverse refs); hidden app-side',
  },
  // ——— batch 5: final tail (2026-08-28) ————————————————————————————————————
  // J's deliberate marker notes double-report into unresolved; the notes are
  // the record, these lines are bookkeeping echoes.
  {
    match: /per-arm bleed counter; DoT modeled via ENCH chase wornPieces curve/,
    disposition: 'out-of-scope',
    reason: 'marker echo of the modeled Rusty Knuckles bleed (see the record notes)',
  },
  {
    match: /native-engine AP-regen flag, magnitude not ESM-derivable/,
    disposition: 'out-of-scope',
    reason: 'marker echo of the Kinetic Servos measured-pending note',
  },
  // Diet mutations food/veg buff plumbing — modeled via diet-mutations.ts.
  {
    match: /^Mutation_(?:Carnivore|Herbivore): perk Mutation_EatAllThe\w+_Perk:/,
    disposition: 'out-of-scope',
    reason: 'diet-mutation food-buff plumbing; modeled via diet-mutations.ts',
  },
  // Weightless/Glutton armor legendary carry-weight item-type gates.
  {
    match: /perk Legendary_(?:Armor_Weight\w+Perk\w*|Glutton_Perk):/,
    disposition: 'out-of-scope',
    reason: 'carry-weight/food-buff armor legendary; economy/survival side',
  },
  // Choo-Choo PainTrain routing echo (third phrasing of the same
  // pseudo-weapon adjudication).
  {
    match: /route\(PainTrain\)/,
    disposition: 'out-of-scope',
    reason: "Choo-Choo's PainTrain pseudo-weapon routing echo; not a roster weapon",
  },
  // Creature-record perks (crStormBoss, crRadHogFury, …): cr prefix = NPC-side.
  {
    match: /^cr[A-Z]/,
    disposition: 'out-of-scope',
    reason: 'creature-record (cr-prefixed) NPC-side perk/effect',
  },
  // Cremator receiver variant plumbing: longevity duration perk + the
  // mutually-exclusive projectile-swap REM notes.
  {
    match: /perk Cremator_Longevity_Perk:|removes projectile override ProjectileCremator/,
    disposition: 'out-of-scope',
    reason: 'Cremator variant plumbing (duration QoL / REM bookkeeping note)',
  },
  // Auto-stim armor legendary rad-health gate — defense-side trigger.
  {
    match: /^mod_Legendary_(?:Armor|PowerArmor)1_LowHealthTriggersStimpak:/,
    disposition: 'out-of-scope',
    reason: 'auto-stimpak defense trigger; healing side',
  },
  // Bird Bones fall-speed gate on champagne brews — survival/movement.
  {
    match: /condition: HasSpell\(Mutation_BirdBones\)=0/,
    disposition: 'out-of-scope',
    reason: 'fall-speed interaction gate; movement side',
  },

  // ——— batch 6: drive-to-zero (2026-08-28; verdicts in esm-sync/NOTES.md) ———
  // Rusty Knuckles PA arm perk-chase tier gates — marker echoes of the
  // ENCH-modeled bleed DoT (ded3ad0/b9f52d9).
  {
    match: /perk PA_CommonArmPerk: condition: GetValue\(PA_RustyKnuckles_AV\)=(?:9|18)/,
    disposition: 'out-of-scope',
    reason: 'marker echo of the ENCH-modeled Rusty Knuckles bleed; per-arm tier gate only',
  },
  // Nitro Fortunate magazine tier gates on the shared granted perk — real
  // ammoFreeChance routes via EP-211 in resolveDirectEntryPointModifiers.
  {
    match: /perk mod_weapon_NitroFortunate: WornHasKeyword\(Nitro_(?:4|6)Mod\)=1/,
    disposition: 'out-of-scope',
    reason: 'magazine tier gate on shared Nitro Fortunate perk; ammoFreeChance routed via EP-211',
  },
  // Description/UI script MGEF carriers — modeled-elsewhere noise per the
  // archetype sweep (#88 elemental _Description rows are record-scoped above).
  {
    match:
      /MGEF (?:\w*(?:_Description|_Desc)\w*|\w*TextDummy\w*) archetype Script — needs override/,
    disposition: 'out-of-scope',
    reason: 'Pip-Boy/description UI script MGEF; real effect modeled elsewhere per archetype sweep',
  },
  // Script-archetype healing/QoL (Medic Pump, Stealth Boy script, medic legendary).
  {
    match:
      /MGEF (?:PowerArmor_MedicPumpEffect|PowerArmor_StealthScriptEffect|Legendary_MedicEffect) archetype Script — needs override/,
    disposition: 'out-of-scope',
    reason: 'PA auto-stim/stealth/heal script utility; engine models offense',
  },
  // Script-archetype chem/brew/survival utilities (Detect Life, Barter, Liquid
  // Courage, TickBlood regen, Firecracker burn-on-touch, Nuka-Cola caps).
  {
    match:
      /MGEF (?:DetectLifeApplyClientEffect|FortifyBarterChemEffect|LiquidCourageEffect|TickbloodTequila_(?:DiseaseChance|FoodRegen|HealthRegen)Effect|FirecrackerWhiskey_CastBurnOnTouch|NukaColaBottlecapAdder|AssaultronHeadSelfRadsEffect|DLC03_SteakPrawnText|E08A_GulperShine_ME|SCORE_Nukashine_Duration_SugarFree) archetype Script — needs override/,
    disposition: 'out-of-scope',
    reason: 'chem/brew/survival script utility; no player-offense component',
  },
  // Script-archetype economy/cosmetic (caps bobblehead, bounty pickpocket, mag UI).
  {
    match:
      /MGEF (?:BobbleHead_Caps_Effect|BOUNTY_PickPocketLegendaryEffect|Magazine_(?:Backwoodsman\d+|TumblersToday02)Effect) archetype Script — needs override/,
    disposition: 'out-of-scope',
    reason: 'economy/cosmetic/bounty script effect; no player-offense component',
  },
  // Script-archetype cosmetic/VFX/event (Chameleon audio, plasma crit VFX, V96
  // suppression barrel, Choo-Choo add-perk, Reflective VFX, mutation scripts).
  {
    match:
      /MGEF (?:ChameleonArmorAudioEffect|Generic_Weapon_CritPlasmaEffect|V96_1_SuppressionEffect_Weapon|Legendary_PowerArmor_ChooChooAddPerkEffect|Legendary_PowerArmor_ReflectiveApplyReflectVFXEffect|Mutation_(?:ElectricallyCharged|UnstableIsotope)(?:Super)?ScriptEffect|DamageBloatflyLarvaPoisonEffect_Contact|MTNS05_VoxMagicEffect) archetype Script — needs override/,
    disposition: 'out-of-scope',
    reason: 'cosmetic/VFX/event script effect; no modelable player-offense output',
  },
  // Zero-magnitude script-set defense/movement (AP regen legs, Elastic Servos,
  // Overeater's, Fierce's limb resist, Aegis team resists, Reflective proc).
  {
    match:
      /MGEF (?:AbFortifyActionPointRateHidden|RD01_PowerArmor_ElasticServosJumpEffect|Legendary_Armor_OvereaterAddValue|AbPerkFortifyLimbDamageResistance|AbFortifyActorSpeedMult|Legendary_PowerArmor_AegisApplyPlayer(?:CR|DR|ER|FR|PR)Effect|Legendary_PowerArmor_ReflectiveApplyRecievePerkEffect): zero magnitude, no curve — script\/scaled, needs override/,
    disposition: 'out-of-scope',
    reason: 'zero-magnitude script-set defense/movement effect; no modelable player-offense output',
  },
  // Miasma AcidCloak AV write — aura chase plumbing (ADR-0023 auraChase).
  {
    match: /ActorValues on AcidCloak — unmapped/,
    disposition: 'out-of-scope',
    reason: 'Miasma aura chase plumbing; poison aura modeled via auraChase',
  },
  // Executioner's granted-perk echo note (extract-omods ACTOR_VALUE_SKIP).
  {
    match: /carried by granted LegendaryExecutePerk/,
    disposition: 'out-of-scope',
    reason: 'marker echo of the Executioner granted-perk chase; threshold modeled there',
  },
  // Explosion-chain bookkeeping notes from omod-projectile-chase.ts.
  {
    match:
      /Base Weapon Damage Mult [\d.]+ — superseded by the EXPL's own direct damage above, not consumed/,
    disposition: 'out-of-scope',
    reason: 'informational EXPL chain note; direct damage already extracted above',
  },
  // Conductor's star-4 team AP/HP restore on crit — support buff.
  {
    match:
      /^mod_Legendary_Weapon4_Conductors:.*(?:Legendary_Weapon_ConductorsApplyRestore(?:PlayerAP|PlayerHealth)PerkEffect: timedBuff|GetLastHitCritical\(\)=1|perk Legendary_Weapon_ConductorsPlayerPerk:)/,
    disposition: 'out-of-scope',
    reason: "Conductor's team AP/HP restore on crit; support buff, not self-directed offense",
  },
  // Holy Fire team timed buff on friendly hit — support-side proc.
  {
    match: /perk HolyFire_Perk: FortifyDamage(?:All|Resist): timedBuff/,
    disposition: 'out-of-scope',
    reason:
      'Holy Fire team buff on friendly hit; support-side timed proc, not self-directed offense',
  },
  // Minty Breather heal-on-breathe perk gates.
  {
    match:
      /perk MintyBreather_Perk: condition: (?:HasKeyword\(ActorTypeTurret\)=0|IsBleedingOut\(\)=0)/,
    disposition: 'out-of-scope',
    reason: 'Minty Breather heal-on-breathe gates; healing side',
  },
  // Head Hunter on-kill nested-perk proc.
  {
    match: /^mod_Legendary_Weapon_Ranged4_HeadHunters:/,
    disposition: 'out-of-scope',
    reason: 'Head Hunter on-kill nested-perk proc; detection/utility, not modeled damage',
  },
  // Radioactive Powered PA legendary defensive gates.
  {
    match: /^mod_Legendary_PowerArmor4_RadioactivePowered: condition: GetValue(?:Percent)?\(/,
    disposition: 'out-of-scope',
    reason: 'Radioactive Powered defensive PA legendary gates; incoming-damage side',
  },
  // Commissioner Chaos ATX paint lights — cosmetic cloak FX.
  {
    match: /MGEF abPowerArmorCommissionerChaos_Lights(?:_Blue)? archetype Cloak — needs override/,
    disposition: 'out-of-scope',
    reason: 'Commissioner Chaos PA paint light cloak; cosmetic only',
  },
  // E09A Abomination launcher boss-stage gate — event NPC content.
  {
    match:
      /^E09A_AbominationPreventPrematureDeath: HasKeyword\(E09A_Launcher_BossFinalStageKeyword\)=/,
    disposition: 'out-of-scope',
    reason: 'E09A Abomination event boss stage gate; NPC/event content',
  },
  // Magazine/bobblehead _Potion rows — perk/MGEF plumbing echoes; offense lives
  // on consumables.json for ranks that matter (Grognak melee verified there).
  {
    match:
      /^(?:Magazine_(?:Backwoodsman|GrognakTheBarbarian|GunsAndBullets|AwesomeTales|LiveAndLove|ScoutsLife|TumblersToday|USCovertOps)\d+|BobbleHead_\w+|GHL_GlowingBobbleHead_\w+)_Potion:/,
    disposition: 'out-of-scope',
    reason:
      'magazine/bobblehead potion-side perk/MGEF plumbing; offense modeled on consumables.json where applicable',
  },
  // Bobblehead heavy-guns route echo (real rank modeled on consumables).
  {
    match: /route\(STAT_DmgHeavyGuns\): OR-group/,
    disposition: 'out-of-scope',
    reason: 'heavy-guns bobblehead route echo; damage modeled on consumables.json',
  },
  // Diet-mutation food/veg perk plumbing — modeled via diet-mutations.ts.
  {
    match: /^Mutation_(?:Carnivore|Herbivore|SpeedDemon): perk (?:Mutation_|GHL_Mutation_)/,
    disposition: 'out-of-scope',
    reason: 'diet-mutation food-buff plumbing; modeled via diet-mutations.ts',
  },
  // Voice of Set description-mod notes (robot shock proc + Eye of Ra upgrade).
  {
    match: /^mod_Description_MoM_VoiceofSet:/,
    disposition: 'out-of-scope',
    reason:
      'Voice of Set description-mod chase notes; base +20% modeled, Eye of Ra gated on armor loadout',
  },
  // Penetrating / Nitro VATS pierce-through visibility notes (not armorPen).
  {
    match: /Mod VATS Penetration Min Visibility — VATS pierce-through visibility/,
    disposition: 'out-of-scope',
    reason: 'VATS pierce-through visibility entry point; not armorPen (docs/assumptions.md)',
  },
  // Chameleon/Nocturnal invisibility gates, bleedout gates, gun-state gates.
  {
    match: /condition: (?:GetValue\(Invisibility\)=0|IsBleedingOut\(\)=0|GetActorGunState\(\)=4)/,
    disposition: 'out-of-scope',
    reason: 'stealth/bleedout/aim-state utility gate; no player-offense component',
  },
  // PA Strength placeholder paint AV gate.
  {
    match: /condition: GetValue\(PA_Strength_AV\)=6/,
    disposition: 'out-of-scope',
    reason: 'PA paint placeholder strength-counter gate; cosmetic plumbing',
  },
  // Minty Breather / medic legendary turret exclusion (healing side).
  {
    match: /perk Legendary_Weapon_MedicPerk: HasKeyword\(ActorTypeTurret\)=0/,
    disposition: 'out-of-scope',
    reason: 'medic heal perk turret exclusion; healing side',
  },
  // Life Saver auto-revive icon gate.
  {
    match: /perk LifeSaverPerk: HasKeyword\(Icon_LifeSaver\)=1/,
    disposition: 'out-of-scope',
    reason: 'Life Saver auto-revive trigger; defense/healing side',
  },
  // Increase-healing armor legendary chem gates.
  {
    match: /perk LegendaryIncreaseHealingPerk: OR-group/,
    disposition: 'out-of-scope',
    reason: 'increase-healing armor legendary chem gates; healing side',
  },
  // Waterbreathing armor legendary in-water gate.
  {
    match: /condition: IsInWater\(\)=1/,
    disposition: 'out-of-scope',
    reason: 'waterbreathing armor legendary in-water gate; survival utility',
  },
  // RD01 Reflection melee-on-hit retaliation gate — #88 family.
  {
    match: /^RD01_Mod_PowerArmor_EnclaveVulcan_Torso_Misc_Reflection:/,
    disposition: 'deferred-with-issue',
    issue: '#88',
    reason:
      'RD01 Reflection on-hit-taken melee proc; retaliation family deferred pending hits-taken model',
  },
  // Unmeasured script-set abFortifyDamageAll (Rage unique, etc.).
  {
    match:
      /abFortifyDamage(?:All|Recieved): unmeasured script-set damage bonus — needs in-game measurement/,
    disposition: 'out-of-scope',
    reason: 'unmeasured script-set timed damage bonus; no ESM-derivable magnitude',
  },
  // Nailer block-triggered sustain — not powerAttackBonus (docs/assumptions.md).
  {
    match: /perk NailerPerk: Mod Power Attack Damage Select Spell — block-triggered sustain buff/,
    disposition: 'out-of-scope',
    reason: 'Nailer block-triggered sustain buff; not a powerAttackBonus contributor',
  },
  // Self-targeted damage note (Xerxo's etc.).
  {
    match: /self-targeted damage \(hits the wielder, not enemies\) — note-only/,
    disposition: 'out-of-scope',
    reason: 'self-targeted damage note; hits the wielder, not enemies',
  },
  // Unstoppable Monster incoming-damage mult skip (self-targeted EP36).
  {
    match: /entry point Mod Incoming Weapon Damage uses Multiply 1 \+ Actor Value Mult — skipped/,
    disposition: 'out-of-scope',
    reason: 'self-targeted incoming-damage EP; engine models player offense only',
  },
  // Circuit Breaker explosion chase dead-end.
  {
    match: /CircuitBreakerEffect_Explosion: Explosion 0x006E20EB chased — no direct damage/,
    disposition: 'out-of-scope',
    reason: 'Circuit Breaker explosion chain dead-end; no extractable direct damage',
  },
  // On-kill spell with damage but no proc trigger (Ice Breaker SCORE mod).
  {
    match:
      /Apply On Kill Spell — Function-Type-5 chase produced damage but no proc-trigger classification, dropped/,
    disposition: 'out-of-scope',
    reason: 'on-kill spell chase without a classified proc trigger; dropped intentionally',
  },
  // Nested-perk grant target-redirect risk (Debuff Damage, etc.).
  {
    match: /grants a nested perk — target-redirect risk/,
    disposition: 'out-of-scope',
    reason: 'nested-perk grant with target-redirect risk; chase intentionally dropped',
  },
  // Cremator/Shishkebab enchantment REM bookkeeping.
  {
    match: /removes enchantment (?:CrematorFXEnchFireHit|ShishkebabBleedFireDOT)/,
    disposition: 'out-of-scope',
    reason: 'variant enchantment REM bookkeeping note',
  },
  // DoT curve unmapped input AV null (NPC/creature weapons, FX visuals).
  {
    match: /DoT curve with unmapped input AV null — needs override/,
    disposition: 'out-of-scope',
    reason: 'DoT curve with null input AV; script-driven or NPC-side carrier',
  },
  // PABatteryDrainEffect curve (Pulse plasma receivers).
  {
    match: /PABatteryDrainEffect: curve with unmapped input AV null — needs override/,
    disposition: 'out-of-scope',
    reason: 'Pulse receiver battery-drain curve; ammo-economy side',
  },
  // Tanky's unmapped curve input (piece-count scaling already via wornPieces elsewhere).
  {
    match:
      /Legendary_Armor_TankyApplyPerkModDamageEffect: curve with unmapped input AV 0x007B956A — needs override/,
    disposition: 'out-of-scope',
    reason: "Tanky's piece-count curve plumbing; per-piece scaling via wornPieces elsewhere",
  },
  // Stand Fast / Last Stand unmapped curves and incoming-damage EP.
  {
    match: /^mod_Custom_(?:StandFast|LastStand):/,
    disposition: 'out-of-scope',
    reason: 'unique armor defensive curve/incoming-damage plumbing; EHP side',
  },
  // AttackDamage SET unhandled shapes (Thirst Zapper water mag, Vox barrel).
  {
    match: /AttackDamage SET with value \d+ — unhandled/,
    disposition: 'out-of-scope',
    reason: 'AttackDamage SET placeholder on utility/NPC weapon mod; not a damage contributor',
  },
  // Thirst Zapper infinite-water EP (scope-pinned; see normalize.test.ts).
  {
    match: /perk ThirstZapper_WaterInfiniteAmmoPerk: entry point Mod Ammo Used Count — not modeled/,
    disposition: 'out-of-scope',
    reason: 'Thirst Zapper infinite-water EP scope-pinned; not a general free-ammo route',
  },
  // Basher / Reflect Damage outgoing limb bash EP — bash NYI.
  {
    match: /entry point Mod Outgoing Limb Bash Damage — not modeled/,
    disposition: 'out-of-scope',
    reason: 'limb bash damage entry point; bash mechanic not modeled',
  },
  // Twisted Muscles / Stabilized Bracers cone-of-fire EP — accuracy QoL.
  {
    match: /entry point Mod Cone-of-fire Mult — not modeled/,
    disposition: 'out-of-scope',
    reason: 'cone-of-fire accuracy entry point; accuracy QoL',
  },
  // Chem/bubblegum spell-magnitude and alchemy-keyword gates.
  {
    match:
      /perk (?:PerkBubblegumSlowHungerThirstPerk|Magazine_Backwoodsman(?:06|07|08)Perk|FirecrackerWhiskeyBurnEnemies|WST_Backpack_(?:Relief|Pillager)_Perk|W05_mod_BackPack_Effect_Relief): (?:OR-group|EPAlchemyEffectHasKeyword|EPMagic_SpellHasKeyword|HasKeyword\(ObjectType)/,
    disposition: 'out-of-scope',
    reason: 'chem/brew/backpack alchemy-keyword or spell-magnitude gate; survival/QoL side',
  },
  {
    match: /: entry point Mod Spell Magnitude — not modeled/,
    disposition: 'out-of-scope',
    reason: 'spell-magnitude entry point on chem/consumable plumbing; survival/QoL side',
  },
  // Remaining unknown entry points: damage-relevant shortlist still pending
  // implementation (Gun Fu splash/blitz siblings already routed elsewhere).
  {
    match:
      /^unknown entry point: (?:Mod VATS Blitz (?:Dmg Bonus Dist|Max Distance)|Set VATS Blitz Max Dmg Mult|Mod VATS Splash Damage(?: Radius)?|Mod Attack Damage On Striking Appendage|Mod Typed Weapon Attack Damage|Mod Projectile Bounce Count|Apply Combat Melee Spell|Apply Combat Hit Spell(?: Taken)?|Apply Spell On Actor When Limb Crippled|Mod Power Attack Action Points|Mod Bashing Damage|Mod Chain Damage Falloff)$/,
    disposition: 'resolve-pending',
    reason: 'damage-relevant entry point identified in esm-sync sweep; pending engine wiring',
  },
  {
    match: /^unknown entry point: Apply On Kill Spell$/,
    disposition: 'out-of-scope',
    reason:
      'on-kill spell entry point without classified proc trigger; utility/NPC carriers dominate',
  },
  {
    match: /^unknown entry point: Mod Ammo Used Count$/,
    disposition: 'out-of-scope',
    reason:
      'Mod Ammo Used Count EP reserved for GetRandomPercent-gated shapes only; other carriers scope-pinned',
  },
  // Sibling phrasing for unknown EPs on granted-perk chase rows.
  {
    match:
      /: entry point (?:Mod VATS Blitz (?:Dmg Bonus Dist|Max Distance)|Set VATS Blitz Max Dmg Mult|Mod VATS Splash Damage(?: Radius)?|Mod Attack Damage On Striking Appendage|Mod Typed Weapon Attack Damage|Mod Projectile Bounce Count|Mod Power Attack Action Points|Mod Bashing Damage|Mod Chain Damage Falloff) — not modeled/,
    disposition: 'resolve-pending',
    reason: 'damage-relevant entry point via OMOD-grant chase; pending engine wiring',
  },
  {
    match: /: entry point Mod VATS Player AP On Kill Chance — not modeled/,
    disposition: 'deferred-with-issue',
    issue: '#89',
    reason: 'AP-refund-on-kill entry point; deferred pending enemy TTK modeling',
  },
  // Combo Breaker GetRandomPercent gates → #89 AP-economy family.
  {
    match: /perk Legendary_Weapon_ComboBreakerPerk: GetRandomPercent\(\)=/,
    disposition: 'deferred-with-issue',
    issue: '#89',
    reason: 'Combo Breaker AP-refund proc chance; deferred pending enemy TTK modeling',
  },
  // GetRandomPercent singletons walked in sweep (cloak-on-hit, pickpocket bounty, plasma crit VFX tier).
  {
    match: /GetRandomPercent\(\)=0x(?:006C1FA5|0079A3C8|007AD489)/,
    disposition: 'out-of-scope',
    reason:
      'GetRandomPercent gate on stealth/cosmetic/bounty script proc; not a modeled damage proc',
  },
  {
    match: /condition: GetRandomPercent\(\)=70/,
    disposition: 'out-of-scope',
    reason: 'GetRandomPercent gate on plasma crit VFX script effect; cosmetic rider',
  },
  {
    match: /GetRandomPercent\(\)=50/,
    disposition: 'out-of-scope',
    reason: 'GetRandomPercent gate on bounty pickpocket cosmetic proc',
  },
  // Unmapped sneak buff AVIFs (detection QoL).
  {
    match: /^unmapped buff AVIF: STAT_Sneak(?:Light|Sound)?$/,
    disposition: 'out-of-scope',
    reason: 'sneak/detection buff AVIF; accuracy/stealth QoL',
  },
  // Unknown OMOD property from template members.
  {
    match: /^unknown OMOD property: Damage Type Value$/,
    disposition: 'out-of-scope',
    reason: 'unnamed template-member property; informational extractor note',
  },
  // LGN Nuclear Proliferator card wiring gap.
  {
    match: /^unresolved perk card: LGN_NuclearProliferator_Card:/,
    disposition: 'resolve-pending',
    reason: 'LGN Nuclear Proliferator card has no matched extracted perk family yet',
  },
  // NPC epic-rank wiring note.
  {
    match: /^npcs: WendigoColossusRace epic-rank quest/,
    disposition: 'out-of-scope',
    reason: 'NPC epic-rank quest wiring note; creature-side content',
  },
  // PainTrain / heavy-gun STAT_DamagePerk route echoes.
  {
    match:
      /^STAT_DamagePerk: (?:GetIsID\(PainTrainWeapon\)=1|OR-group\[HasKeyword\(WeaponTypeExplosiveHybrid\))/,
    disposition: 'out-of-scope',
    reason: 'PainTrain pseudo-weapon or heavy-gun route echo; not player build state',
  },
  // ShotgunnerExpert unresolved rank AV (companion/content gate).
  {
    match: /GetValue\(<unresolved:0x00000398>\)/,
    disposition: 'out-of-scope',
    reason: 'unresolved companion/rank AV gate on ShotgunnerExpert; not a damage gap',
  },
  // Kinetic Lining on-damage-taken AP restore (RD01 paint uses non-standard id prefix).
  {
    match:
      /perk ModKineticLiningPerk: restores AP by 20% of damage taken — on-damage-taken resource mechanic, not modeled \(issue #89\)/,
    disposition: 'deferred-with-issue',
    issue: '#89',
    reason: 'on-damage-taken AP restore; deferred pending hits-taken modeling',
  },
  // Glutton ghoul-description script carrier (Description suffix without underscore).
  {
    match: /MGEF Legendary_Armor_GluttonAddPerkGhoulDescription archetype Script — needs override/,
    disposition: 'out-of-scope',
    reason: 'Glutton carry-weight food-buff description script; economy/survival side',
  },
  // Electricians no-reload weapon gate.
  {
    match: /condition: WornHasKeyword\(WeaponNoReload\)=1/,
    disposition: 'out-of-scope',
    reason: 'Electricians no-reload weapon gate; utility condition',
  },
  // Mutation Healing Factor chem-filter gates.
  {
    match: /^Mutation_HealingFactor: perk Mutation_ReduceChemEffect_Perk: OR-group/,
    disposition: 'out-of-scope',
    reason: 'Healing Factor chem-filter perk plumbing; healing/survival side',
  },
  // Love Tap bash-triggered timed buff — real offense pending bash uptime wiring.
  {
    match: /perk LoveTapPerk: FortifyDamageAll: bash-triggered timedBuff/,
    disposition: 'resolve-pending',
    reason: 'Love Tap bash-triggered damage buff; pending onBashBuffUptime wiring (issue #80)',
  },
  // Lickety-Split identity keyword gate (bounce count EP is resolve-pending above).
  {
    match: /perk RD01_Weapon_LicketySplit: HasKeyword\(RD01_CustomItemName_LicketySplit\)=1/,
    disposition: 'resolve-pending',
    reason: 'Lickety-Split unique identity gate; sibling of Mod Projectile Bounce Count EP',
  },
  // Stale meta lines for EPs now in resolveDirectEntryPointModifiers or classified above.
  {
    match: /^unknown entry point: Mod Add Bullet To Clip Chance$/,
    disposition: 'out-of-scope',
    reason:
      'EP-211 routed to ammoFreeChance in resolveDirectEntryPointModifiers; stale until re-extract',
  },
  {
    match: /^unknown entry point: Mod Outgoing Limb Bash Damage$/,
    disposition: 'out-of-scope',
    reason: 'limb bash damage entry point; bash mechanic not modeled',
  },
  {
    match: /^unknown entry point: Mod Spell (?:Duration|Magnitude)$/,
    disposition: 'out-of-scope',
    reason: 'spell duration/magnitude entry point on chem/consumable plumbing; survival/QoL side',
  },
  {
    match: /^unknown entry point: Mod VATS Player AP On Kill Chance$/,
    disposition: 'deferred-with-issue',
    issue: '#89',
    reason: 'AP-refund-on-kill entry point; deferred pending enemy TTK modeling',
  },
  {
    match:
      /perk mod_weapon_NitroFortunate: entry point Mod Add Bullet To Clip Chance — not modeled/,
    disposition: 'out-of-scope',
    reason:
      'EP-211 routed to ammoFreeChance in resolveDirectEntryPointModifiers; stale until re-extract',
  },
  // ATX backpack junk filter — crafting/economy.
  {
    match: /perk ATX_Backpack_ScrapRat_Perk: IsJunkItem\(\)=1/,
    disposition: 'out-of-scope',
    reason: 'ATX scrap-rat backpack junk filter; crafting/economy side',
  },
  // Currency test perk — cut/test content.
  {
    match: /^CurrencyTestPerk:/,
    disposition: 'out-of-scope',
    reason: 'currency test perk; cut/test content',
  },
  // CZ reduce-damage event instance gates.
  {
    match: /^CZ_ReduceDamage:/,
    disposition: 'out-of-scope',
    reason: 'CZ event instance damage gate; event content',
  },
  // Scavenger magazine weapon-type OR gate on perk chase.
  {
    match: /^DLC04_PerkMagPerkScav: OR-group/,
    disposition: 'out-of-scope',
    reason: 'Scavenger magazine weapon-type gate; economy/crafting side',
  },
  // Gulpershine event buff active-effect gate.
  {
    match: /condition: HasActiveMagicEffect\(E08A_GulperSmacker_GulpershineBuff_ME\) Equal To 1/,
    disposition: 'out-of-scope',
    reason: 'Gulpershine event buff gate; event content',
  },
  // Fog crawler meat weather gate — survival food.
  {
    match: /^FogCrawlerMeatCooked: condition: OR-group\[IsInWeather/,
    disposition: 'out-of-scope',
    reason: 'Fog crawler meat weather gate; survival food side',
  },
  // Ghoul feral survival perk AV gate.
  {
    match: /^GHL_SURV_FeralPerk: GetValue\(GHL_SURV_Feral\)=/,
    disposition: 'out-of-scope',
    reason: 'ghoul-feral survival perk gate; survival side',
  },
  // Bully legendary limb-damage multiplier gate — limb QoL.
  {
    match: /^Legendary_Weapon_BullyPerk: GetLastHitLimbDamageMultiplier\(\)=1/,
    disposition: 'out-of-scope',
    reason: 'Bully limb-damage multiplier gate; limb QoL',
  },
  // Tesla Science 4 ammo-health OR-shape (ArmorTypePower branch unrepresentable).
  {
    match: /^Magazine_TeslaScience04(?:Perk|_Potion):/,
    disposition: 'out-of-scope',
    reason:
      'Tesla Science 4 ammo-health OR-gate; ArmorTypePower branch unrepresentable (modifiers.ts)',
  },
  // U.S. Covert Ops 8 knife/unarmed OR gate echo (dbm modeled on consumables.json).
  {
    match: /^Magazine_USCovertOps08(?:Perk|_Potion):/,
    disposition: 'out-of-scope',
    reason: 'Covert Ops 8 knife/unarmed OR-gate echo; dbm modeled on consumables.json',
  },
  // Live & Love companion-gated extra-damage perk.
  {
    match: /^PerkMagLiveNLoveExtraDmg: GetInFaction\(CurrentCompanionFaction\)=1/,
    disposition: 'out-of-scope',
    reason: 'Live & Love companion-gated perk; social/companion content',
  },
  // Empath team mutation strength gates.
  {
    match: /^PlayerTeamPerk: GetValue\(MutationEmpathStrength\)=/,
    disposition: 'out-of-scope',
    reason: 'Empath team mutation strength gate; team/social side',
  },
  // RD01 enc prevent-limb-damage event keyword.
  {
    match: /^RD01_Enc01_PreventLimbDamage_Perk: HasKeyword\(RD01_Enc01_DamageState_Keyword\)=0/,
    disposition: 'out-of-scope',
    reason: 'RD01 enc event limb-damage gate; event content',
  },
  // Wrecking Ball workshop turret gate.
  {
    match: /^WreckingBall: OR-group/,
    disposition: 'out-of-scope',
    reason: 'Wrecking Ball workshop turret gate; social/workshop content',
  },
  // Heavyweight incoming-damage curve — EHP side.
  {
    match:
      /^mod_Legendary_Armor1_Heavyweight: perk Legendary_Armor_Heavyweight: entry point Mod Incoming Weapon Damage/,
    disposition: 'out-of-scope',
    reason: 'Heavyweight incoming-damage reduction; EHP side',
  },
  // Durability weapon-type gate on item-condition legendary.
  {
    match:
      /^mod_Legendary_Weapon3_Durability: perk Legendary_Durability_Weapons: HasKeyword\(ObjectTypeWeapon\)=1/,
    disposition: 'out-of-scope',
    reason: 'Durability weapon-type gate; item-condition side',
  },
  // V96 Flatwoods boss suppression barrel event keyword gate.
  {
    match:
      /^mod_PipeSyringer_Barrel_V96_1_Suppression_(?:I|II|III): condition: HasKeyword\(V96_1_Atrium_FlatwoodsBossKeyword\)=0/,
    disposition: 'out-of-scope',
    reason: 'V96 event boss suppression barrel gate; event content',
  },
  // Nitro Fortunate tier gates, perk-side echo: the shared perk's 4Mod/6Mod
  // WornHasKeyword rows are resolved PER CARRIER on the OMOD side (self-worn
  // keyword post-process, extract-omods.ts 2026-08-28); the perk-family
  // extraction cannot know the tier and correctly leaves them gated.
  {
    match: /^mod_weapon_NitroFortunate: WornHasKeyword\(Nitro_\dMod\)=1$/,
    disposition: 'out-of-scope',
    reason:
      'tier gate resolved per-carrier on the OMOD side; perk-family row is the unresolvable shared source',
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
