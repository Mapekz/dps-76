import { getWeapons } from '@/data';
import { effectiveValue, type ResolveContext } from '@/lib/engine/resolve';
import { createDefaultEnemyConditions } from '@/types';
import { makeResolvedPlayer } from '@/lib/engine/__tests__/resolved-player-fixture';

export const UNYIELDING = 'mod_Legendary_Armor1_LowHealthIncreasesStats';
export const STRENGTH_2STAR = 'mod_Legendary_Armor2_StatStrength';
export const BATTLE_LOADERS = 'mod_Legendary_Armor4_BattleLoaders';
export const LIMIT_BREAKING = 'mod_Legendary_Armor4_LimitBreak';
export const EMERGENCY_PROTOCOLS = 'mod_PowerArmor_Excavator_Torso_Misc_Emergency';
export const DEEP_POCKETED = 'DLC03_mod_armor_Marine_Lining_Limb_ImprovedCarryCapacity2';
export const BODY_JETPACK = 'mod_armor_BOSInfantry_JetPack';

export const fixer = getWeapons('live')['CombatRifle_Fixer'];

export function ctx(overrides: Partial<ResolveContext['player']> = {}): ResolveContext {
  return {
    weapon: fixer,
    player: { ...makeResolvedPlayer(), ...overrides },
    enemy: createDefaultEnemyConditions(),
    scenario: { isVats: false, isSneaking: false, isPowerAttack: false, isCrit: false },
  };
}

export { effectiveValue, type ResolveContext };
