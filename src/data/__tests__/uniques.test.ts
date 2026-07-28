import { describe, it, expect } from 'vitest';
import { getEquippedUnique, getUniques, getUniquesForWeapon } from '@/data/uniques';
import { getOmodById } from '@/data/omods';
import { hiddenOmodIds, forceVisibleOmodIds } from '@/data/overrides/corrections';
import type { WeaponConfig } from '@/types';

describe('getUniques', () => {
  it('returns presets with identity mod ids and base weapon refs', () => {
    const uniques = getUniques('live');
    expect(uniques.length).toBeGreaterThan(50);
    const salt = uniques.find((u) => u.id === 'mod_Custom_SaltOfTheEarth');
    expect(salt).toMatchObject({
      baseWeaponId: 'DoubleBarrelShotgun',
      mods: expect.objectContaining({ ap_customName: 'mod_Custom_SaltOfTheEarth' }),
      legendaryEffects: [null, null, 'mod_Legendary_Weapon3_Guns_ReloadSpeed'],
    });
    expect(getOmodById('live', salt!.id)?.name).toBeTruthy();
  });

  it('hides uniques whose identity mod is hidden', () => {
    const hiddenId = [...hiddenOmodIds][0];
    if (!hiddenId) return;
    const all = getUniques('live');
    expect(all.some((u) => u.id === hiddenId)).toBe(false);
  });

  it('forceVisibleOmodIds can surface a hidden identity mod', () => {
    const forcedId = [...forceVisibleOmodIds][0];
    if (!forcedId) return;
    // Only assert the wiring exists when a forced omod is also a unique preset.
    const fromDataset = getUniques('live');
    if (fromDataset.some((u) => u.id === forcedId)) {
      expect(getOmodById('live', forcedId)).toBeDefined();
    }
  });
});

describe('getEquippedUnique', () => {
  const weapon: WeaponConfig = {
    weaponId: 'DoubleBarrelShotgun',
    mods: { ap_customName: 'mod_Custom_SaltOfTheEarth' },
    legendaryEffects: [],
  };

  it('derives the equipped unique from ap_customName', () => {
    expect(getEquippedUnique('live', weapon)?.id).toBe('mod_Custom_SaltOfTheEarth');
  });

  it('returns undefined when no identity mod is equipped', () => {
    expect(
      getEquippedUnique('live', {
        weaponId: 'DoubleBarrelShotgun',
        mods: {},
        legendaryEffects: [],
      }),
    ).toBeUndefined();
  });
});

describe('getUniquesForWeapon', () => {
  it('groups presets by base weapon', () => {
    const forDbs = getUniquesForWeapon('live', 'DoubleBarrelShotgun');
    expect(forDbs.map((u) => u.id)).toEqual(
      expect.arrayContaining(['mod_Custom_SaltOfTheEarth', 'mod_custom_Coldshoulder_DmgvsCryptid']),
    );
  });
});
