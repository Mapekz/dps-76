import { describe, it, expect, vi } from 'bun:test';
import {
  makeBuildReducer,
  createDefaultBuildState,
  type BuildAction,
  type BuildState,
} from '@/state/build-reducer';
import type { GeneratedBuff } from '@/types/generated';
// Bun's `vi.mock` factory gets no `importOriginal` argument and is unhoisted,
// so this namespace import is still the real module when the factory below
// runs — it stands in for `importOriginal()`.
import * as actualConsumableRules from '@/lib/consumable-rules';
import { getArmorEffects, MAX_LEGENDARY_COUNT } from '@/data/armor-modifiers';

const buildReducer = makeBuildReducer('live');

function run(actions: BuildAction[], from: BuildState = createDefaultBuildState()): BuildState {
  return actions.reduce(buildReducer, from);
}

// Stubs consumablesById's data source only — keeps the REAL toggleConsumable
// (and every other export) so the reducer exercises the real stacking-rule
// implementation against fixtures that are hermetic against whatever
// scripts/extract currently produces (a concurrent agent is rewriting the
// buff extractor).
vi.mock('@/lib/consumable-rules', () => {
  const chemA: GeneratedBuff = {
    id: 'ChemA',
    formId: '0xC1',
    name: 'Chem A',
    kind: 'consumable',
    modifiers: [],
    notes: [],
    category: 'chem',
  };
  const chemB: GeneratedBuff = {
    id: 'ChemB',
    formId: '0xC2',
    name: 'Chem B',
    kind: 'consumable',
    modifiers: [],
    notes: [],
    category: 'chem',
  };
  const stub = new Map<string, GeneratedBuff>([
    [chemA.id, chemA],
    [chemB.id, chemB],
  ]);
  return { ...actualConsumableRules, consumablesById: () => stub };
});

