import type { GameMode, WeaponConfig } from '@/types';
import type { GeneratedUnique } from '@/types/generated';
import { forceVisibleOmodIds, hiddenOmodIds } from './overrides/corrections';
import { getDataset } from './dataset';
import { getOmodById } from './omods';
import { isRecordVisible } from './overlay';

const omodVisibility = {
  hidden: new Set(hiddenOmodIds),
  forceVisible: new Set(forceVisibleOmodIds),
};

const byIdCache = new Map<GameMode, Map<string, GeneratedUnique>>();

function allUniques(mode: GameMode): GeneratedUnique[] {
  return getDataset(mode).uniques;
}

export function getUniques(mode: GameMode): GeneratedUnique[] {
  return allUniques(mode).filter(u => {
    const identity = getOmodById(mode, u.id);
    return identity && isRecordVisible(identity, omodVisibility);
  });
}

export function getUniqueById(mode: GameMode, id: string): GeneratedUnique | undefined {
  let map = byIdCache.get(mode);
  if (!map) {
    map = new Map(allUniques(mode).map(u => [u.id, u]));
    byIdCache.set(mode, map);
  }
  return map.get(id);
}

/** Derive the equipped unique from the identity mod slot — shared by reducer and UI. */
export function getEquippedUnique(mode: GameMode, weaponConfig: WeaponConfig): GeneratedUnique | undefined {
  const identityId = weaponConfig.mods['ap_customName'] ?? weaponConfig.mods['ap_Item_Description'];
  if (typeof identityId !== 'string') return undefined;
  return getUniqueById(mode, identityId);
}

export function getUniquesForWeapon(mode: GameMode, weaponId: string): GeneratedUnique[] {
  return getUniques(mode).filter(u => u.baseWeaponId === weaponId);
}
