import { describe, it, expect } from 'vitest';
import { getWeapons } from '@/data';
import { VETTED_WEAPON_IDS } from '../vetted-weapons';

/**
 * Pinning test for the vetted weapon roster (2026-07-12 pass). A fresh
 * `pnpm extract` can silently change which records pass the junk/obtainability
 * filters — this fails loudly instead of letting the picker drift unreviewed.
 * On failure: run `pnpm vet:weapons` and follow
 * .claude/skills/weapon-vetting/SKILL.md — adjudicate the delta, then update
 * VETTED_WEAPON_IDS deliberately.
 */

describe('vetted weapon roster', () => {
  const weapons = getWeapons('live');

  it('has no unreviewed additions or removals', () => {
    expect(Object.keys(weapons).sort()).toEqual([...VETTED_WEAPON_IDS].sort());
  });

  it('keeps known junk hidden (companion attacks, photo tools, utility throwables)', () => {
    for (const id of [
      'PharmaBot_Left_Spray',
      'Camera_SnapMatic',
      'Camera_Disposable',
      'EN02_OrbitalStrikeWeapon',
      'HalluciGenGrenade',
      'crcrossbow',
    ]) {
      expect(weapons[id], id).toBeUndefined();
    }
  });

  it('renames the unarmed records into deliberate build options', () => {
    expect(weapons['UnarmedHuman']?.name).toBe('Unarmed');
    expect(weapons['UnarmedPowerArmor']?.name).toBe('Unarmed (Power Armor)');
  });

  it('keeps the rescued script/vendor-granted uniques visible', () => {
    for (const id of ['MTNL01_PumpActionShotgun_Fancy', 'MTNL01_SingleActionRevolver_Fancy']) {
      expect(weapons[id], id).toBeDefined();
    }
  });

  it('flags per-shell reloaders from the AnimsSequentialReload keyword (Double-Barrel is NOT one — break-action)', () => {
    for (const id of ['DLC03_LeverGun', 'PumpActionShotgun', 'SingleActionRevolver']) {
      expect(weapons[id]?.reloadPerShell, id).toBe(true);
    }
    expect(weapons['DoubleBarrelShotgun']?.reloadPerShell).toBe(false);
    expect(weapons['CombatRifle_Fixer']?.reloadPerShell).toBe(false);
  });
});
