/** Domain corrections live in the sibling correction modules. */
export * from './weapon-corrections';
export * from './omod-corrections';
export * from './armor-corrections';
export * from './consumable-corrections';

/**
 * Display-only replacements for an OMOD's ESM `description`, applied at the
 * dataset merge (`applyDescriptionOverride`). The weapon-mod picker falls
 * back to this text only for ids in this table — membership is the gate that
 * keeps the 2000+ cosmetic ESM flavor lines (paint names, etc.) out of the UI.
 * Stale/no-op keys are reported by `getUnresolvedOverrideKeys`.
 */
export const omodDescriptionOverrides: Readonly<Record<string, string>> = {
  // modWeapBleedEffect record condition
  // WornHasKeyword(HasLegendary_Weapon_HealAllies)=0, user framing 2026-08-19.
  // Bleed weapon mods hide that clause; Medic's itself explains the
  // interaction: ally healing procs on base damage dealt, never on DoTs.
  mod_Legendary_Weapon1_Medic:
    'heals allies for a portion of base damage dealt — DoTs (bleed/burn/poison) never trigger it',
};