describe('buildReducer', () => {
  it('weapon/select equips fresh and null unequips', () => {
    const s = run([{ type: 'weapon/select', weaponId: 'CombatRifle_Fixer' }]);
    expect(s.player.weapon).toEqual({
      weaponId: 'CombatRifle_Fixer',
      mods: {},
      legendaryEffects: [],
    });
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
    expect(cleared.player.weapon?.legendaryEffects).toEqual([null, 'leg_b']);
  });

  it('weapon/selectUnique cross-base installs preset with per-slot legendary merge', () => {
    const fromFixer = run([
      { type: 'weapon/select', weaponId: 'CombatRifle_Fixer' },
      {
        type: 'weapon/legendary',
        slotIndex: 0,
        omodId: 'mod_Legendary_Weapon1_Guns_AmmoCapacity4x',
      },
    ]);
    const salt = run(
      [{ type: 'weapon/selectUnique', uniqueId: 'mod_Custom_SaltOfTheEarth' }],
      fromFixer,
    );
    expect(salt.player.weapon?.weaponId).toBe('DoubleBarrelShotgun');
    expect(salt.player.weapon?.mods.ap_customName).toBe('mod_Custom_SaltOfTheEarth');
    expect(salt.player.weapon?.legendaryEffects[0]).toBe(
      'mod_Legendary_Weapon1_Guns_AmmoCapacity4x',
    );
    expect(salt.player.weapon?.legendaryEffects[2]).toBe('mod_Legendary_Weapon3_Guns_ReloadSpeed');
  });

  it('weapon/selectUnique on same base without unique only sets identity slot', () => {
    const bare = run([
      { type: 'weapon/select', weaponId: 'DoubleBarrelShotgun' },
      {
        type: 'weapon/mod',
        slot: 'ap_gun_Barrel',
        omodId: 'mod_DoubleBarrelShotgun_barrel_long_Base',
      },
      {
        type: 'weapon/legendary',
        slotIndex: 0,
        omodId: 'mod_Legendary_Weapon1_Guns_AmmoCapacity4x',
      },
    ]);
    const salt = run(
      [{ type: 'weapon/selectUnique', uniqueId: 'mod_Custom_SaltOfTheEarth' }],
      bare,
    );
    expect(salt.player.weapon?.mods.ap_gun_Barrel).toBe('mod_DoubleBarrelShotgun_barrel_long_Base');
    expect(salt.player.weapon?.mods.ap_customName).toBe('mod_Custom_SaltOfTheEarth');
    expect(salt.player.weapon?.legendaryEffects[0]).toBe(
      'mod_Legendary_Weapon1_Guns_AmmoCapacity4x',
    );
  });

  it('weapon/selectUnique same-base different unique applies full preset', () => {
    const cold = run([
      { type: 'weapon/selectUnique', uniqueId: 'mod_custom_Coldshoulder_DmgvsCryptid' },
    ]);
    const salt = run(
      [{ type: 'weapon/selectUnique', uniqueId: 'mod_Custom_SaltOfTheEarth' }],
      cold,
    );
    expect(salt.player.weapon?.mods.ap_customName).toBe('mod_Custom_SaltOfTheEarth');
    expect(salt.player.weapon?.mods.ap_gun_Receiver).toBe(
      'mod_DoubleBarrelShotgun_Receiver_FastTrigger-HipAccuracy',
    );
    expect(salt.player.weapon?.legendaryEffects[2]).toBe('mod_Legendary_Weapon3_Guns_ReloadSpeed');
  });

  it('weapon/selectUnique re-select is a no-op', () => {
    const equipped = run([{ type: 'weapon/selectUnique', uniqueId: 'mod_Custom_SaltOfTheEarth' }]);
    const again = run(
      [{ type: 'weapon/selectUnique', uniqueId: 'mod_Custom_SaltOfTheEarth' }],
      equipped,
    );
    expect(again).toBe(equipped);
  });

  it('clamps itemLevel to 1–50', () => {
    expect(run([{ type: 'weapon/itemLevel', value: 99 }]).player.itemLevel).toBe(50);
    expect(run([{ type: 'weapon/itemLevel', value: 0 }]).player.itemLevel).toBe(1);
  });

  it('special/set clamps to 1–15 and refuses raises past the 56-point pool', () => {
    // Fresh build starts at 1 across the board.
    expect(createDefaultBuildState().player.conditions.strength).toBe(1);
    expect(run([{ type: 'special/set', stat: 'luck', value: 33 }]).player.conditions.luck).toBe(15);
    expect(
      run([{ type: 'special/set', stat: 'strength', value: -1 }]).player.conditions.strength,
    ).toBe(1);

    // All stats at 8 = exactly 56 allocated; any further raise is refused.
    const maxedPool = run(
      (
        [
          'strength',
          'perception',
          'endurance',
          'charisma',
          'intelligence',
          'agility',
          'luck',
        ] as const
      ).map((stat) => ({
        type: 'special/set' as const,
        stat,
        value: 8,
      })),
    );
    const refused = run([{ type: 'special/set', stat: 'luck', value: 9 }], maxedPool);
    expect(refused).toBe(maxedPool);
    // Lowering is always allowed.
    expect(
      run([{ type: 'special/set', stat: 'luck', value: 3 }], maxedPool).player.conditions.luck,
    ).toBe(3);
  });

  it('blocks card slotting past min(15, base + Legendary SPECIAL bonus) and past the 6 legendary slots', () => {
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
      one,
    );
    expect(raised.player.perks).toEqual([{ perkId: 'CenterMasochist', rank: 3 }]);

    // A Legendary SPECIAL card raises the budget too (+1 at rank 1).
    const viaLeggo = run(
      [
        { type: 'perk/add', perkId: 'LegendaryPerception', rank: 1, legendary: true },
        { type: 'perk/setRank', perkId: 'CenterMasochist', rank: 2 },
      ],
      one,
    );
    expect(viaLeggo.player.perks).toEqual([{ perkId: 'CenterMasochist', rank: 2 }]);

    const legendaries = run([
      { type: 'perk/add', perkId: 'LegendaryStrength', rank: 1, legendary: true },
      { type: 'perk/add', perkId: 'LegendaryPerception', rank: 1, legendary: true },
      { type: 'perk/add', perkId: 'LegendaryEndurance', rank: 1, legendary: true },
      { type: 'perk/add', perkId: 'LegendaryCharisma', rank: 1, legendary: true },
      { type: 'perk/add', perkId: 'LegendaryIntelligence', rank: 1, legendary: true },
      { type: 'perk/add', perkId: 'LegendaryAgility', rank: 1, legendary: true },
    ]);
    const seventh = run(
      [{ type: 'perk/add', perkId: 'LegendaryLuck', rank: 1, legendary: true }],
      legendaries,
    );
    expect(seventh.player.legendaryPerks).toHaveLength(6);
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
      s,
    );
    expect(removed.player.perks).toEqual([]);
    expect(removed.player.legendaryPerks).toEqual([]);
  });

  it('mutation/consumable toggles flip membership', () => {
    const on = run([{ type: 'mutation/toggle', id: 'SpeedDemon' }]);
    expect(on.player.mutations).toEqual(['SpeedDemon']);
    expect(run([{ type: 'mutation/toggle', id: 'SpeedDemon' }], on).player.mutations).toEqual([]);
  });

  it('Carnivore ↔ Herbivore are mutually exclusive (selecting one evicts the other)', () => {
    const carn = run([{ type: 'mutation/toggle', id: 'Mutation_Carnivore' }]);
    expect(carn.player.mutations).toEqual(['Mutation_Carnivore']);
    const herb = run([{ type: 'mutation/toggle', id: 'Mutation_Herbivore' }], carn);
    expect(herb.player.mutations).toEqual(['Mutation_Herbivore']);
    // Toggling the active one OFF does not resurrect the evicted twin.
    expect(
      run([{ type: 'mutation/toggle', id: 'Mutation_Herbivore' }], herb).player.mutations,
    ).toEqual([]);
  });

  it('consumable/toggle enforces stacking rules (auto-displaces a colliding chem)', () => {
    const withA = run([{ type: 'consumable/toggle', id: 'ChemA' }]);
    expect(withA.player.consumables).toEqual(['ChemA']);
    const withB = run([{ type: 'consumable/toggle', id: 'ChemB' }], withA);
    expect(withB.player.consumables).toEqual(['ChemB']); // ChemA auto-displaced
    const removed = run([{ type: 'consumable/toggle', id: 'ChemB' }], withB);
    expect(removed.player.consumables).toEqual([]); // active id: plain removal
  });

  it('addiction/toggle flips membership, independent of consumable selection', () => {
    const on = run([{ type: 'addiction/toggle', id: 'AbAddictionX' }]);
    expect(on.player.addictions).toEqual(['AbAddictionX']);
    expect(run([{ type: 'addiction/toggle', id: 'AbAddictionX' }], on).player.addictions).toEqual(
      [],
    );
  });

  it('condition/set and enemy/condition patch the right config', () => {
    const s = run([
      { type: 'condition/set', key: 'isSneaking', value: true },
      { type: 'condition/set', key: 'healthPercent', value: 25 },
      { type: 'enemy/condition', key: 'healthPercent', value: 35 },
    ]);
    expect(s.player.conditions.isSneaking).toBe(true);
    expect(s.player.conditions.healthPercent).toBe(20);
    expect(s.enemy.conditions.healthPercent).toBe(40);
  });

  it('build/importNd splits legendary perks by N&D key, replaces the loadout, merges SPECIAL', () => {
    const before = run([{ type: 'perk/add', perkId: 'OldPerk', rank: 1, legendary: false }]);
    const s = run(
      [
        {
          type: 'build/importNd',
          perks: [
            { key: 'l3', name: 'BloodyMess', rank: 3 },
            { key: 'xp', name: 'TakingOneForTheTeam', rank: 2 },
            { key: '01', name: 'RadSpecialist', rank: 1 }, // ghoul card — regular, not legendary
          ],
          name: 'My Build',
          special: {
            strength: 5,
            perception: 20,
            endurance: 5,
            charisma: 5,
            intelligence: 5,
            agility: 5,
            luck: 15,
          },
          isGhoul: true, // RadSpecialist (key '01') is ghoul-only — Human would prune it
        },
      ],
      before,
    );
    expect(s.buildName).toBe('My Build');
    expect(s.player.perks.some((p) => p.perkId === 'OldPerk')).toBe(false);
    // s= SPECIAL merged, clamped to the 15-per-stat cap.
    expect(s.player.conditions.perception).toBe(15);
    expect(s.player.conditions.luck).toBe(15);
    expect(s.player.perks).toEqual([
      { perkId: 'BloodyMess', rank: 3 },
      { perkId: 'RadSpecialist', rank: 1 },
    ]);
    expect(s.player.legendaryPerks).toEqual([{ perkId: 'TakingOneForTheTeam', rank: 2 }]);
  });

  it('build/importNd sets race from the caller-resolved isGhoul and prunes perks that no longer fit', () => {
    const s = run([
      {
        type: 'build/importNd',
        perks: [{ key: '0n', name: 'GlowingCriticals', rank: 1 }],
        name: null,
        special: null,
        isGhoul: true,
      },
    ]);
    expect(s.player.perks.some((p) => p.perkId === 'GlowingCriticals')).toBe(true);
    expect(s.player.conditions.isGhoul).toBe(true);

    // A mixed-race (invalid) link imported as Human drops the ghoul-only card.
    const mixed = run([
      {
        type: 'build/importNd',
        perks: [
          { key: '2f', name: 'QuickHands', rank: 1 },
          { key: '0n', name: 'GlowingCriticals', rank: 1 },
        ],
        name: null,
        special: null,
        isGhoul: false,
      },
    ]);
    expect(mixed.player.conditions.isGhoul).toBe(false);
    expect(mixed.player.perks).toEqual([{ perkId: 'QuickHands', rank: 1 }]);
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

  it('weapon/chargeTime sets the value, floors at 0, and is not upper-clamped (OMODs can extend the window)', () => {
    expect(createDefaultBuildState().player.chargeTimeSec).toBeUndefined();
    const s = run([{ type: 'weapon/chargeTime', value: 1.5 }]);
    expect(s.player.chargeTimeSec).toBe(1.5);
    const negative = run([{ type: 'weapon/chargeTime', value: -1 }]);
    expect(negative.player.chargeTimeSec).toBe(0);
    // No upper bound in the reducer — the engine clamps against the
    // effective (OMOD-extended) fullPowerSeconds instead.
    const huge = run([{ type: 'weapon/chargeTime', value: 999 }]);
    expect(huge.player.chargeTimeSec).toBe(999);
  });

  it('weapon/select resets chargeTimeSec to undefined (new weapon defaults to full charge)', () => {
    const charged = run([{ type: 'weapon/chargeTime', value: 1.5 }]);
    const reselected = run([{ type: 'weapon/select', weaponId: 'w' }], charged);
    expect(reselected.player.chargeTimeSec).toBeUndefined();
  });

  it('rejects adding a ghoul-only perk while Human is selected (state unchanged)', () => {
    // Fresh builds start Human. Ghoul cards are regular SPECIAL-slotted perks (not legendary).
    const s = run([{ type: 'perk/add', perkId: 'GlowingCriticals', rank: 1, legendary: false }]);
    expect(s.player.perks.some((p) => p.perkId === 'GlowingCriticals')).toBe(false);
    expect(s.player.conditions.isGhoul).toBe(false);
  });

  it('adds a ghoul-only perk once the race is already Ghoul', () => {
    const asGhoul = run([{ type: 'race/set', isGhoul: true }]);
    const s = run(
      [{ type: 'perk/add', perkId: 'GlowingCriticals', rank: 1, legendary: false }],
      asGhoul,
    );
    expect(s.player.perks.some((p) => p.perkId === 'GlowingCriticals')).toBe(true);
  });

  it('adding an unrestricted perk leaves race alone', () => {
    const s = run([{ type: 'perk/add', perkId: 'Commando', rank: 1, legendary: false }]);
    expect(s.player.conditions.isGhoul).toBe(false);
  });

  it('race/set switches race and prunes equipped perks locked to the old race', () => {
    const withHumanPerk = run([
      { type: 'race/set', isGhoul: false },
      { type: 'perk/add', perkId: 'QuickHands', rank: 1, legendary: false },
    ]);
    expect(withHumanPerk.player.perks).toEqual([{ perkId: 'QuickHands', rank: 1 }]);

    const switched = run([{ type: 'race/set', isGhoul: true }], withHumanPerk);
    expect(switched.player.conditions.isGhoul).toBe(true);
    expect(switched.player.perks).toEqual([]); // Quick Hands (human-only) pruned

    const back = run([{ type: 'race/set', isGhoul: false }], switched);
    expect(back.player.conditions.isGhoul).toBe(false);
  });

  it('race/set to Ghoul resets Health % to 100 (low-HP builds rely on Rads, which Ghouls convert to Glow instead)', () => {
    const lowHealth = run([{ type: 'condition/set', key: 'healthPercent', value: 20 }]);
    expect(lowHealth.player.conditions.healthPercent).toBe(20);

    const asGhoul = run([{ type: 'race/set', isGhoul: true }], lowHealth);
    expect(asGhoul.player.conditions.healthPercent).toBe(100);
  });

  it('race/set to Human leaves Health % untouched', () => {
    const lowHealthGhoul = run(
      [{ type: 'condition/set', key: 'healthPercent', value: 40 }],
      run([{ type: 'race/set', isGhoul: true }]),
    );
    const backToHuman = run([{ type: 'race/set', isGhoul: false }], lowHealthGhoul);
    expect(backToHuman.player.conditions.healthPercent).toBe(40);
  });

  it('build/importNd as Ghoul resets Health % to 100', () => {
    const lowHealth = run([{ type: 'condition/set', key: 'healthPercent', value: 20 }]);
    const imported = run(
      [{ type: 'build/importNd', perks: [], name: null, special: null, isGhoul: true }],
      lowHealth,
    );
    expect(imported.player.conditions.healthPercent).toBe(100);
  });

  it('build/importNd as Human leaves Health % untouched', () => {
    const lowHealth = run([{ type: 'condition/set', key: 'healthPercent', value: 20 }]);
    const imported = run(
      [{ type: 'build/importNd', perks: [], name: null, special: null, isGhoul: false }],
      lowHealth,
    );
    expect(imported.player.conditions.healthPercent).toBe(20);
  });

  it('race/set leaves unrestricted perks equipped across the switch', () => {
    const s = run([
      { type: 'perk/add', perkId: 'Commando', rank: 1, legendary: false },
      { type: 'race/set', isGhoul: true },
    ]);
    expect(s.player.perks).toEqual([{ perkId: 'Commando', rank: 1 }]);
  });
});

