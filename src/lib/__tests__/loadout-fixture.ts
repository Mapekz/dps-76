import { resolveLoadout } from '@/lib/loadout';
import {
  createDefaultEnemyConfig,
  createDefaultPlayerConfig,
  type EnemyConfig,
  type PlayerConfig,
  type WeaponConfig,
} from '@/types';

export function weapon(
  weaponId: string,
  mods: WeaponConfig['mods'] = {},
  legendaryEffects: WeaponConfig['legendaryEffects'] = [],
): WeaponConfig {
  return { weaponId, mods: { ...mods }, legendaryEffects: [...legendaryEffects] };
}

/** `resolveLoadout` on the default player config with `overrides` spread over it (live mode). */
export function loadoutFor(
  overrides: Partial<PlayerConfig> = {},
  enemy: EnemyConfig = createDefaultEnemyConfig(),
) {
  return resolveLoadout({ ...createDefaultPlayerConfig(), ...overrides }, enemy, 'live');
}
