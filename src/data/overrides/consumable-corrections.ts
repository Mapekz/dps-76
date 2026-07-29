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
