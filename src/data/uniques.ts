import type { GameMode, WeaponConfig } from '@/types';
import type { GeneratedUnique } from '@/types/generated';
import { getDataset } from './dataset';
import { getOmodById } from './omods';
import { isRecordVisible } from './overlay';

const byIdCache = new Map<GameMode, Map<string, GeneratedUnique>>();

function allUniques(mode: GameMode): GeneratedUnique[] {
  return getDataset(mode).uniques;
}

export function getUniques(mode: GameMode): GeneratedUnique[] {
  const dataset = getDataset(mode);
  return allUniques(mode).filter((u) => {
    const identity = getOmodById(mode, u.id);
    return (
      identity &&
      isRecordVisible(identity, {
        hidden: dataset.hiddenOmodIds,
        forceVisible: dataset.forceVisibleOmodIds,
      })
    );
  });
}

export function getUniqueById(mode: GameMode, id: string): GeneratedUnique | undefined {
  let map = byIdCache.get(mode);
  if (!map) {
    map = new Map<string, GeneratedUnique>();
    for (const unique of allUniques(mode)) {
      map.set(unique.id, unique);
      for (const variantId of unique.variantIds ?? []) {
        map.set(variantId, unique);
      }
    }
    byIdCache.set(mode, map);
  }
  return map.get(id);
}

/** Derive the equipped unique from the identity mod slot — shared by reducer and UI. */
export function getEquippedUnique(
  mode: GameMode,
  weaponConfig: WeaponConfig,
): GeneratedUnique | undefined {
  const identityId = weaponConfig.mods['ap_customName'] ?? weaponConfig.mods['ap_Item_Description'];
  if (typeof identityId !== 'string') return undefined;
  return getUniqueById(mode, identityId);
}

export function getUniquesForWeapon(mode: GameMode, weaponId: string): GeneratedUnique[] {
  return getUniques(mode).filter((u) => u.baseWeaponId === weaponId);
}
