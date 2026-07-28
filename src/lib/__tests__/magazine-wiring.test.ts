import { describe, it, expect } from 'vitest';
import { resolveLoadout, resolveStats } from '@/lib/loadout';
import { computeScenarios } from '@/lib/engine/scenarios';
import { createDefaultEnemyConfig, createDefaultPlayerConfig, type PlayerConfig } from '@/types';

function loadout(overrides: Partial<PlayerConfig> = {}) {
  const playerConfig: PlayerConfig = { ...createDefaultPlayerConfig(), ...overrides };
  return resolveLoadout(playerConfig, createDefaultEnemyConfig(), 'live');
}

function burstDps(overrides: Partial<PlayerConfig> = {}) {
  const input = loadout(overrides);
  expect(input).not.toBeNull();
  return computeScenarios(input!).freeAim.burstDps;
}

describe('magazine/bobblehead wiring (buffValueOverrides → resolveLoadout → engine)', () => {
  it('Big Guns bobblehead adds damage on a heavy gun only', () => {
    const heavyBase = burstDps({
      weapon: { weaponId: 'GaussMinigun', mods: {}, legendaryEffects: [] },
    });
    const heavyBuffed = burstDps({
      weapon: { weaponId: 'GaussMinigun', mods: {}, legendaryEffects: [] },
      consumables: ['BobbleHead_BigGuns_Potion'],
    });
    const rifleBase = burstDps({
      weapon: { weaponId: 'CombatRifle_Fixer', mods: {}, legendaryEffects: [] },
    });
    const rifleBuffed = burstDps({
      weapon: { weaponId: 'CombatRifle_Fixer', mods: {}, legendaryEffects: [] },
      consumables: ['BobbleHead_BigGuns_Potion'],
    });

    expect(heavyBuffed).toBeGreaterThan(heavyBase);
    expect(rifleBuffed).toBeCloseTo(rifleBase, 10);
  });

  it('U.S. Covert Operations Manual 8 adds damage on knife/unarmed only', () => {
    const knifeBase = burstDps({ weapon: { weaponId: 'Knife', mods: {}, legendaryEffects: [] } });
    const knifeBuffed = burstDps({
      weapon: { weaponId: 'Knife', mods: {}, legendaryEffects: [] },
      consumables: ['Magazine_USCovertOps08_Potion'],
    });
    const heavyBase = burstDps({
      weapon: { weaponId: 'GaussMinigun', mods: {}, legendaryEffects: [] },
    });
    const heavyBuffed = burstDps({
      weapon: { weaponId: 'GaussMinigun', mods: {}, legendaryEffects: [] },
      consumables: ['Magazine_USCovertOps08_Potion'],
    });

    expect(knifeBuffed).toBeGreaterThan(knifeBase);
    expect(heavyBuffed).toBeCloseTo(heavyBase, 10);
  });

  it('Awesome Tales 10 adds scoped damage only while aiming down sights', () => {
    const weapon = {
      weaponId: 'CombatRifle_Fixer',
      mods: { ap_gun_Scope: 'mod_CombatRifle_SCOPE_ShortScope_Base' },
      legendaryEffects: [] as string[],
    };
    const scopedOffAds = burstDps({ weapon, consumables: ['Magazine_AwesomeTales10_Potion'] });
    const scopedOnAds = burstDps({
      weapon,
      consumables: ['Magazine_AwesomeTales10_Potion'],
      conditions: { ...createDefaultPlayerConfig().conditions, isAimingDownSights: true },
    });
    const noScopeOnAds = burstDps({
      weapon: { weaponId: 'CombatRifle_Fixer', mods: {}, legendaryEffects: [] },
      consumables: ['Magazine_AwesomeTales10_Potion'],
      conditions: { ...createDefaultPlayerConfig().conditions, isAimingDownSights: true },
    });

    expect(scopedOnAds).toBeGreaterThan(scopedOffAds);
    expect(noScopeOnAds).toBeCloseTo(scopedOffAds, 10);
  });

  it('Live & Love 5 adds +2 effective Luck only while an alcohol is active', () => {
    const magazineOnly = resolveStats(
      { ...createDefaultPlayerConfig(), consumables: ['Magazine_LiveAndLove05_Potion'] },
      createDefaultEnemyConfig(),
      'live',
    );
    const alcoholOnly = resolveStats(
      { ...createDefaultPlayerConfig(), consumables: ['Brew_BlackwaterBrew'] },
      createDefaultEnemyConfig(),
      'live',
    );
    const magazineAndAlcohol = resolveStats(
      {
        ...createDefaultPlayerConfig(),
        consumables: ['Magazine_LiveAndLove05_Potion', 'Brew_BlackwaterBrew'],
      },
      createDefaultEnemyConfig(),
      'live',
    );

    expect(magazineOnly.special.luck).toBe(15);
    expect(magazineAndAlcohol.special.luck - alcoholOnly.special.luck).toBe(2);
  });
});
