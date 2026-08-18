/**
 * Hand-maintained consumable corrections layered over ESM-generated data.
 * This file survives regeneration (`bun run extract`). Every entry should
 * carry a source comment (in-game test, wiki, community).
 */

/**
 * Generated consumables to hide from pickers: records that pass extraction
 * and obtainability but are wrong anyway (mirrors hiddenOmodIds).
 *
 * `GHL_Glowing*` bobbleheads (2026-07-13): ghoul-mode duplicate ALCH records
 * of the 13 normal bobbleheads, carrying the identical extracted modifier
 * (verified live — e.g. `GHL_GlowingBobbleHead_SmallGuns_Potion` and
 * `BobbleHead_SmallGuns_Potion` both resolve to the same +20% ballistic dbm).
 * Since they're mechanically indistinguishable from the base item, showing
 * both in the picker is pure clutter — hide the glowing twin, keep the base.
 */
export const hiddenConsumableIds: ReadonlySet<string> = new Set<string>([
  'GHL_GlowingBobblehead_Agility_Potion',
  'GHL_GlowingBobbleHead_BigGuns_Potion',
  'GHL_GlowingBobbleHead_Charisma_Potion',
  'GHL_GlowingBobbleHead_Endurance_Potion',
  'GHL_GlowingBobbleHead_EnergyWeapons_Potion',
  'GHL_GlowingBobbleHead_Explosives_Potion',
  'GHL_GlowingBobbleHead_Intelligence_Potion',
  'GHL_GlowingBobbleHead_Luck_Potion',
  'GHL_GlowingBobbleHead_Melee_Potion',
  'GHL_GlowingBobbleHead_Perception_Potion',
  'GHL_GlowingBobbleHead_SmallGuns_Potion',
  'GHL_GlowingBobbleHead_Strength_Potion',
  'GHL_GlowingBobbleHead_Unarmed_Potion',
  'GHL_GlowingBobbleHead_Medicine_Potion', // was missing — leaked into the picker
  'GHL_GlowingBobbleHead_Caps_Potion',
  'GHL_GlowingBobbleHead_Repair_Potion',
  'GHL_GlowingBobbleHead_Science_Potion',
  'GHL_GlowingBobbleHead_Sneak_Potion',
  'GHL_GlowingBobbleHead_LockPicking_Potion',
  'GHL_GlowingBobbleHead_Leader_Potion',

  // Nuclear Don's Custom Chem Blend (2026-07-14): quest item from "The Ol'
  // Weston Shuffle" (W05_MQR_203P) — found in Nuclear Don's locker, meant to
  // be stolen and used mid-arena-fight. Per the Fallout Wiki it's stripped
  // from inventory on quest completion if unconsumed; the ESM's VMAD data
  // (script property bindings only, no decompiled Papyrus bytecode) can't
  // surface that removal itself. Not a persistent chem a build can rely on.
  'W05_MQR_203P_ChemBlend',

  // Cannery-canned foods (2026-07-21): ALCH records carrying the
  // MealTypeCanned_Cannery keyword re-craft an existing food at a Cannery for
  // shelf-stability only — verified identical modifiers/category/addiction to
  // their base ALCH record for all 13 (same precedent as the GHL_Glowing
  // bobbleheads above). Rudy's Canned Pozole (Moon_Rudy_Pozole) is NOT one of
  // these — "Canned" is part of its actual name, no Cannery keyword, no base
  // counterpart — so it stays.
  'MirelurkQueenMeatTasty_Cannery', // Canned Aged Mirelurk Queen Steak → Aged Mirelurk Queen Steak
  'OpossumMeatCooked_Cannery', // Canned Awesome Opossum Bacon → Awesome Opossum Bacon
  'SCORE_S25_BlightVegetableCookedSoup_Cannery_G2', // Canned Blight Soup → Blight Soup
  'SCORE_25_BrainBombsGourmet_Cannery_G1', // Canned Brain Bombs → Brain Bombs
  'SCORE_25_ScorchBeastMeatBrainCooked_Cannery_G1', // Canned Broiled Scorchbeast Brain → Broiled Scorchbeast Brain
  'CornVegetableCookedSoup_Cannery', // Canned Corn Soup → Corn Soup
  'SCORE_S25_DeathclawMeatTastySouffle_Cannery_G2', // Canned Deathclaw Wellington → Deathclaw Wellington
  'GourdVegetableCookedSoup_Cannery', // Canned Gourd Soup → Gourd Soup
  'MegaSlothMushroomVegetableCookedSoup_Cannery', // Canned Megasloth Mushroom Soup → Megasloth Mushroom Soup
  'MirelurkQueenMeatCooked_Cannery', // Canned Mirelurk Queen Steak → Mirelurk Queen Steak
  'AnglerMeatCooked_Cannery', // Canned Poached Angler → Poached Angler
  'StingwingMeatTastyStew_Cannery', // Canned Stingwing Stew → Stingwing Stew
  'SCORE_25_MeatWeek_TatoSaladCooked_Cannery_G1', // Canned Tato Salad → Tato Salad
]);
/**
 * Consumable counterpart of forceVisibleWeaponIds/forceVisibleOmodIds
 * (rescues obtainable:false records). Review `_meta.json →
 * excludedDetailed.consumableUnobtainable` after each extraction and rescue
 * false negatives here — no re-extract needed.
 */