describe('armorEffect/setCount: per-star-tier budget', () => {
  // Both 4★: mod_Legendary_Armor4_BattleLoaders and mod_Legendary_Armor4_LimitBreak
  // (src/data/__tests__/armor-modifiers.test.ts pins the same pair/tier).
  const BATTLE_LOADERS = 'mod_Legendary_Armor4_BattleLoaders';
  const LIMIT_BREAKING = 'mod_Legendary_Armor4_LimitBreak';

  it("clamps an incoming count to the tier's remaining budget, leaving the other effect's stored count untouched", () => {
    const s = run([
      { type: 'armorEffect/setCount', id: BATTLE_LOADERS, count: 3 },
      { type: 'armorEffect/setCount', id: LIMIT_BREAKING, count: 5 },
    ]);
    // Tier 4 budget is MAX_LEGENDARY_COUNT (5); Battle-Loader's already holds
    // 3, so Limit-Breaking is clamped to the remaining 2.
    expect(s.player.armorEffects[LIMIT_BREAKING]).toBe(MAX_LEGENDARY_COUNT - 3);
    expect(s.player.armorEffects[BATTLE_LOADERS]).toBe(3);
  });

  it('swap order is never blocked: lowering one effect first always frees room for raising the other', () => {
    // Tier is full: 3 + 2 = MAX_LEGENDARY_COUNT.
    const full = run([
      { type: 'armorEffect/setCount', id: BATTLE_LOADERS, count: 3 },
      { type: 'armorEffect/setCount', id: LIMIT_BREAKING, count: 2 },
    ]);
    expect(full.player.armorEffects).toEqual({ [BATTLE_LOADERS]: 3, [LIMIT_BREAKING]: 2 });

    const swapped = run(
      [
        { type: 'armorEffect/setCount', id: BATTLE_LOADERS, count: 1 },
        { type: 'armorEffect/setCount', id: LIMIT_BREAKING, count: 4 },
      ],
      full,
    );
    expect(swapped.player.armorEffects).toEqual({ [BATTLE_LOADERS]: 1, [LIMIT_BREAKING]: 4 });
  });

  it("raising an effect's own count within its own tier space works when it alone occupies the tier", () => {
    const s = run([
      { type: 'armorEffect/setCount', id: BATTLE_LOADERS, count: 3 },
      { type: 'armorEffect/setCount', id: BATTLE_LOADERS, count: 5 },
    ]);
    expect(s.player.armorEffects[BATTLE_LOADERS]).toBe(5);
  });

  it('a misc effect (no starTier) is unaffected by legendary tier occupancy, even with the tier full', () => {
    const misc = getArmorEffects('live').find((e) => e.group === 'misc' && e.maxCount > 1);
    if (!misc)
      throw new Error('expected a misc armor effect with maxCount > 1 in the live dataset');

    const full = run([
      { type: 'armorEffect/setCount', id: BATTLE_LOADERS, count: MAX_LEGENDARY_COUNT },
    ]);
    expect(full.player.armorEffects[BATTLE_LOADERS]).toBe(MAX_LEGENDARY_COUNT);

    const s = run([{ type: 'armorEffect/setCount', id: misc.id, count: misc.maxCount }], full);
    expect(s.player.armorEffects[misc.id]).toBe(misc.maxCount);
    expect(s.player.armorEffects[BATTLE_LOADERS]).toBe(MAX_LEGENDARY_COUNT); // untouched
  });
});

