import { describe, it, expect } from 'bun:test';
import { resolveLoadout, resolveStats } from '@/lib/loadout';
import { computeScenarios } from '@/lib/engine/scenarios';
import { createDefaultEnemyConfig, createDefaultPlayerConfig, type PlayerConfig } from '@/types';
import { makeResolvedPlayer } from '@/lib/engine/__tests__/resolved-player-fixture';

function loadout(overrides: Partial<PlayerConfig> = {}) {
  const playerConfig: PlayerConfig = { ...createDefaultPlayerConfig(), ...overrides };
  return resolveLoadout(playerConfig, createDefaultEnemyConfig(), 'live');
}

function burstDps(overrides: Partial<PlayerConfig> = {}) {
  const input = loadout(overrides);
  expect(input).not.toBeNull();
  return computeScenarios(input!).freeAim.burstDps;
}

function sustainedDps(overrides: Partial<PlayerConfig> = {}) {
  const input = loadout(overrides);
  expect(input).not.toBeNull();
  return computeScenarios(input!).freeAim.sustain.sustainedDps;
}

describe('magazine/bobblehead wiring (overrides & extracted modifiers → resolveLoadout → engine)', () => {
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

  it('Tesla Science 5 raises sustained DPS on all weapon classes (ungated ammoFreeChance)', () => {
    const heavyBase = sustainedDps({
      weapon: { weaponId: 'GaussMinigun', mods: {}, legendaryEffects: [] },
    });
    const heavyBuffed = sustainedDps({
      weapon: { weaponId: 'GaussMinigun', mods: {}, legendaryEffects: [] },
      consumables: ['Magazine_TeslaScience05_Potion'],
    });
    const rifleBase = sustainedDps({
      weapon: { weaponId: 'CombatRifle_Fixer', mods: {}, legendaryEffects: [] },
    });
    const rifleBuffed = sustainedDps({
      weapon: { weaponId: 'CombatRifle_Fixer', mods: {}, legendaryEffects: [] },
      consumables: ['Magazine_TeslaScience05_Potion'],
    });
    const rifleBurstBase = burstDps({
      weapon: { weaponId: 'CombatRifle_Fixer', mods: {}, legendaryEffects: [] },
    });
    const rifleBurstBuffed = burstDps({
      weapon: { weaponId: 'CombatRifle_Fixer', mods: {}, legendaryEffects: [] },
      consumables: ['Magazine_TeslaScience05_Potion'],
    });

    expect(heavyBuffed).toBeGreaterThan(heavyBase);
    // Non-heavy sustained rise encodes "ESM over card text" — would fail under
    // the deleted heavy-gun override.
    expect(rifleBuffed).toBeGreaterThan(rifleBase);
    // ammoFreeChance stretches magazine capacity, not per-hit damage.
    expect(rifleBurstBuffed).toBeCloseTo(rifleBurstBase, 10);
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
    // Base Luck 15 is stated explicitly (via makeResolvedPlayer) rather than
    // inherited from createDefaultPlayerConfig() — the app's actual default
    // is 1 (see src/types/player.ts's createDefaultPlayerInput).
    const baseConditions = { ...makeResolvedPlayer() };
    const magazineOnly = resolveStats(
      {
        ...createDefaultPlayerConfig(),
        conditions: baseConditions,
        consumables: ['Magazine_LiveAndLove05_Potion'],
      },
      createDefaultEnemyConfig(),
      'live',
    );
    const alcoholOnly = resolveStats(
      {
        ...createDefaultPlayerConfig(),
        conditions: baseConditions,
        consumables: ['Brew_BlackwaterBrew'],
      },
      createDefaultEnemyConfig(),
      'live',
    );
    const magazineAndAlcohol = resolveStats(
      {
        ...createDefaultPlayerConfig(),
        conditions: baseConditions,
        consumables: ['Magazine_LiveAndLove05_Potion', 'Brew_BlackwaterBrew'],
      },
      createDefaultEnemyConfig(),
      'live',
    );

    expect(magazineOnly.special.luck).toBe(15);
    expect(magazineAndAlcohol.special.luck - alcoholOnly.special.luck).toBe(2);
  });
});
