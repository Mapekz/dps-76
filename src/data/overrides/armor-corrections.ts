/**
 * Hand-maintained armor-OMOD corrections layered over ESM-generated data.
 * This file survives regeneration (`pnpm extract`). Every entry should
 * carry a source comment (in-game test, wiki, community).
 */

/**
 * Armor-OMOD ids hidden from the Armor checklist (src/data/armor-
 * modifiers.ts) — data-quality exclusions, not deferred-mechanic badges
 * (that's the incoming-scope todo, #15).
 */
export const hiddenArmorOmodIds: ReadonlySet<string> = new Set<string>([
  // Overeater's: its only extracted modifier is a `maxHealth` curve whose
  // MGEF is script/scaled with zero baked magnitude (extraction note:
  // "Legendary_Armor_OvereaterAddValue: zero magnitude, no curve — script/
  // scaled, needs override") — always interpolates to 0, no real bonus. The
  // mod's actual mechanic (+DR/ER per active food/drink buff) is incoming-
  // scope and unextracted; see #15.
  'mod_Legendary_Armor1_Overeater',
  'mod_Legendary_PowerArmor1_Overeater',
  // Punishing: its two extracted modifiers (limbDamage/dbm MUL_ADD −1, i.e.
  // zero damage) are gated on `HasLegendary_Weapon_HealAllies` — the SAME
  // ally-heal-blocking clause `legendary-values.ts`'s Crippling override
  // already documents colliding with other legendary common-perk chases.
  // Nothing about "Punishing" relates to ally healing; this is extraction
  // noise from a shared `LegendaryCommonWeaponPerk` entry point, not a real
  // effect (extraction note: "ActorValues on ReflectMeleeDamage —
  // unmapped" — the actual reflect-damage mechanic never extracted). See
  // #15.
  'mod_Legendary_Armor_ReflectDamage',
]);

/**
 * Armor-OMOD counterpart of forceVisibleWeaponIds/forceVisibleOmodIds
 * (rescues obtainable:false records). There are no known rescue cases yet.
 */
export const forceVisibleArmorOmodIds: ReadonlySet<string> = new Set<string>();
