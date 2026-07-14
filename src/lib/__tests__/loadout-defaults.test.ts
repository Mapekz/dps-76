import { describe, it, expect } from 'vitest';
import { resolveLoadout } from '@/lib/loadout';
import { getDefaultOmodId, getOmodById } from '@/data/omods';
import { getWeapons } from '@/data';
import {
  createDefaultEnemyConfig,
  createDefaultPlayerConfig,
  type PlayerConfig,
} from '@/types';

/**
 * Undecided mod slots must carry the weapon's real standard parts (ESM Object
 * Template Default combination) — before this landed, an untouched Fixer was
 * computed without its Calibrated Receiver and an unmodded Cryolator lost its
 * automatic fire mode. Real-data regression coverage over the live dataset.
 */

function loadout(weaponId: string, mods: Record<string, string | null> = {}) {
  const playerConfig: PlayerConfig = {
    ...createDefaultPlayerConfig(),
    weapon: { weaponId, mods, legendaryEffects: [] },
  };
  return resolveLoadout(playerConfig, createDefaultEnemyConfig(), 'live');
}

describe('default mod folding (assemble-time)', () => {
  it('unmodded Cryolator is automatic via its Standard Barrel (SET isAutomatic 1)', () => {
    const input = loadout('Cryolator');
    expect(input).not.toBeNull();
    expect(input!.weapon.isAutomatic).toBe(true);
  });

  it("unmodded Fixer carries its default parts' modifiers (Calibrated Receiver crit, Suppressor sneak)", () => {
    const input = loadout('CombatRifle_Fixer');
    const sources = new Set(input!.modifiers.map(m => m.source.edid));
    expect(sources).toContain('mod_CombatRifle_Receiver_CritDMG'); // Calibrated Receiver
    expect(sources).toContain('mod_CombatRifle_muzzle_Suppressor_Base'); // Suppressor
  });

  it('an explicit slot choice replaces the default for that slot only (no double-count)', () => {
    const input = loadout('CombatRifle_Fixer', { ap_gun_Receiver: 'mod_CombatRifle_Receiver_Damage-Auto' });
    const receiverMods = input!.modifiers.filter(m => m.source.edid.startsWith('mod_CombatRifle_Receiver'));
    const sources = new Set(receiverMods.map(m => m.source.edid));
    expect(sources).toContain('mod_CombatRifle_Receiver_Damage-Auto');
    expect(sources).not.toContain('mod_CombatRifle_Receiver_CritDMG');
    // Other slots keep their defaults.
    expect(input!.modifiers.some(m => m.source.edid === 'mod_CombatRifle_muzzle_Suppressor_Base')).toBe(true);
  });

  it('an explicit null (reset-to-standard) behaves identically to an untouched slot', () => {
    const untouched = loadout('CombatRifle_Fixer');
    const cleared = loadout('CombatRifle_Fixer', { ap_gun_Receiver: null });
    expect(cleared!.modifiers.map(m => m.id).sort()).toEqual(untouched!.modifiers.map(m => m.id).sort());
  });

  it('stat-carrying cosmetic-slot unique folds in when selected', () => {
    // DoubleBarrelShotgun_ColdShoulder (the legacy standalone WEAP) is hidden
    // post unique-weapons-rework — its identity now lives as the Paranormal
    // Mod (mod_custom_Coldshoulder_DmgvsCryptid), a real ap_customName mod
    // hosted on base DoubleBarrelShotgun's templateModFormIds. Explicitly
    // selecting it (rather than relying on default-fold, since it isn't the
    // weapon's default part) still folds its modifiers in.
    const input = loadout('DoubleBarrelShotgun', { ap_customName: 'mod_custom_Coldshoulder_DmgvsCryptid' });
    const paranormal = getOmodById('live', 'mod_custom_Coldshoulder_DmgvsCryptid');
    expect(paranormal?.modifiers.length).toBe(3);
    expect(input!.modifiers.some(m => m.source.edid === paranormal!.id)).toBe(true);
  });

  it('picking the default explicitly equals leaving the slot untouched', () => {
    const untouched = loadout('CombatRifle_Fixer');
    const explicit = loadout('CombatRifle_Fixer', { ap_gun_Receiver: 'mod_CombatRifle_Receiver_CritDMG' });
    expect(explicit!.modifiers.map(m => m.id).sort()).toEqual(untouched!.modifiers.map(m => m.id).sort());
  });
});

describe('loadout weapon-stat folding (perk weapon-stat fold gap)', () => {
  it('Speed Demon folds +0.3 reload speed into the effective weapon and leaves no reloadSpeed modifier downstream', () => {
    const playerConfig: PlayerConfig = {
      ...createDefaultPlayerConfig(),
      weapon: { weaponId: 'CombatRifle_Fixer', mods: {}, legendaryEffects: [] },
      mutations: ['Mutation_SpeedDemon'],
    };
    const withMutation = resolveLoadout(playerConfig, createDefaultEnemyConfig(), 'live');
    const stock = loadout('CombatRifle_Fixer');

    // Mutation_SpeedDemon: reloadSpeed ADD 0.3 (0.4 under Strange in Numbers).
    expect(withMutation!.weapon.reloadSpeed).toBeCloseTo((stock!.weapon.reloadSpeed ?? 1) + 0.3, 6);
    // Consumed by the effective-weapon fold — never left in the resolver list.
    expect(withMutation!.modifiers.some(m => m.bucket === 'reloadSpeed')).toBe(false);
  });
});

describe('getDefaultOmodId', () => {
  it('resolves the Handmade slot defaults by their real in-game names', () => {
    const handmade = getWeapons('live')['DLC04_HandMadeGun'];
    const nameOf = (slot: string) => {
      const id = getDefaultOmodId('live', handmade, slot);
      return id ? getOmodById('live', id)?.name : undefined;
    };
    expect(nameOf('ap_gun_Barrel')).toBe('Short Barrel');
    expect(nameOf('ap_gun_Grip')).toBe('Standard Stock');
    expect(nameOf('ap_gun_Mag')).toBe('Standard Magazine');
    expect(nameOf('ap_gun_Muzzle')).toBe('No Muzzle');
  });

  it('returns undefined for a slot with no known default', () => {
    const handmade = getWeapons('live')['DLC04_HandMadeGun'];
    expect(getDefaultOmodId('live', handmade, 'ap_gun_NotASlot')).toBeUndefined();
  });
});
