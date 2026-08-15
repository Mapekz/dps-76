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

/**
 * The attach-point slot a unique's own identity mod occupies — its preset
 * `mods` map is keyed by attach point, so find the slot whose value IS the
 * unique's own id, falling back to the identity mod's own attach point (or
 * the legacy `ap_customName` slot) when the preset's mods map doesn't
 * self-reference. Shared by the reducer (equipping a unique) and
 * WeaponSection (displaying which slot the identity mod holds).
 */
export function resolveUniqueIdentitySlot(mode: GameMode, unique: GeneratedUnique): string {
  return (
    Object.entries(unique.mods).find(([, omodId]) => omodId === unique.id)?.[0] ??
    getOmodById(mode, unique.id)?.attachPointEdid ??
    'ap_customName'
  );
}