describe('armorEffect/setCount: piece slot exclusivity', () => {
  const DEEP_POCKETED = 'DLC03_mod_armor_Marine_Lining_Limb_ImprovedCarryCapacity2';
  const BODY_JETPACK = 'mod_armor_BOSInfantry_JetPack';
  const PA_JETPACK = 'mod_PowerArmor_Hellcat_Torso_Misc_JetPack';
  const EMERGENCY_PROTOCOLS = 'mod_PowerArmor_Excavator_Torso_Misc_Emergency';

  it('Jetpack=1 caps Deep Pocketed at 4 on setCount', () => {
    const s = run([
      { type: 'armorEffect/setCount', id: BODY_JETPACK, count: 1 },
      { type: 'armorEffect/setCount', id: DEEP_POCKETED, count: 5 },
    ]);
    expect(s.player.armorEffects[DEEP_POCKETED]).toBe(4);
  });

  it('Emergency Protocols=1 blocks Jet Pack entirely', () => {
    const s = run([
      { type: 'armorEffect/setCount', id: EMERGENCY_PROTOCOLS, count: 1 },
      { type: 'armorEffect/setCount', id: PA_JETPACK, count: 1 },
    ]);
    expect(s.player.armorEffects[EMERGENCY_PROTOCOLS]).toBe(1);
    expect(s.player.armorEffects[PA_JETPACK]).toBeUndefined();
  });
});

