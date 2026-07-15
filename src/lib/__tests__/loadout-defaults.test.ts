import { describe, it, expect } from 'vitest';
import { resolveLoadout } from '@/lib/loadout';
import { computeScenarios } from '@/lib/engine/scenarios';
import { getDefaultOmodId, getOmodById } from '@/data/omods';
import { getWeapons } from '@/data';
import { PerkId } from '@/data/perk-ids';
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
    // post unique-weapons-rework — its identity now lives as
    // mod_custom_Coldshoulder_DmgvsCryptid (displayed "Cold Shoulder" via
    // omodNameOverrides; ESM Name is "Paranormal Mod"), a real ap_customName
    // mod hosted on base DoubleBarrelShotgun's templateModFormIds. Explicitly
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

describe('enemy-type-gated modifiers activate on a matching target (data → loadout → engine)', () => {
  function dpsVsTarget(weapon: PlayerConfig['weapon'], targetRace: string | null) {
    const playerConfig: PlayerConfig = { ...createDefaultPlayerConfig(), weapon };
    const enemyConfig = createDefaultEnemyConfig();
    enemyConfig.conditions.targetRace = targetRace;
    const input = resolveLoadout(playerConfig, enemyConfig, 'live');
    expect(input).not.toBeNull();
    return computeScenarios(input!).freeAim.burstDps;
  }

  it("Assassin's (GetIsRace HumanRace) applies vs Human, not vs a robot or no target", () => {
    const weapon = {
      weaponId: 'CombatRifle_Fixer',
      mods: {},
      legendaryEffects: ['mod_Legendary_Weapon1_DmgVsPlayers'],
    };
    const noTarget = dpsVsTarget(weapon, null);
    const vsHuman = dpsVsTarget(weapon, 'HumanRace');
    const vsRobot = dpsVsTarget(weapon, 'AssaultronRace');
    expect(vsHuman).toBeGreaterThan(noTarget);
    expect(vsRobot).toBeCloseTo(noTarget, 10);
  });

  it("Cold Shoulder's Paranormal Mod (ActorTypeCryptid keyword) applies vs Mothman only", () => {
    const weapon = {
      weaponId: 'DoubleBarrelShotgun',
      mods: { ap_customName: 'mod_custom_Coldshoulder_DmgvsCryptid' },
      legendaryEffects: [],
    };
    const noTarget = dpsVsTarget(weapon, null);
    const vsMothman = dpsVsTarget(weapon, 'MothmanRace');
    const vsHuman = dpsVsTarget(weapon, 'HumanRace');
    expect(vsMothman).toBeGreaterThan(noTarget);
    expect(vsHuman).toBeCloseTo(noTarget, 10);
  });
});

describe('loadout weapon-stat folding (perk weapon-stat fold gap)', () => {
  function loadoutWithPerks(weaponId: string, perks: PlayerConfig['perks']) {
    const playerConfig: PlayerConfig = {
      ...createDefaultPlayerConfig(),
      weapon: { weaponId, mods: {}, legendaryEffects: [] },
      perks,
    };
    return resolveLoadout(playerConfig, createDefaultEnemyConfig(), 'live');
  }

  it('Martial Artist rank 3 folds +0.3 swing speed on a melee weapon (weaponAnimTypeMax gate, 2026-07-14)', () => {
    const stock = loadout('Machete');
    const withPerk = loadoutWithPerks('Machete', [{ perkId: PerkId.MartialArtist, rank: 3 }]);
    expect(stock!.weapon.animType).toBe(1); // OneHandSword
    expect(withPerk!.weapon.speed).toBeCloseTo((stock!.weapon.speed ?? 1) + 0.3, 6);
  });

  it('Martial Artist does NOT speed up gun-animated weapons: the Fixer (Gun) and the melee-classed Paddle Ball (Gun)', () => {
    for (const weaponId of ['CombatRifle_Fixer', 'DLC04_PaddleBall_NWOT']) {
      const stock = loadout(weaponId);
      const withPerk = loadoutWithPerks(weaponId, [{ perkId: PerkId.MartialArtist, rank: 3 }]);
      expect(stock!.weapon.animType).toBe(9); // Gun — GetWeaponAnimType()≤6 fails
      expect(withPerk!.weapon.speed).toBeCloseTo(stock!.weapon.speed ?? 1, 6);
    }
  });

  it('Ground Pounder rank 3 folds +0.3 reload speed on small guns but not heavy guns (expanded SmallGun_Actor_Condition, 2026-07-14)', () => {
    const stockFixer = loadout('CombatRifle_Fixer');
    const fixer = loadoutWithPerks('CombatRifle_Fixer', [{ perkId: PerkId.GroundPounder, rank: 3 }]);
    expect(fixer!.weapon.reloadSpeed).toBeCloseTo((stockFixer!.weapon.reloadSpeed ?? 1) + 0.3, 6);

    const stockGauss = loadout('GaussMinigun');
    const gauss = loadoutWithPerks('GaussMinigun', [{ perkId: PerkId.GroundPounder, rank: 3 }]);
    expect(gauss!.weapon.reloadSpeed).toBeCloseTo(stockGauss!.weapon.reloadSpeed ?? 1, 6);
  });

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
