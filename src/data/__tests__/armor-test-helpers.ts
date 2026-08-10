import { getWeapons } from '@/data';
import { effectiveValue, type ResolveContext } from '@/lib/engine/resolve';
import { createDefaultEnemyConditions, createDefaultPlayerConditions } from '@/types';

export const UNYIELDING = 'mod_Legendary_Armor1_LowHealthIncreasesStats';
export const STRENGTH_2STAR = 'mod_Legendary_Armor2_StatStrength';
export const BATTLE_LOADERS = 'mod_Legendary_Armor4_BattleLoaders';
export const LIMIT_BREAKING = 'mod_Legendary_Armor4_LimitBreak';
export const EMERGENCY_PROTOCOLS = 'mod_PowerArmor_Excavator_Torso_Misc_Emergency';

export const fixer = getWeapons('live')['CombatRifle_Fixer'];

export function ctx(overrides: Partial<ResolveContext['player']> = {}): ResolveContext {
  return {
    weapon: fixer,
    player: { ...createDefaultPlayerConditions(), ...overrides },
    enemy: createDefaultEnemyConditions(),
    scenario: { isVats: false, isSneaking: false, isPowerAttack: false, isCrit: false },
  };
}

export { effectiveValue, type ResolveContext };