describe('armorType/set', () => {
  const UNYIELDING = 'mod_Legendary_Armor1_LowHealthIncreasesStats';
  const PROPPELLING = 'mod_Legendary_PowerArmor4_Propelling';
  const CASUAL_STYLE = 'mod_armor_UnderArmor_style_Casual';

  it('flips the condition and prunes mismatched effects; both-type effects survive', () => {
    const s = run([
      { type: 'armorEffect/setCount', id: UNYIELDING, count: 3 },
      { type: 'armorEffect/setCount', id: PROPPELLING, count: 2 },
      { type: 'armorEffect/setCount', id: CASUAL_STYLE, count: 1 },
      { type: 'armorType/set', armorWorn: 'power' },
    ]);
    expect(s.player.conditions.isInPowerArmor).toBe(true);
    expect(s.player.conditions.armorWorn).toBe('power');
    expect(s.player.armorEffects[UNYIELDING]).toBeUndefined();
    expect(s.player.armorEffects[PROPPELLING]).toBe(2);
    expect(s.player.armorEffects[CASUAL_STYLE]).toBe(1);
  });

  it('plain condition/set on isInPowerArmor does not prune armor effects', () => {
    const s = run([
      { type: 'armorEffect/setCount', id: UNYIELDING, count: 3 },
      { type: 'condition/set', key: 'isInPowerArmor', value: true },
    ]);
    expect(s.player.conditions.isInPowerArmor).toBe(true);
    expect(s.player.armorEffects[UNYIELDING]).toBe(3);
  });

  it("armorWorn 'none' clears every armor effect and leaves isInPowerArmor false", () => {
    const s = run([
      { type: 'armorEffect/setCount', id: UNYIELDING, count: 3 },
      { type: 'armorEffect/setCount', id: PROPPELLING, count: 2 },
      { type: 'armorEffect/setCount', id: CASUAL_STYLE, count: 1 },
      { type: 'armorType/set', armorWorn: 'none' },
    ]);
    expect(s.player.conditions.armorWorn).toBe('none');
    expect(s.player.conditions.isInPowerArmor).toBe(false);
    expect(s.player.armorEffects).toEqual({});
  });
});

describe('view/set slice identity', () => {
  // useSuggestions keys its recompute effect on state.player/state.enemy
  // reference identity — a UI-only view/set (breakdown toggle, emphasis
  // switch) must not produce fresh player/enemy objects or the panel
  // re-sweeps and dims on pure UI churn.
  it('preserves player and enemy references across a view-only update', () => {
    const s0 = createDefaultBuildState();
    const s1 = buildReducer(s0, { type: 'view/set', view: { breakdownOpen: true } });
    expect(s1).not.toBe(s0);
    expect(s1.player).toBe(s0.player);
    expect(s1.enemy).toBe(s0.enemy);
  });
});
