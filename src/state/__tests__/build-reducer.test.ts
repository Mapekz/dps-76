import { describe, it, expect } from 'vitest';
import { buildReducer, createDefaultBuildState, type BuildAction, type BuildState } from '@/state/build-reducer';

function run(actions: BuildAction[], from: BuildState = createDefaultBuildState()): BuildState {
  return actions.reduce(buildReducer, from);
}

describe('buildReducer', () => {
  it('weapon/select equips fresh and null unequips', () => {
    const s = run([{ type: 'weapon/select', weaponId: 'CombatRifle_Fixer' }]);
    expect(s.player.weapon).toEqual({ weaponId: 'CombatRifle_Fixer', mods: {}, legendaryEffects: [] });
    expect(run([{ type: 'weapon/select', weaponId: null }], s).player.weapon).toBeNull();
  });

  it('weapon/mod and weapon/legendary require an equipped weapon and patch slots', () => {
    const noWeapon = run([{ type: 'weapon/mod', slot: 'ap_gun_Receiver', omodId: 'x' }]);
    expect(noWeapon.player.weapon).toBeNull();

    const s = run([
      { type: 'weapon/select', weaponId: 'w' },
      { type: 'weapon/mod', slot: 'ap_gun_Receiver', omodId: 'mod_a' },
      { type: 'weapon/legendary', slotIndex: 0, omodId: 'leg_a' },
      { type: 'weapon/legendary', slotIndex: 1, omodId: 'leg_b' },
    ]);
    expect(s.player.weapon?.mods['ap_gun_Receiver']).toBe('mod_a');
    expect(s.player.weapon?.legendaryEffects).toEqual(['leg_a', 'leg_b']);

    const cleared = run([{ type: 'weapon/legendary', slotIndex: 0, omodId: null }], s);
    expect(cleared.player.weapon?.legendaryEffects).toEqual(['leg_b']);
  });

  it('clamps itemLevel to 1–50', () => {
    expect(run([{ type: 'weapon/itemLevel', value: 99 }]).player.itemLevel).toBe(50);
    expect(run([{ type: 'weapon/itemLevel', value: 0 }]).player.itemLevel).toBe(1);
  });

  it('special/set clamps to 1–15 and refuses raises past the 56-point pool', () => {
    // Fresh build starts at 1 across the board.
    expect(createDefaultBuildState().player.conditions.strength).toBe(1);
    expect(run([{ type: 'special/set', stat: 'luck', value: 33 }]).player.conditions.luck).toBe(15);
    expect(run([{ type: 'special/set', stat: 'strength', value: -1 }]).player.conditions.strength).toBe(1);

    // All stats at 8 = exactly 56 allocated; any further raise is refused.
    const maxedPool = run(
      (['strength', 'perception', 'endurance', 'charisma', 'intelligence', 'agility', 'luck'] as const).map(stat => ({
        type: 'special/set' as const,
        stat,
        value: 8,
      }))
    );
    const refused = run([{ type: 'special/set', stat: 'luck', value: 9 }], maxedPool);
    expect(refused).toBe(maxedPool);
    // Lowering is always allowed.
    expect(run([{ type: 'special/set', stat: 'luck', value: 3 }], maxedPool).player.conditions.luck).toBe(3);
  });

  it('blocks card slotting past min(15, base + Legendary SPECIAL bonus) and past the 4 legendary slots', () => {
    // Base Perception 1 → budget 1: a second Perception card point is refused.
    const one = run([{ type: 'perk/add', perkId: 'CenterMasochist', rank: 1, legendary: false }]);
    const refused = run([{ type: 'perk/setRank', perkId: 'CenterMasochist', rank: 2 }], one);
    expect(refused).toBe(one); // unchanged — blocked, not clamped

    // Raising base Perception unlocks the rank-up.
    const raised = run(
      [
        { type: 'special/set', stat: 'perception', value: 3 },
        { type: 'perk/setRank', perkId: 'CenterMasochist', rank: 3 },
      ],
      one
    );
    expect(raised.player.perks).toEqual([{ perkId: 'CenterMasochist', rank: 3 }]);

    // A Legendary SPECIAL card raises the budget too (+1 at rank 1).
    const viaLeggo = run(
      [
        { type: 'perk/add', perkId: 'LegendaryPerception', rank: 1, legendary: true },
        { type: 'perk/setRank', perkId: 'CenterMasochist', rank: 2 },
      ],
      one
    );
    expect(viaLeggo.player.perks).toEqual([{ perkId: 'CenterMasochist', rank: 2 }]);

    const legendaries = run([
      { type: 'perk/add', perkId: 'LegendaryStrength', rank: 1, legendary: true },
      { type: 'perk/add', perkId: 'LegendaryPerception', rank: 1, legendary: true },
      { type: 'perk/add', perkId: 'LegendaryEndurance', rank: 1, legendary: true },
      { type: 'perk/add', perkId: 'LegendaryCharisma', rank: 1, legendary: true },
    ]);
    const fifth = run([{ type: 'perk/add', perkId: 'LegendaryLuck', rank: 1, legendary: true }], legendaries);
    expect(fifth.player.legendaryPerks).toHaveLength(4);
  });

  it('perk add / setRank / remove work across regular and legendary lists', () => {
    const s = run([
      { type: 'special/set', stat: 'perception', value: 3 }, // budget for Center Masochist rank 3
      { type: 'perk/add', perkId: 'CenterMasochist', rank: 1, legendary: false },
      { type: 'perk/add', perkId: 'LegendaryLuck', rank: 2, legendary: true },
      { type: 'perk/add', perkId: 'CenterMasochist', rank: 3, legendary: false }, // duplicate ignored
      { type: 'perk/setRank', perkId: 'CenterMasochist', rank: 3 },
      { type: 'perk/setRank', perkId: 'LegendaryLuck', rank: 4 },
    ]);
    expect(s.player.perks).toEqual([{ perkId: 'CenterMasochist', rank: 3 }]);
    expect(s.player.legendaryPerks).toEqual([{ perkId: 'LegendaryLuck', rank: 4 }]);

    const removed = run(
      [
        { type: 'perk/remove', perkId: 'CenterMasochist' },
        { type: 'perk/remove', perkId: 'LegendaryLuck' },
      ],
      s
    );
    expect(removed.player.perks).toEqual([]);
    expect(removed.player.legendaryPerks).toEqual([]);
  });

  it('mutation/consumable toggles flip membership', () => {
    const on = run([{ type: 'mutation/toggle', id: 'SpeedDemon' }]);
    expect(on.player.mutations).toEqual(['SpeedDemon']);
    expect(run([{ type: 'mutation/toggle', id: 'SpeedDemon' }], on).player.mutations).toEqual([]);
  });

  it('condition/set and enemy/condition patch the right config', () => {
    const s = run([
      { type: 'condition/set', key: 'isSneaking', value: true },
      { type: 'condition/set', key: 'healthPercent', value: 25 },
      { type: 'enemy/condition', key: 'healthPercent', value: 35 },
    ]);
    expect(s.player.conditions.isSneaking).toBe(true);
    expect(s.player.conditions.healthPercent).toBe(25);
    expect(s.enemy.conditions.healthPercent).toBe(35);
  });

  it('build/importNd splits legendary perks by the "0" key prefix, replaces the loadout, merges SPECIAL', () => {
    const before = run([{ type: 'perk/add', perkId: 'OldPerk', rank: 1, legendary: false }]);
    const s = run(
      [
        {
          type: 'build/importNd',
          perks: [
            { key: 'l3', name: 'Bloody Mess', rank: 3 },
            { key: '02', name: 'Legendary Perception', rank: 2 },
          ],
          name: 'My Build',
          special: { strength: 5, perception: 20, endurance: 5, charisma: 5, intelligence: 5, agility: 5, luck: 15 },
        },
      ],
      before
    );
    expect(s.buildName).toBe('My Build');
    expect(s.player.perks.some(p => p.perkId === 'OldPerk')).toBe(false);
    // s= SPECIAL merged, clamped to the 15-per-stat cap.
    expect(s.player.conditions.perception).toBe(15);
    expect(s.player.conditions.luck).toBe(15);
    // one regular + one legendary landed in their lists (join is by N&D key registry)
    expect(s.player.perks.length + s.player.legendaryPerks.length).toBeGreaterThan(0);
  });

  it('build/hydrate replaces state wholesale and is idempotent', () => {
    const target = run([
      { type: 'weapon/select', weaponId: 'w' },
      { type: 'condition/set', key: 'isSneaking', value: true },
      { type: 'view/set', view: { emphasized: 'vats', breakdownOpen: true } },
    ]);
    const hydrated = run([{ type: 'build/hydrate', state: target }]);
    expect(hydrated).toEqual(target);
    expect(run([{ type: 'build/hydrate', state: target }], hydrated)).toEqual(target);
  });
});

describe('body-part mult and race forcing', () => {
  it('weapon/weakpointMult floors at 0.1', () => {
    const s = run([{ type: 'weapon/weakpointMult', value: 0 }]);
    expect(s.player.weakpointMult).toBe(0.1);
    const s2 = run([{ type: 'weapon/weakpointMult', value: 0.15 }]);
    expect(s2.player.weakpointMult).toBe(0.15);
  });

  it('adding a ghoul-only perk forces the ghoul race', () => {
    const s = run([{ type: 'perk/add', perkId: 'GlowingCriticals', rank: 1, legendary: true }]);
    expect(s.player.legendaryPerks.some(p => p.perkId === 'GlowingCriticals')).toBe(true);
    expect(s.player.conditions.isGhoul).toBe(true);
  });

  it('adding an unrestricted perk leaves race alone', () => {
    const s = run([{ type: 'perk/add', perkId: 'Commando', rank: 1, legendary: false }]);
    expect(s.player.conditions.isGhoul).toBe(false);
  });
});
