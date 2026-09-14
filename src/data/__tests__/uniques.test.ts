import { describe, it, expect } from 'bun:test';
import { getEquippedUnique, getUniques, getUniquesForWeapon } from '@/data/uniques';
import { getWeapons } from '@/data';
import { getOmodById } from '@/data/omods';
import type { WeaponConfig } from '@/types';

describe('getUniques', () => {
  it('returns presets with identity mod ids and base weapon refs', () => {
    const uniques = getUniques('live');
    expect(uniques.length).toBeGreaterThan(50);
    const salt = uniques.find((u) => u.id === 'mod_Custom_SaltOfTheEarth');
    // `mods` is asserted separately, not nested via `expect.objectContaining`
    // inside this `toMatchObject` — Bun's JSON-module loader gives every
    // JSON-sourced object (including `mods`) a null prototype, and Bun's
    // `toMatchObject`/`objectContaining` diff logic corrupts on a repeated
    // (`--rerun-each`) match against a null-prototype nested object (verified
    // with a minimal repro outside this codebase; Vitest is unaffected).
    expect(salt).toMatchObject({
      baseWeaponId: 'DoubleBarrelShotgun',
      legendaryEffects: [null, null, 'mod_Legendary_Weapon3_Guns_ReloadSpeed'],
    });
    expect(salt!.mods.ap_customName).toBe('mod_Custom_SaltOfTheEarth');
    expect(getOmodById('live', salt!.id)?.name).toBeTruthy();
  });

  it('every unique baseWeaponId resolves to a weapon in the dataset', () => {
    const weapons = getWeapons('live');
    for (const unique of getUniques('live')) {
      expect(weapons[unique.baseWeaponId]).toBeDefined();
    }
  });

  it('returns uniques sorted non-descending by name', () => {
    const names = getUniques('live').map((u) => u.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
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

describe('getEquippedUnique (variant container presets)', () => {
  const camdenVariantIds = [
    'mod_Custom_CamdenWhacker_Bleed',
    'mod_Custom_CamdenWhacker_Poison',
    'mod_Custom_CamdenWhacker_Fire',
    'mod_Custom_CamdenWhacker_Cryo',
    'mod_Custom_CamdenWhacker_Energy',
    'mod_Custom_CamdenWhacker_RAD',
  ] as const;

  function weaponWithIdentityMod(omodId: string): WeaponConfig {
    return {
      weaponId: 'DLC04_CommieWhacker',
      mods: { ap_customName: omodId },
      legendaryEffects: [],
    };
  }

  it('resolves every Camden Whacker variant id to the same unique preset', () => {
    for (const variantId of camdenVariantIds) {
      const equipped = getEquippedUnique('live', weaponWithIdentityMod(variantId));
      expect(equipped?.id).toBe('mod_Custom_CamdenWhacker_Bleed');
      expect(equipped?.name).toBe('Camden Whacker');
      expect(equipped?.variantIds).toHaveLength(6);
    }
  });
});
