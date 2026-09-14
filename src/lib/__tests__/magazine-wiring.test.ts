import { beforeAll, describe, it, expect } from 'bun:test';
import { resolveStats } from '@/lib/loadout';
import { computeScenarios } from '@/lib/engine/scenarios';
import { createDefaultEnemyConfig, createDefaultPlayerConfig, type PlayerConfig } from '@/types';
import { makeResolvedPlayer } from '@/lib/engine/__tests__/resolved-player-fixture';
import { loadoutFor, weapon } from '@/lib/__tests__/loadout-fixture';

function freeAim(overrides: Partial<PlayerConfig> = {}) {
  const input = loadoutFor(overrides);
  expect(input).not.toBeNull();
  return computeScenarios(input!).freeAim;
}

function burstDps(overrides: Partial<PlayerConfig> = {}) {
  return freeAim(overrides).burstDps;
}

describe('magazine/bobblehead wiring (overrides & extracted modifiers → resolveLoadout → engine)', () => {
  let gaussBase: ReturnType<typeof freeAim>;
  let fixerBase: ReturnType<typeof freeAim>;
  beforeAll(() => {
    gaussBase = freeAim({ weapon: weapon('GaussMinigun') });
    fixerBase = freeAim({ weapon: weapon('CombatRifle_Fixer') });
  });

  it('Big Guns bobblehead adds damage on a heavy gun only', () => {
    const heavyBuffed = burstDps({
      weapon: weapon('GaussMinigun'),
      consumables: ['BobbleHead_BigGuns_Potion'],
    });
    const rifleBuffed = burstDps({
      weapon: weapon('CombatRifle_Fixer'),
      consumables: ['BobbleHead_BigGuns_Potion'],
    });

    expect(heavyBuffed).toBeGreaterThan(gaussBase.burstDps);
    expect(rifleBuffed).toBeCloseTo(fixerBase.burstDps, 10);
  });

  it('Tesla Science 5 raises sustained DPS on all weapon classes (ungated ammoFreeChance)', () => {
    const heavyBuffed = freeAim({
      weapon: weapon('GaussMinigun'),
      consumables: ['Magazine_TeslaScience05_Potion'],
    });
    const rifleBuffed = freeAim({
      weapon: weapon('CombatRifle_Fixer'),
      consumables: ['Magazine_TeslaScience05_Potion'],
    });

    expect(heavyBuffed.sustain.sustainedDps).toBeGreaterThan(gaussBase.sustain.sustainedDps);
    // Non-heavy sustained rise encodes "ESM over card text" — would fail under
    // the deleted heavy-gun override.
    expect(rifleBuffed.sustain.sustainedDps).toBeGreaterThan(fixerBase.sustain.sustainedDps);
    // ammoFreeChance stretches magazine capacity, not per-hit damage.
    expect(rifleBuffed.burstDps).toBeCloseTo(fixerBase.burstDps, 10);
  });

  it('U.S. Covert Operations Manual 8 adds damage on knife/unarmed only', () => {
    const knifeBase = burstDps({ weapon: weapon('Knife') });
    const knifeBuffed = burstDps({
      weapon: weapon('Knife'),
      consumables: ['Magazine_USCovertOps08_Potion'],
    });
    const heavyBuffed = burstDps({
      weapon: weapon('GaussMinigun'),
      consumables: ['Magazine_USCovertOps08_Potion'],
    });

    expect(knifeBuffed).toBeGreaterThan(knifeBase);
    expect(heavyBuffed).toBeCloseTo(gaussBase.burstDps, 10);
  });

  it('Awesome Tales 10 adds scoped damage only while aiming down sights', () => {
    const scoped = weapon('CombatRifle_Fixer', {
      ap_gun_Scope: 'mod_CombatRifle_SCOPE_ShortScope_Base',
    });
    const scopedOffAds = burstDps({
      weapon: scoped,
      consumables: ['Magazine_AwesomeTales10_Potion'],
    });
    const scopedOnAds = burstDps({
      weapon: scoped,
      consumables: ['Magazine_AwesomeTales10_Potion'],
      conditions: { ...createDefaultPlayerConfig().conditions, isAimingDownSights: true },
    });
    const noScopeOnAds = burstDps({
      weapon: weapon('CombatRifle_Fixer'),
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
