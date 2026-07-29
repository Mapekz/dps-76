import { describe, it, expect } from 'bun:test';
import { resolveLoadout } from '@/lib/loadout';
import { createDefaultEnemyConfig, createDefaultPlayerConfig, type PlayerConfig } from '@/types';

/**
 * Follow Through / Taking One for the Team model a conditional 10s-window
 * proc as a manual damage-multiplier toggle (0-40%) folding to one
 * `wholeDamage` ADD modifier each. Applied UNCONDITIONALLY, like Tenderizer —
 * any player's card can have placed the debuff on the target, so it never
 * gates on this build's own legendary-perk selection (docs/assumptions.md).
 */

function loadout(overrides: Partial<PlayerConfig> = {}) {
  const playerConfig: PlayerConfig = {
    ...createDefaultPlayerConfig(),
    weapon: { weaponId: 'CombatRifle_Fixer', mods: {}, legendaryEffects: [] },
    ...overrides,
  };
  return resolveLoadout(playerConfig, createDefaultEnemyConfig(), 'live');
}

describe('Follow Through / Taking One for the Team wholeDamage toggles', () => {
  it('a nonzero toggle emits a wholeDamage modifier scaled by it, card equipped', () => {
    const input = loadout({
      legendaryPerks: [{ perkId: 'FollowThrough', rank: 1 }],
      conditions: { ...createDefaultPlayerConfig().conditions, followThroughPct: 20 },
    });
    const mod = input!.modifiers.find(
      (m) => m.bucket === 'wholeDamage' && m.source.name === 'Follow Through',
    );
    expect(mod).toBeDefined();
    expect(mod).toMatchObject({ value: 0.2, op: 'ADD' });
  });

  it('a nonzero toggle emits a wholeDamage modifier even without the card equipped — another player can apply the debuff', () => {
    const input = loadout({
      legendaryPerks: [],
      conditions: {
        ...createDefaultPlayerConfig().conditions,
        followThroughPct: 20,
        takingOneForTheTeamPct: 30,
      },
    });
    const followThrough = input!.modifiers.find(
      (m) => m.bucket === 'wholeDamage' && m.source.name === 'Follow Through',
    );
    const toftt = input!.modifiers.find(
      (m) => m.bucket === 'wholeDamage' && m.source.name === 'Taking One for the Team',
    );
    expect(followThrough).toMatchObject({ value: 0.2, op: 'ADD' });
    expect(toftt).toMatchObject({ value: 0.3, op: 'ADD' });
  });

  it('the toggle at its 0 default emits nothing, regardless of equip', () => {
    const input = loadout({ legendaryPerks: [{ perkId: 'FollowThrough', rank: 1 }] });
    expect(input!.modifiers.some((m) => m.bucket === 'wholeDamage')).toBe(false);
  });

  it('both dialed up compose as two independent wholeDamage factors', () => {
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
    const wholeDamageMods = input!.modifiers.filter((m) => m.bucket === 'wholeDamage');
    expect(wholeDamageMods).toHaveLength(2);
    expect(wholeDamageMods.map((m) => ('value' in m ? m.value : undefined)).sort()).toEqual([
      0.4, 0.4,
    ]);
  });
});
