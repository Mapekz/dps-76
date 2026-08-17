import { describe, it, expect, vi } from 'bun:test';
import { getPerks } from '@/data';
import perksDictionary from '@/data/wire-dictionary/perks.json';
import { decodeBuild, encodeBuild } from '@/lib/persist/codec';
import { BitWriter } from '@/lib/persist/bitstream';
import {
  writeAddictions,
  writeArmorEffects,
  writeBuildName,
  writeConsumables,
  writeEnemyConditions,
  writeLegendaryPerks,
  writeMutations,
  writePerks,
  writePlayerConditions,
  writeView,
  writeWeapon,
} from '@/lib/persist/wire-sections';
import { normalizeBuildState } from '@/lib/build-rules';
import { reclassifyPerkLoadouts } from '@/lib/nukes-dragons';
import { nukesDragonsPerks } from '@/lib/nukes-dragons';
import {
  makeBuildReducer,
  createDefaultBuildState,
  type BuildAction,
  type BuildState,
} from '@/state/build-reducer';
import { createDefaultPlayerInput, createDefaultEnemyConditions } from '@/types';
import { buildDelta } from '@/lib/build-delta';
import type { GeneratedAddiction, GeneratedBuff } from '@/types/generated';
// Bun's `vi.mock` factory gets no `importOriginal` argument and is unhoisted,
// so this namespace import is still the real module when the factory below
// runs — it stands in for `importOriginal()`.
import * as actualBuffs from '@/data/buffs';

const mode = 'live' as const;
const buildReducer = makeBuildReducer(mode);

function stateFrom(actions: BuildAction[]) {
  return actions.reduce(buildReducer, createDefaultBuildState());
}

// A real N&D key → PerkId pair to exercise the dictionary path.
const [ndKey, ndPerkId] = Object.entries(nukesDragonsPerks).find(([k]) => !k.startsWith('0'))!;
void ndKey;

// Synthetic consumable/addiction fixtures — hermetic against whatever
// scripts/extract currently produces for consumables.json/addictions.json (a
// concurrent agent is rewriting the buff extractor). Mocking '@/data/buffs'
// also makes src/lib/consumable-rules.ts's consumablesById() (which reads
// getConsumables from this same module) resolve against these fixtures.
const testChemA: GeneratedBuff = {
  id: 'TestChemA',
  formId: '0xC1',
  name: 'Test Chem A',
  kind: 'consumable',
  modifiers: [],
  notes: [],
  category: 'chem',
};
const testChemB: GeneratedBuff = {
  id: 'TestChemB',
  formId: '0xC2',
  name: 'Test Chem B',
  kind: 'consumable',
  modifiers: [],
  notes: [],
  category: 'chem',
};
const testAddiction: GeneratedAddiction = {
  id: 'TestAddictionX',
  formId: '0xA1',
  name: 'Test Addiction X',
  causedBy: ['TestChemA'],
  modifiers: [],
  notes: [],
};

const realGetConsumables = actualBuffs.getConsumables;
const realGetAddictions = actualBuffs.getAddictions;

vi.mock('@/data/buffs', () => ({
  ...actualBuffs,
  getConsumables: (m: Parameters<typeof realGetConsumables>[0]) => {
    const heavyIds = new Set(['Buffout', 'Psycho', 'Fury', 'Overdrive', 'Med-X']);
    const fromReal = realGetConsumables(m).filter((c) => heavyIds.has(c.id));
    return [...fromReal, testChemA, testChemB];
  },
  getAddictions: (m: Parameters<typeof realGetAddictions>[0]) => {
    const fromReal = realGetAddictions(m).filter((a) => a.id === 'AbAddictionPsycho');
    return [...fromReal, testAddiction];
  },
}));