/**
 * Hand-polished replacements for the ESM-derived fallback `description` on
 * bobbleheads/magazines (extract-buffs.ts's three-tier derivation). Display
 * text only — shown in the picker when no effect line can be synthesized
 * from the Modifier IR; never read by the engine. Applied at the dataset
 * merge (`applyDescriptionOverride`); stale/no-op keys are reported by
 * `getUnresolvedOverrideKeys`.
 *
 * House style (2026-08-18, user-directed cleanup): lead with the signed
 * magnitude when one exists; Title Case only for in-game stat/item names
 * (Heal Rate, Poison Resist, Carry Weight, Fusion Core, Stealth Boy, VATS,
 * AP, XP); everything else lowercase prose; multiple effects joined by "; ";
 * no trailing period. Percent readings for bare "+NN" magnitudes were
 * verified against their AVs: STAT_* AVs (STAT_XPMult, STAT_SprintAPCost,
 * STAT_ItemDegradation, STAT_StealthBoyDuration) and the disease-chance
 * effects are percent mults (Backwoodsman 7's own ESM template spells out
 * "-<mag>% food/drink disease chance").
 */
export const consumableDescriptionOverrides: Readonly<Record<string, string>> = {
  // ── Bobbleheads ────────────────────────────────────────────────────────
  // Bobblehead_CapsPerk description: "Double likelihood to get a better
  // caps stash" — no flat %, it doubles the better-stash roll.
  BobbleHead_Caps_Potion: '2x chance of a better caps stash',
  // Bobblehead_FortifyXPBonus_Effect: AV STAT_XPMult, magnitude 5 (percent
  // mult — user-confirmed +5% into the XP bonus multiplier).
  BobbleHead_Leader_Potion: '+5% XP',
  // MGEF template "<+MAG> LOCKPICK SWEETSPOT" de-shouted. STAT_Lockpicking
  // is the minigame sweet-spot AV (NOT the STAT_LockpickingTier curve input).
  BobbleHead_LockPicking_Potion: '+30 lockpick sweet spot',
  // Both ALCH effects make the same 30% claim: Bobblehead_RepairPerk
  // ("Fusion cores last 30% longer", Mod Ammo Health Mult gated on gatling
  // lasers) + Bobblehead_ReducePABatteryDamageRate_Effect (PABatteryDamageRate
  // 0.3 = 30% slower PA core drain). One line covers both.
  BobbleHead_Repair_Potion: '+30% Fusion Core duration',
  BobbleHead_Science_Potion: '+1 hacking guess',
  // Bobblehead_FortifySneak_Effect: Peak Value Modifier on STAT_Sneak — only
  // matters while sneaking, unlike Grognak 2's detection entry points below.
  BobbleHead_Sneak_Potion: '+30% harder to detect while sneaking',

  // ── Astoundingly Awesome Tales ─────────────────────────────────────────
  // Magazine_FortifyHealRate_Effect +1 gated on IsSwimming, plus
  // Magazine_FortifyWaterBreathing.
  Magazine_AwesomeTales03_Potion: '+1 Heal Rate while swimming; breathe underwater',
  Magazine_AwesomeTales06_Potion: '+0.2 Heal Rate',
  Magazine_AwesomeTales09_Potion: '+15 Poison Resist',
  Magazine_AwesomeTales12_Potion: '-30% disease chance',
  Magazine_AwesomeTales13_Potion: '+30% RadAway effectiveness',

  // ── Backwoodsman ───────────────────────────────────────────────────────
  Magazine_Backwoodsman01_Potion: 'Find more meat on animal kills',
  // NOTE: series numbering ≠ edid numbering (Backwoodsman 2 is edid *07).
  Magazine_Backwoodsman07_Potion: '-50% disease chance from food and drink',
  // Magazine_Backwoodsman03Perk: "Crafting weapons now costs fewer materials."
  Magazine_Backwoodsman03_Potion: 'Crafting weapons costs fewer materials',
  // Template "+<mag>% to Gain Double Yield From Plants" reads its magnitude
  // from GLOB Backwoodsman04_Chance_Global = 50 (the ALCH slot itself is 0,
  // which is why the raw derivation rendered "+0%").
  Magazine_Backwoodsman04_Potion: '+50% chance of double yield when harvesting plants',
  Magazine_Backwoodsman06_Potion: '+50% healing from cooked food',
  Magazine_Backwoodsman08_Potion: '+30% hunger and thirst restored by food and drink',
  Magazine_Backwoodsman09_Potion: '-50% Workshop repair costs',
  Magazine_Backwoodsman10_Potion: '+50% Workshop turret damage',

  // ── Grognak the Barbarian ──────────────────────────────────────────────
  // Magazine_GrognakTheBarbarian02Perk: detection entry points (47/48) —
  // always on, no sneaking clause (contrast the Sneak bobblehead above).
  Magazine_GrognakTheBarbarian02_Potion: '20% harder to detect',
  Magazine_GrognakTheBarbarian03_Potion: '+25 Poison Resist',
  Magazine_GrognakTheBarbarian06_Potion: '-75% melee weapon weight',
  Magazine_GrognakTheBarbarian07_Potion: '-50% melee weapon condition loss',
  Magazine_GrognakTheBarbarian08_Potion: '+25 Cryo Resist',
  Magazine_GrognakTheBarbarian09_Potion: '+25 Carry Weight',

  // ── Guns and Bullets ───────────────────────────────────────────────────
  // Magazine_GunsAndBullets05Perk: "+50% Components From Scrapped Weapons".
  Magazine_GunsAndBullets05_Potion: '+50% components from scrapped weapons',

  // ── Live & Love ────────────────────────────────────────────────────────
  Magazine_LiveAndLove03_Potion: '+50% healing from fruits and vegetables',
  // Magazine_LiveAndLove08Effect: AV STAT_XPMult +5 gated on
  // IsMemberOfAPlayerTeam — same wording the extractor's teammates
  // condition renders for the other Live & Love issues.
  Magazine_LiveAndLove08_Potion: '+5% XP (with 1+ teammates)',

  // ── Scouts' Life ───────────────────────────────────────────────────────
  // Magazine_FortifyResistRadIngestion_Effect +30 (rad-resist points against
  // ingested rads — not a percent AV, so no % here).
  Magazine_ScoutsLife01_Potion: '+30 Rad Resist against radiation from food and drink',
  Magazine_ScoutsLife03_Potion: '-10% weight of all items',
  Magazine_ScoutsLife04_Potion: '+100% bleedout time',
  Magazine_ScoutsLife05_Potion: '-80% disease chance from combat',
  Magazine_ScoutsLife06_Potion: '-30% hunger and thirst gain',
  Magazine_ScoutsLife08_Potion: '-20% sprint AP cost',
  Magazine_ScoutsLife09_Potion: '+25 Fire Resist',
  Magazine_ScoutsLife10_Potion: '-30% item condition loss',

  // ── Tesla Science ──────────────────────────────────────────────────────
  Magazine_TeslaScience04_Potion: '+15% Fusion Core duration',
  // Magazine_FortifyResistRadExposure_Effect +100 — the visible Rad Resist
  // stat (environmental rads).
  Magazine_TeslaScience06_Potion: '+100 Rad Resist',

  // ── Tumblers Today ─────────────────────────────────────────────────────
  // Issues 1 and 5 carry the identical Magazine_FortifyLockpicking_Effect
  // (+20 STAT_Lockpicking) — same text on purpose.
  Magazine_TumblersToday01_Potion: '+20 lockpick sweet spot',
  Magazine_TumblersToday02_Potion: 'Find extra bobby pins in bobby pin boxes',
  Magazine_TumblersToday03_Potion: 'Pick locks 1 tier higher',
  Magazine_TumblersToday04_Potion: 'Bobby pins are unbreakable',
  Magazine_TumblersToday05_Potion: '+20 lockpick sweet spot',

  // ── U.S. Covert Operations Manual ──────────────────────────────────────
  Magazine_USCovertOps02_Potion: '50% harder to detect in full light',
  Magazine_USCovertOps06_Potion: '-50% noise while sneaking',
  Magazine_USCovertOps07_Potion: '-50% enemy player VATS accuracy',
  Magazine_USCovertOps09_Potion: '+50% Stealth Boy duration',
};

export const forceVisibleConsumableIds: ReadonlySet<string> = new Set<string>([
  // 2026-07-14 audit of excludedDetailed.consumableUnobtainable. The RESO
  // (CAMP resource generator), craftable-ACTI and ALCH ferment/age routes are
  // now derived by scripts/extract/obtainability.ts, so the camp-machine foods,
  // the Sunset Sarsaparillas and Vintage Mire Magic Moonshine no longer need
  // rescuing. These two remain script-granted, with no record-level reverse
  // reference the derivation could ever see:
  //
  // Milked from Chally the Moo-Moo: MGEF abBrahminRaceEffect runs
  // Creatures:BrahminRaceMilkingScript, whose `ChallyMilk` property points at
  // this ALCH, gated on the unique NPC's ChallyKeyword. Verified 2026-07-14.
  'Milk_Chally',
  // Spawned by EXPL Storm_SE09_ChickenExplosion via its *Placed Object* field
  // (quest Storm_SE09, "Storm Encounter: Roast Chicken"). Following EXPL
  // referencers in general would let every creature death-explosion through, so
  // this one stays a hand-rescue. Verified 2026-07-14.
  'Storm_SE09_ChickenMeatCooked',
]);
