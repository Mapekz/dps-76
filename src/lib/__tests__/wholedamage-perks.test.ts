import { describe, it, expect } from 'vitest';
import { resolveLoadout } from '@/lib/loadout';
import { createDefaultEnemyConfig, createDefaultPlayerConfig, type PlayerConfig } from '@/types';

/**
 * Follow Through / Taking One for the Team model a conditional 10s-window
 * proc as a manual uptime slider (0-40%) folding to one `wholeDamage` ADD
 * modifier each, gated on the legendary card actually being equipped
 * (dps-todos/wholedamage-perks.md, docs/assumptions.md).
 */

function loadout(overrides: Partial<PlayerConfig> = {}) {
  const playerConfig: PlayerConfig = {
    ...createDefaultPlayerConfig(),
    weapon: { weaponId: 'CombatRifle_Fixer', mods: {}, legendaryEffects: [] },
    ...overrides,
  };
  return resolveLoadout(playerConfig, createDefaultEnemyConfig(), 'live');
}

describe('Follow Through / Taking One for the Team wholeDamage sliders', () => {
  it('Follow Through equipped + slider > 0 emits a wholeDamage modifier scaled by the slider', () => {
    const input = loadout({
      legendaryPerks: [{ perkId: 'FollowThrough', rank: 1 }],
      conditions: { ...createDefaultPlayerConfig().conditions, followThroughPct: 20 },
    });
    const mod = input!.modifiers.find(m => m.bucket === 'wholeDamage' && m.source.name === 'Follow Through');
    expect(mod).toBeDefined();
    expect(mod).toMatchObject({ value: 0.2, op: 'ADD' });
  });

  it('Taking One for the Team equipped + slider > 0 emits a wholeDamage modifier scaled by the slider', () => {
    const input = loadout({
      legendaryPerks: [{ perkId: 'TakingOneForTheTeam', rank: 4 }],
      conditions: { ...createDefaultPlayerConfig().conditions, takingOneForTheTeamPct: 30 },
    });
    const mod = input!.modifiers.find(
      m => m.bucket === 'wholeDamage' && m.source.name === 'Taking One for the Team'
    );
    expect(mod).toBeDefined();
    expect(mod).toMatchObject({ value: 0.3, op: 'ADD' });
  });

  it('a nonzero slider is inert when the corresponding card is not equipped', () => {
    const input = loadout({
      legendaryPerks: [],
      conditions: {
        ...createDefaultPlayerConfig().conditions,
        followThroughPct: 20,
        takingOneForTheTeamPct: 30,
      },
    });
    expect(input!.modifiers.some(m => m.bucket === 'wholeDamage')).toBe(false);
  });

  it('an equipped card with the slider at its 0 default emits nothing', () => {
    const input = loadout({ legendaryPerks: [{ perkId: 'FollowThrough', rank: 1 }] });
    expect(input!.modifiers.some(m => m.bucket === 'wholeDamage')).toBe(false);
  });

  it('both equipped compose as two independent wholeDamage factors', () => {
    const input = loadout({
      legendaryPerks: [
        { perkId: 'FollowThrough', rank: 1 },
        { perkId: 'TakingOneForTheTeam', rank: 1 },
      ],
      conditions: {
        ...createDefaultPlayerConfig().conditions,
        followThroughPct: 40,
        takingOneForTheTeamPct: 40,
      },
    });
    const wholeDamageMods = input!.modifiers.filter(m => m.bucket === 'wholeDamage');
    expect(wholeDamageMods).toHaveLength(2);
    expect(wholeDamageMods.map(m => ('value' in m ? m.value : undefined)).sort()).toEqual([0.4, 0.4]);
  });
});