function payloadBytes(encoded: string): Uint8Array {
  const firstDot = encoded.indexOf('.');
  const secondDot = encoded.indexOf('.', firstDot + 1);
  const payload = encoded.slice(secondDot + 1);
  const bin = atob(payload.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function packStateBytes(state: BuildState): Uint8Array {
  const w = new BitWriter();
  const { player, enemy, buildName, view } = state;
  writeWeapon(w, player.weapon, player);
  writePerks(w, player.perks);
  writeLegendaryPerks(w, player.legendaryPerks);
  writeMutations(w, player.mutations);
  writeAddictions(w, player.addictions);
  writeConsumables(w, player.consumables);
  writeArmorEffects(w, player.armorEffects);
  writePlayerConditions(w, player.conditions);
  writeEnemyConditions(w, enemy.conditions);
  writeBuildName(w, buildName);
  writeView(w, view);
  return w.toBytes();
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(
    await new Response(
      new Blob([bytes as Uint8Array<ArrayBuffer>])
        .stream()
        .pipeThrough(new CompressionStream('deflate-raw')),
    ).arrayBuffer(),
  );
}

function prepareHeavyBuild(): BuildState {
  const raw = buildHeavyBuild();
  const reclassified = reclassifyPerkLoadouts(raw.player.perks, raw.player.legendaryPerks);
  raw.player.perks = reclassified.perks;
  raw.player.legendaryPerks = reclassified.legendaryPerks;
  return normalizeBuildState(mode, raw).state;
}

function buildHeavyBuild(): BuildState {
  const perkIds = Object.keys(perksDictionary.ids).slice(0, 46);
  const perks = perkIds.map((perkId, i) => ({
    perkId,
    rank: Math.max(
      1,
      (i % getPerks(mode)[perkId as keyof ReturnType<typeof getPerks>].maxRank) + 1,
    ),
  }));

  const state = createDefaultBuildState();
  state.buildName = 'Heavy Fixer Commando';
  state.view = { emphasized: 'vats', breakdownOpen: true };
  state.player.perks = perks;
  for (const stat of [
    'strength',
    'perception',
    'endurance',
    'charisma',
    'intelligence',
    'agility',
    'luck',
  ] as const) {
    state.player.conditions[stat] = 8;
  }
  state.player.mutations = [
    'Mutation_Marsupial',
    'Mutation_SpeedDemon',
    'Mutation_AdrenalReaction',
    'Mutation_EagleEyes',
    'Mutation_HerdMentality',
    'Mutation_ScalySkin',
  ];
  state.player.consumables = ['Buffout', 'Psycho', 'Fury', 'Overdrive', 'Med-X'];
  state.player.armorEffects = {
    mod_Legendary_Armor4_LimitBreak: 5,
    mod_Legendary_Armor4_BattleLoaders: 3,
    mod_Legendary_Armor2_StatStrength: 5,
    mod_armor_UnderArmor_style_standard: 1,
    mod_Legendary_Armor3_Healthy: 2,
    mod_Legendary_Armor1_LowHealthIncreasesStats: 1,
    mod_Legendary_Armor4_Bruiser: 1,
    mod_Legendary_Armor4_Ranger: 1,
  };
  Object.assign(state.player.conditions, {
    isSneaking: true,
    healthPercent: 20,
    killStreak: 5,
    capsOnHand: 5000,
    strength: 8,
    perception: 8,
    endurance: 7,
    charisma: 6,
    intelligence: 5,
    agility: 4,
    luck: 3,
    tenderizerStacks: 500,
    concentratedFireStacks: 10,
    foodTier: 3,
    drinkTier: 4,
    bodyPartHitRatePct: 80,
    teammateCount: 2,
    publicTeamType: 'casual',
  });
  state.player.weapon = {
    weaponId: 'CombatRifle_Fixer',
    mods: {
      ap_gun_Receiver: 'mod_CombatRifle_Receiver_Automatic',
      ap_gun_Barrel: 'mod_CombatRifle_Barrel_Long_Recoil',
      ap_gun_Mag: 'mod_CombatRifle_Magazine_Reload',
      ap_gun_Grip: 'mod_CombatRifle_Grip_Recoil',
      ap_gun_Receiver2: 'mod_CombatRifle_Receiver_HipAccuracy',
      ap_gun_Barrel2: 'mod_CombatRifle_Barrel_Short_Recoil',
      ap_gun_Mag2: 'mod_CombatRifle_Magazine_ArmorPen',
    },
    legendaryEffects: [
      'mod_Legendary_Weapon1_DamageFirstBlood',
      'mod_Legendary_Weapon2_Guns_RoF',
      'mod_Legendary_Weapon3_Guns_ReloadSpeed',
      'mod_Legendary_Weapon4_Encirclers',
    ],
  };
  Object.assign(state.enemy.conditions, {
    isBurning: true,
    isBleeding: true,
    isFrozen: true,
    healthPercent: 40,
    groupTargetCount: 2,
    targetDistance: 900,
    targetLevel: 50,
  });
  return state;
}

describe('build codec', () => {
  it('round-trips the default state', async () => {
    const state = createDefaultBuildState();
    const decoded = await decodeBuild(await encodeBuild(state, mode), mode);
    expect(decoded).not.toBeNull();
    expect(decoded!.state).toEqual(state);
    expect(decoded!.warnings).toEqual([]);
  });

  it('round-trips a maxed realistic build', async () => {
    const state = stateFrom([
      { type: 'weapon/select', weaponId: 'CombatRifle_Fixer' },
      {
        type: 'weapon/mod',
        slot: 'ap_gun_Receiver',
        omodId: 'mod_CombatRifle_Receiver_Damage-Auto',
      },
      { type: 'weapon/itemLevel', value: 45 },
      { type: 'weapon/weakpointMult', value: 2.5 },
      // Raise every stat to 8 (56 = exactly the pool) so any rank-3 card fits its stat's budget.
      ...(
        [
          'strength',
          'perception',
          'endurance',
          'charisma',
          'intelligence',
          'agility',
          'luck',
        ] as const
      ).map((stat) => ({ type: 'special/set' as const, stat, value: 8 })),
      { type: 'perk/add', perkId: ndPerkId, rank: 3, legendary: false },
      { type: 'condition/set', key: 'isSneaking', value: true },
      { type: 'condition/set', key: 'healthPercent', value: 20 },
      { type: 'enemy/condition', key: 'isBurning', value: true },
      { type: 'view/set', view: { emphasized: 'vats', breakdownOpen: true } },
      {
        type: 'build/importNd',
        perks: [],
        name: 'Bloodied Commando',
        special: null,
        isGhoul: false,
      },
    ]);
    const decoded = await decodeBuild(await encodeBuild(state, mode), mode);
    expect(decoded).not.toBeNull();
    // importNd with [] cleared perks; re-check the state actually round-trips.
    expect(decoded!.state).toEqual(state);
    expect(decoded!.warnings).toEqual([]);
  });

  it('preserves positional legendary gaps for equipped uniques (Salt Swift at ★3)', async () => {
    const state = stateFrom([
      { type: 'weapon/selectUnique', uniqueId: 'mod_Custom_SaltOfTheEarth' },
    ]);
    expect(state.player.weapon?.legendaryEffects).toEqual([
      null,
      null,
      'mod_Legendary_Weapon3_Guns_ReloadSpeed',
    ]);
    const decoded = await decodeBuild(await encodeBuild(state, mode), mode);
    expect(decoded!.state.player.weapon?.legendaryEffects).toEqual([
      null,
      null,
      'mod_Legendary_Weapon3_Guns_ReloadSpeed',
    ]);
  });

  it('round-trips perks through the wire dictionary', async () => {
    const state = stateFrom([
      ...(
        [
          'strength',
          'perception',
          'endurance',
          'charisma',
          'intelligence',
          'agility',
          'luck',
        ] as const
      ).map((stat) => ({ type: 'special/set' as const, stat, value: 8 })),
      { type: 'perk/add', perkId: ndPerkId, rank: 2, legendary: false },
    ]);
    const encoded = await encodeBuild(state, mode);
    const decoded = await decodeBuild(encoded, mode);
    expect(decoded!.state.player.perks).toEqual([{ perkId: ndPerkId, rank: 2 }]);
  });

  it('silently clamps an out-of-range rank to the card maxRank on encode', async () => {
    const state = createDefaultBuildState();
    state.player.perks = [{ perkId: 'Tenderizer', rank: 99 }];
    const decoded = await decodeBuild(await encodeBuild(state, mode), mode);
    expect(decoded).not.toBeNull();
    expect(decoded!.state.player.perks).toEqual([{ perkId: 'Tenderizer', rank: 1 }]);
    expect(decoded!.warnings).toEqual([]);
  });

  it('returns null for corrupt or foreign input', async () => {
    expect(await decodeBuild('garbage', mode)).toBeNull();
    expect(await decodeBuild('1.not-base64!!!', mode)).toBeNull();
    expect(await decodeBuild('9.' + 'AAAA', mode)).toBeNull(); // unknown version
    expect(await decodeBuild('2.fixer.not-valid-base64!!!', mode)).toBeNull(); // corrupt payload
    expect(await decodeBuild('', mode)).toBeNull();
  });

  it('drops unknown weapon/omod/mutation ids with warnings instead of throwing', async () => {
    const state = stateFrom([{ type: 'weapon/select', weaponId: 'CombatRifle_Fixer' }]);
    state.player.weapon!.mods['ap_gun_Receiver'] = 'mod_DoesNotExist';
    state.player.mutations = ['NotARealMutation'];
    const decoded = await decodeBuild(await encodeBuild(state, mode), mode);
    expect(decoded).not.toBeNull();
    expect(decoded!.state.player.weapon?.weaponId).toBe('CombatRifle_Fixer');
    expect(decoded!.state.player.weapon?.mods['ap_gun_Receiver']).toBeUndefined();
    expect(decoded!.state.player.mutations).toEqual([]);
    expect(decoded!.warnings.length).toBeGreaterThanOrEqual(1);
    expect(decoded!.warnings.some((w) => w.includes('weapon mod'))).toBe(true);
  });

  it('clears an unknown weapon entirely, with a warning', async () => {
    const state = stateFrom([{ type: 'weapon/select', weaponId: 'RemovedByPatch' }]);
    const decoded = await decodeBuild(await encodeBuild(state, mode), mode);
    expect(decoded!.state.player.weapon).toBeNull();
    expect(decoded!.warnings).toContain('unknown weapon "RemovedByPatch" — cleared');
  });

  it('round-trips chargeTimeSec when set, and omits it from the wire when undefined', async () => {
    const state = stateFrom([
      { type: 'weapon/select', weaponId: 'CombatRifle_Fixer' },
      { type: 'weapon/chargeTime', value: 1.5 },
    ]);
    const encoded = await encodeBuild(state, mode);
    const decoded = await decodeBuild(encoded, mode);
    expect(decoded!.state.player.chargeTimeSec).toBe(1.5);

    const defaultEncoded = await encodeBuild(createDefaultBuildState(), mode);
    const defaultDecoded = await decodeBuild(defaultEncoded, mode);
    expect(defaultDecoded!.state.player.chargeTimeSec).toBeUndefined();
  });

  it('round-trips the all-default build with no warnings and a near-empty wire', async () => {
    const encoded = await encodeBuild(createDefaultBuildState(), mode);
    const decoded = await decodeBuild(encoded, mode);
    expect(decoded!.warnings).toEqual([]);
    expect(decoded!.state).toEqual(createDefaultBuildState());
    expect(encoded.length).toBeLessThan(20);
  });

  it('non-default conditions survive while defaults are not serialized', async () => {
    const state = stateFrom([{ type: 'condition/set', key: 'tenderizerStacks', value: 500 }]);
    const encoded = await encodeBuild(state, mode);
    const decoded = await decodeBuild(encoded, mode);
    expect(decoded!.state.player.conditions.tenderizerStacks).toBe(500);
    expect(encoded.length).toBeLessThan(80);
  });

  it('round-trips armorWorn none', async () => {
    const state = stateFrom([{ type: 'armorType/set', armorWorn: 'none' }]);
    const decoded = await decodeBuild(await encodeBuild(state, mode), mode);
    expect(decoded!.state.player.conditions.armorWorn).toBe('none');
    expect(decoded!.state.player.conditions.isInPowerArmor).toBe(false);
  });

  it('round-trips a SPECIAL stat set to 15 (regression: the sibling tests above use 8, which happens to differ from both the encode and decode baselines and so could not have caught this)', async () => {
    const state = stateFrom([{ type: 'special/set', stat: 'luck', value: 15 }]);
    const decoded = await decodeBuild(await encodeBuild(state, mode), mode);
    expect(decoded!.state.player.conditions.luck).toBe(15);
    expect(decoded!.warnings).toEqual([]);
  });

  it('round-trips concentratedFireStacks (Phase B — Concentrated Fire stacks)', async () => {
    const state = stateFrom([{ type: 'condition/set', key: 'concentratedFireStacks', value: 15 }]);
    const decoded = await decodeBuild(await encodeBuild(state, mode), mode);
    expect(decoded!.state.player.conditions.concentratedFireStacks).toBe(15);
  });

  it("round-trips battleLoadersBashSec (Phase C — Battle-Loader's bash cost)", async () => {
    const state = stateFrom([{ type: 'condition/set', key: 'battleLoadersBashSec', value: 2 }]);
    const decoded = await decodeBuild(await encodeBuild(state, mode), mode);
    expect(decoded!.state.player.conditions.battleLoadersBashSec).toBe(2);
  });

  it('never emits the larger of the raw and deflated packed bytes', async () => {
    const longName = createDefaultBuildState();
    longName.buildName = 'A'.repeat(200);
    for (const state of [createDefaultBuildState(), prepareHeavyBuild(), longName]) {
      const packed = packStateBytes(state);
      const deflated = await deflateRaw(packed);
      const encoded = await encodeBuild(state, mode);
      const wire = payloadBytes(encoded);
      const bodyLen = wire.length - 1;
      const usesDeflate = (wire[0]! & 1) === 1;
      expect(bodyLen).toBe(Math.min(packed.length, deflated.length));
      expect(usesDeflate).toBe(deflated.length < packed.length);
    }
  });
});

describe('encode/decode baseline symmetry', () => {
  it('the encode delta baseline (createDefaultPlayerInput/createDefaultEnemyConditions) matches the decode seed (createDefaultBuildState) exactly', () => {
    const scalarsOnly = (delta: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(delta).filter(([, v]) => !Array.isArray(v)));
    const defaults = createDefaultBuildState();
    expect(scalarsOnly(buildDelta(defaults.player.conditions, createDefaultPlayerInput()))).toEqual(
      {},
    );
    expect(
      scalarsOnly(buildDelta(defaults.enemy.conditions, createDefaultEnemyConditions())),
    ).toEqual({});
  });
});

describe('derived condition fields', () => {
  it('never serializes derived keys, even when non-default in state', async () => {
    const state = createDefaultBuildState();
    Object.assign(state.player.conditions, {
      strangeInNumbers: true,
      hungerThirstTier: 6,
      maxHealth: 999,
      mutationCount: 5,
      addictionCount: 7,
    });
    const encoded = await encodeBuild(state, mode);
    const decoded = await decodeBuild(encoded, mode);
    const conditions = decoded!.state.player.conditions;
    expect(conditions).not.toHaveProperty('strangeInNumbers');
    expect(conditions).not.toHaveProperty('hungerThirstTier');
    expect(conditions).not.toHaveProperty('maxHealth');
    expect(conditions).not.toHaveProperty('mutationCount');
    expect(conditions).not.toHaveProperty('addictionCount');
  });

  it('new picker/status fields round-trip', async () => {
    const state = stateFrom([
      { type: 'condition/set', key: 'foodTier', value: 3 },
      { type: 'condition/set', key: 'drinkTier', value: 4 },
      { type: 'condition/set', key: 'bodyPartHitRatePct', value: 80 },
      { type: 'enemy/condition', key: 'isBleeding', value: true },
      { type: 'enemy/condition', key: 'isFrozen', value: true },
      { type: 'enemy/condition', key: 'targetRace', value: 'SuperMutantRace' },
      { type: 'enemy/condition', key: 'targetBodyPart', value: 'Head' },
    ]);
    const decoded = await decodeBuild(await encodeBuild(state, mode), mode);
    expect(decoded!.state.player.conditions.foodTier).toBe(3);
    expect(decoded!.state.player.conditions.drinkTier).toBe(4);
    expect(decoded!.state.player.conditions.bodyPartHitRatePct).toBe(80);
    expect(decoded!.state.enemy.conditions.isBleeding).toBe(true);
    expect(decoded!.state.enemy.conditions.isFrozen).toBe(true);
    expect(decoded!.state.enemy.conditions.targetRace).toBe('SuperMutantRace');
    expect(decoded!.state.enemy.conditions.targetBodyPart).toBe('Head');
  });

  it('round-trips the public team type selection (casual/exploration)', async () => {
    for (const publicTeamType of ['casual', 'exploration'] as const) {
      const state = stateFrom([
        { type: 'condition/set', key: 'teammateCount', value: 2 },
        { type: 'condition/set', key: 'publicTeamType', value: publicTeamType },
      ]);
      const decoded = await decodeBuild(await encodeBuild(state, mode), mode);
      expect(decoded!.state.player.conditions.publicTeamType).toBe(publicTeamType);
      expect(decoded!.state.player.conditions.teammateCount).toBe(2);
      expect(decoded!.warnings).toEqual([]);
    }
  });

  it('reclassifies a legacy build that stored a ghoul card under legendaryPerks', async () => {
    const legacy = createDefaultBuildState();
    legacy.player.conditions.isGhoul = true;
    legacy.player.legendaryPerks = [{ perkId: 'RadSpecialist', rank: 1 }];
    const decoded = await decodeBuild(await encodeBuild(legacy, mode), mode);
    expect(decoded!.state.player.legendaryPerks).toEqual([]);
    expect(decoded!.state.player.perks).toEqual([{ perkId: 'RadSpecialist', rank: 1 }]);
    expect(decoded!.warnings.some((w) => w.includes('classification'))).toBe(true);
  });
});

describe('Armor checklist (Phase 3 armor pipeline, UI + state)', () => {
  it('round-trips a mix of stackable and single-slot selections, omitting zero counts', async () => {
    const state = stateFrom([
      { type: 'armorEffect/setCount', id: 'mod_Legendary_Armor4_BattleLoaders', count: 3 },
      { type: 'armorEffect/setCount', id: 'mod_Legendary_Armor2_StatStrength', count: 5 },
      { type: 'armorEffect/setCount', id: 'mod_armor_UnderArmor_style_standard', count: 1 },
    ]);
    const encoded = await encodeBuild(state, mode);
    const decoded = await decodeBuild(encoded, mode);
    expect(decoded!.state.player.armorEffects).toEqual({
      mod_Legendary_Armor4_BattleLoaders: 3,
      mod_Legendary_Armor2_StatStrength: 5,
      mod_armor_UnderArmor_style_standard: 1,
    });
    expect(decoded!.warnings).toEqual([]);
  });

  it('setting a count back to 0 removes the entry rather than serializing a 0', async () => {
    const withEffect = stateFrom([
      { type: 'armorEffect/setCount', id: 'mod_Legendary_Armor3_Healthy', count: 4 },
    ]);
    const cleared = buildReducer(withEffect, {
      type: 'armorEffect/setCount',
      id: 'mod_Legendary_Armor3_Healthy',
      count: 0,
    });
    expect(cleared.player.armorEffects).toEqual({});
    const decoded = await decodeBuild(await encodeBuild(cleared, mode), mode);
    expect(decoded!.state.player.armorEffects).toEqual({});
  });

  it("clamps a count to the effect's maxCount and drops unknown ids with a warning", async () => {
    const state = createDefaultBuildState();
    state.player.armorEffects = {
      mod_Legendary_Armor2_StatStrength: 99,
      mod_armor_UnderArmor_style_standard: 5,
      NotARealArmorEffect: 3,
    };
    const decoded = await decodeBuild(await encodeBuild(state, mode), mode);
    expect(decoded!.state.player.armorEffects).toEqual({
      mod_Legendary_Armor2_StatStrength: 5,
      mod_armor_UnderArmor_style_standard: 1,
    });
    expect(decoded!.warnings.some((w) => w.includes('NotARealArmorEffect'))).toBe(true);
  });

  it('clamps an over-budget star tier on decode: first-encoded effect keeps its count, the second is trimmed, and a warning is surfaced', async () => {
    const state = createDefaultBuildState();
    state.player.armorEffects = {
      mod_Legendary_Armor4_BattleLoaders: 5,
      mod_Legendary_Armor4_LimitBreak: 3,
    };
    const decoded = await decodeBuild(await encodeBuild(state, mode), mode);
    expect(decoded!.state.player.armorEffects).toEqual({
      mod_Legendary_Armor4_BattleLoaders: 5,
    });
    expect(decoded!.warnings.some((w) => w.includes('5-per-star-tier limit'))).toBe(true);
  });

  it('an in-budget star tier round-trips unchanged with no star-tier warning', async () => {
    const state = createDefaultBuildState();
    state.player.armorEffects = {
      mod_Legendary_Armor4_BattleLoaders: 2,
      mod_Legendary_Armor4_LimitBreak: 3,
    };
    const decoded = await decodeBuild(await encodeBuild(state, mode), mode);
    expect(decoded!.state.player.armorEffects).toEqual({
      mod_Legendary_Armor4_BattleLoaders: 2,
      mod_Legendary_Armor4_LimitBreak: 3,
    });
    expect(decoded!.warnings.some((w) => w.includes('star-tier limit'))).toBe(false);
  });

  it('prunes wrong-armor-type effects after decode and clamps piece capacities with warnings', async () => {
    const state = stateFrom([{ type: 'armorType/set', armorWorn: 'power' }]);
    state.player.armorEffects = {
      mod_PowerArmor_Excavator_Torso_Misc_Emergency: 1,
      mod_PowerArmor_Hellcat_Torso_Misc_JetPack: 1,
      mod_Legendary_PowerArmor4_Propelling: 2,
      mod_Legendary_Armor1_LowHealthIncreasesStats: 3,
    };
    const decoded = await decodeBuild(await encodeBuild(state, mode), mode);
    expect(decoded!.state.player.conditions.isInPowerArmor).toBe(true);
    expect(decoded!.state.player.conditions.armorWorn).toBe('power');
    expect(decoded!.state.player.armorEffects).toEqual({
      mod_PowerArmor_Excavator_Torso_Misc_Emergency: 1,
      mod_Legendary_PowerArmor4_Propelling: 2,
    });
    expect(
      decoded!.warnings.some((w) => w.includes('incompatible with the selected armor type')),
    ).toBe(true);
    expect(decoded!.warnings.some((w) => w.includes('piece slots exceeded capacity'))).toBe(true);
  });
});

describe('consumables & addictions (2026-07-13 overhaul, hermetic fixtures)', () => {
  it('round-trips selected addictions', async () => {
    const state = createDefaultBuildState();
    state.player.addictions = ['AbAddictionPsycho'];
    const decoded = await decodeBuild(await encodeBuild(state, mode), mode);
    expect(decoded).not.toBeNull();
    expect(decoded!.state.player.addictions).toEqual(['AbAddictionPsycho']);
    expect(decoded!.warnings).toEqual([]);
  });

  it('drops an unknown addiction id silently on encode (no wire entry to decode)', async () => {
    const state = createDefaultBuildState();
    state.player.addictions = ['NotARealAddiction'];
    const decoded = await decodeBuild(await encodeBuild(state, mode), mode);
    expect(decoded!.state.player.addictions).toEqual([]);
    expect(decoded!.warnings).toEqual([]);
  });

  it('sanitizes a legacy two-chem payload down to one, with a warning', async () => {
    const state = createDefaultBuildState();
    state.player.consumables = ['TestChemA', 'TestChemB'];
    const decoded = await decodeBuild(await encodeBuild(state, mode), mode);
    expect(decoded!.state.player.consumables).toEqual(['TestChemB']);
    expect(decoded!.warnings).toContain(
      "removed to satisfy stacking rules (one chem/alcohol at a time; same-bonus food/drink don't stack)",
    );
  });

  it('a legal single-consumable payload round-trips without a stacking warning', async () => {
    const state = createDefaultBuildState();
    state.player.consumables = ['TestChemA'];
    const decoded = await decodeBuild(await encodeBuild(state, mode), mode);
    expect(decoded!.state.player.consumables).toEqual(['TestChemA']);
    expect(decoded!.warnings).toEqual([]);
  });

  it('clamps crippledLimbCount to the selected race on decode and warns', async () => {
    const state = createDefaultBuildState();
    state.enemy.conditions.targetRace = 'BlueDevilRace';
    state.enemy.conditions.crippledLimbCount = 6;
    const decoded = await decodeBuild(await encodeBuild(state, mode), mode);
    expect(decoded!.state.enemy.conditions.crippledLimbCount).toBe(0);
    expect(decoded!.warnings.some((w) => w.includes('crippled limb count'))).toBe(true);
  });

  it('round-trips a real numeric targetDistance value written by the current app', async () => {
    const state = createDefaultBuildState();
    state.enemy.conditions.targetDistance = 3200;
    const decoded = await decodeBuild(await encodeBuild(state, mode), mode);
    expect(decoded!.state.enemy.conditions.targetDistance).toBe(3200);
    expect(decoded!.warnings).toEqual([]);
  });
});

describe('v2 size budget', () => {
  it('keeps a realistic heavy build under 300 chars and round-trips exactly', async () => {
    const state = prepareHeavyBuild();
    const encoded = await encodeBuild(state, mode);
    const decoded = await decodeBuild(encoded, mode);
    expect(decoded).not.toBeNull();
    expect(decoded!.warnings).toEqual([]);
    expect(encoded.length).toBeLessThan(300);
    // Mutation bitmask wire order is sorted by index, not selection order.
    expect([...decoded!.state.player.mutations].sort()).toEqual([...state.player.mutations].sort());
    expect({
      ...decoded!.state,
      player: { ...decoded!.state.player, mutations: [] },
    }).toEqual({
      ...state,
      player: { ...state.player, mutations: [] },
    });
  });
});
