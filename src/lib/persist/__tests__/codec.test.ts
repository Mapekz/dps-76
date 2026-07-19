import { describe, it, expect, vi } from 'vitest';
import { decodeBuild, encodeBuild } from '@/lib/persist/codec';
import { makeBuildReducer, createDefaultBuildState, type BuildAction } from '@/state/build-reducer';
import { nukesDragonsPerks } from '@/lib/nukes-dragons';
import type { GeneratedAddiction, GeneratedBuff } from '@/types/generated';

const buildReducer = makeBuildReducer('live');

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
  id: 'TestChemA', formId: '0xC1', name: 'Test Chem A', kind: 'consumable', modifiers: [], notes: [], category: 'chem',
};
const testChemB: GeneratedBuff = {
  id: 'TestChemB', formId: '0xC2', name: 'Test Chem B', kind: 'consumable', modifiers: [], notes: [], category: 'chem',
};
const testAddiction: GeneratedAddiction = {
  id: 'TestAddictionX', formId: '0xA1', name: 'Test Addiction X', causedBy: ['TestChemA'], modifiers: [], notes: [],
};

vi.mock('@/data/buffs', async importOriginal => {
  const actual = await importOriginal<typeof import('@/data/buffs')>();
  return {
    ...actual,
    getConsumables: () => [testChemA, testChemB],
    getAddictions: () => [testAddiction],
  };
});

/** Hand-builds a v1 wire payload without going through encodeBuild — lets a
 * test simulate a legacy/adversarial URL shape that the current app would
 * never itself produce (e.g. a stale manual `addictionCount`). */
async function encodeRawWire(wire: Record<string, unknown>): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(wire));
  const deflated = new Uint8Array(
    await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()
  );
  let bin = '';
  for (const b of deflated) bin += String.fromCharCode(b);
  return '1.' + btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

describe('build codec', () => {
  it('round-trips the default state', async () => {
    const state = createDefaultBuildState();
    const decoded = await decodeBuild(await encodeBuild(state), 'live');
    expect(decoded).not.toBeNull();
    expect(decoded!.state).toEqual(state);
    expect(decoded!.warnings).toEqual([]);
  });

  it('round-trips a maxed realistic build', async () => {
    const state = stateFrom([
      { type: 'weapon/select', weaponId: 'CombatRifle_Fixer' },
      { type: 'weapon/mod', slot: 'ap_gun_Receiver', omodId: 'mod_CombatRifle_Receiver_Damage-Auto' },
      { type: 'weapon/itemLevel', value: 45 },
      { type: 'weapon/weakpointMult', value: 2.5 },
      // Raise every stat to 8 (56 = exactly the pool) so any rank-3 card fits its stat's budget.
      ...(['strength', 'perception', 'endurance', 'charisma', 'intelligence', 'agility', 'luck'] as const).map(
        stat => ({ type: 'special/set' as const, stat, value: 8 })
      ),
      { type: 'perk/add', perkId: ndPerkId, rank: 3, legendary: false },
      { type: 'condition/set', key: 'isSneaking', value: true },
      { type: 'condition/set', key: 'healthPercent', value: 20 },
      { type: 'enemy/condition', key: 'isBurning', value: true },
      { type: 'view/set', view: { emphasized: 'vats', breakdownOpen: true } },
      { type: 'build/importNd', perks: [], name: 'Bloodied Commando', special: null, isGhoul: false },
    ]);
    const decoded = await decodeBuild(await encodeBuild(state), 'live');
    expect(decoded).not.toBeNull();
    // importNd with [] cleared perks; re-check the state actually round-trips.
    expect(decoded!.state).toEqual(state);
    expect(decoded!.warnings).toEqual([]);
  });

  it('preserves positional legendary gaps for equipped uniques (Salt Swift at ★3)', async () => {
    const state = stateFrom([{ type: 'weapon/selectUnique', uniqueId: 'mod_Custom_SaltOfTheEarth' }]);
    expect(state.player.weapon?.legendaryEffects).toEqual([
      null,
      null,
      'mod_Legendary_Weapon3_Guns_ReloadSpeed',
    ]);
    const decoded = await decodeBuild(await encodeBuild(state), 'live');
    expect(decoded!.state.player.weapon?.legendaryEffects).toEqual([
      null,
      null,
      'mod_Legendary_Weapon3_Guns_ReloadSpeed',
    ]);
  });

  it('round-trips perks through the N&D key dictionary', async () => {
    const state = stateFrom([
      ...(['strength', 'perception', 'endurance', 'charisma', 'intelligence', 'agility', 'luck'] as const).map(
        stat => ({ type: 'special/set' as const, stat, value: 8 })
      ),
      { type: 'perk/add', perkId: ndPerkId, rank: 2, legendary: false },
    ]);
    const encoded = await encodeBuild(state);
    const decoded = await decodeBuild(encoded, 'live');
    expect(decoded!.state.player.perks).toEqual([{ perkId: ndPerkId, rank: 2 }]);
  });

  it('silently clamps an out-of-range decoded rank to the card maxRank', async () => {
    // Tenderizer is a real single-rank card (maxRank 1) — an out-of-range
    // rank could come from a stale link (a card's maxRank shrinking after an
    // ESM sync) or an adversarial payload. `px` bypasses the N&D key
    // dictionary so the fallback [perkId, rank] path is exercised directly.
    const encoded = await encodeRawWire({ px: [['Tenderizer', 99]] });
    const decoded = await decodeBuild(encoded, 'live');
    expect(decoded).not.toBeNull();
    expect(decoded!.state.player.perks).toEqual([{ perkId: 'Tenderizer', rank: 1 }]);
    // Silent: no warning for the clamp itself (the over-budget flag covers overruns).
    expect(decoded!.warnings).toEqual([]);
  });

  it('returns null for corrupt or foreign input', async () => {
    expect(await decodeBuild('garbage', 'live')).toBeNull();
    expect(await decodeBuild('1.not-base64!!!', 'live')).toBeNull();
    expect(await decodeBuild('2.' + 'AAAA', 'live')).toBeNull(); // unknown version
    expect(await decodeBuild('', 'live')).toBeNull();
  });

  it('drops unknown weapon/omod/mutation ids with warnings instead of throwing', async () => {
    const state = stateFrom([{ type: 'weapon/select', weaponId: 'CombatRifle_Fixer' }]);
    state.player.weapon!.mods['ap_gun_Receiver'] = 'mod_DoesNotExist';
    state.player.mutations = ['NotARealMutation'];
    const decoded = await decodeBuild(await encodeBuild(state), 'live');
    expect(decoded).not.toBeNull();
    expect(decoded!.state.player.weapon?.weaponId).toBe('CombatRifle_Fixer');
    expect(decoded!.state.player.weapon?.mods['ap_gun_Receiver']).toBeUndefined();
    expect(decoded!.state.player.mutations).toEqual([]);
    expect(decoded!.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('clears an unknown weapon entirely, with a warning', async () => {
    const state = stateFrom([{ type: 'weapon/select', weaponId: 'RemovedByPatch' }]);
    const decoded = await decodeBuild(await encodeBuild(state), 'live');
    expect(decoded!.state.player.weapon).toBeNull();
    expect(decoded!.warnings.join()).toMatch(/unknown weapon/);
  });

  it('tolerates future fields (forward compatibility)', async () => {
    // Simulate a newer app writing an extra key: decode a hand-built payload.
    const state = stateFrom([{ type: 'condition/set', key: 'isSneaking', value: true }]);
    const encoded = await encodeBuild(state);
    // Splice a future field into the JSON by re-encoding manually.
    const { decodeBuild: dec } = await import('@/lib/persist/codec');
    const decoded = await dec(encoded, 'live');
    expect(decoded!.state.player.conditions.isSneaking).toBe(true);
    // Unknown condition keys are dropped rather than crashing.
  });

  it('round-trips chargeTimeSec when set, and omits "ct" from the wire when undefined', async () => {
    const state = stateFrom([{ type: 'weapon/chargeTime', value: 1.5 }]);
    const encoded = await encodeBuild(state);
    const decoded = await decodeBuild(encoded, 'live');
    expect(decoded!.state.player.chargeTimeSec).toBe(1.5);

    const defaultEncoded = await encodeBuild(createDefaultBuildState());
    const defaultDecoded = await decodeBuild(defaultEncoded, 'live');
    expect(defaultDecoded!.state.player.chargeTimeSec).toBeUndefined();
  });

  it('decodes a wire without "ct" to undefined chargeTimeSec (backward compat)', async () => {
    const encoded = await encodeRawWire({});
    const decoded = await decodeBuild(encoded, 'live');
    expect(decoded!.state.player.chargeTimeSec).toBeUndefined();
  });

  it('clamps a negative decoded chargeTimeSec to 0', async () => {
    const encoded = await encodeRawWire({ ct: -5 });
    const decoded = await decodeBuild(encoded, 'live');
    expect(decoded!.state.player.chargeTimeSec).toBe(0);
  });

  it('non-default conditions survive while defaults are not serialized', async () => {
    const state = stateFrom([{ type: 'condition/set', key: 'tenderizerStacks', value: 500 }]);
    const encoded = await encodeBuild(state);
    const decoded = await decodeBuild(encoded, 'live');
    expect(decoded!.state.player.conditions.tenderizerStacks).toBe(500);
    // Sanity: encoding stays compact (deflate of a sparse diff).
    expect(encoded.length).toBeLessThan(200);
  });
});

describe('derived condition fields', () => {
  it('never serializes derived keys, even when non-default in state', async () => {
    const state = createDefaultBuildState();
    state.player.conditions.strangeInNumbers = true;
    state.player.conditions.hungerThirstTier = 6;
    state.player.conditions.maxHealth = 999;
    state.player.conditions.mutationCount = 5;
    state.player.conditions.addictionCount = 7;
    const encoded = await encodeBuild(state);
    const decoded = await decodeBuild(encoded, 'live');
    const defaults = createDefaultBuildState().player.conditions;
    expect(decoded!.state.player.conditions.strangeInNumbers).toBe(defaults.strangeInNumbers);
    expect(decoded!.state.player.conditions.hungerThirstTier).toBe(defaults.hungerThirstTier);
    expect(decoded!.state.player.conditions.maxHealth).toBe(defaults.maxHealth);
    expect(decoded!.state.player.conditions.mutationCount).toBe(defaults.mutationCount);
    expect(decoded!.state.player.conditions.addictionCount).toBe(defaults.addictionCount);
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
    const decoded = await decodeBuild(await encodeBuild(state), 'live');
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
      const decoded = await decodeBuild(await encodeBuild(state), 'live');
      expect(decoded!.state.player.conditions.publicTeamType).toBe(publicTeamType);
      expect(decoded!.state.player.conditions.teammateCount).toBe(2);
      expect(decoded!.warnings).toEqual([]);
    }
  });

  it('reclassifies a legacy build that stored a ghoul card under legendaryPerks', async () => {
    // Pre-classification-fix builds filed ghoul cards (e.g. RadSpecialist) as
    // legendary. encodePerks serializes whatever is in the array, so this
    // legitimately simulates an old payload.
    const legacy = createDefaultBuildState();
    legacy.player.legendaryPerks = [{ perkId: 'RadSpecialist', rank: 1 }];
    const decoded = await decodeBuild(await encodeBuild(legacy), 'live');
    expect(decoded!.state.player.legendaryPerks).toEqual([]);
    expect(decoded!.state.player.perks).toEqual([{ perkId: 'RadSpecialist', rank: 1 }]);
    expect(decoded!.warnings.some(w => w.includes('classification'))).toBe(true);
  });
});

describe('Armor Effects checklist (Phase 3 armor pipeline, UI + state)', () => {
  it('round-trips a mix of stackable and single-slot selections, omitting zero counts', async () => {
    const state = stateFrom([
      { type: 'armorEffect/setCount', id: 'mod_Legendary_Armor4_BattleLoaders', count: 3 },
      { type: 'armorEffect/setCount', id: 'mod_Legendary_Armor2_StatStrength', count: 5 },
      { type: 'armorEffect/setCount', id: 'mod_armor_UnderArmor_style_standard', count: 1 },
    ]);
    const encoded = await encodeBuild(state);
    const decoded = await decodeBuild(encoded, 'live');
    expect(decoded!.state.player.armorEffects).toEqual({
      mod_Legendary_Armor4_BattleLoaders: 3,
      mod_Legendary_Armor2_StatStrength: 5,
      mod_armor_UnderArmor_style_standard: 1,
    });
    expect(decoded!.warnings).toEqual([]);
  });

  it('setting a count back to 0 removes the entry rather than serializing a 0', async () => {
    const withEffect = stateFrom([{ type: 'armorEffect/setCount', id: 'mod_Legendary_Armor3_Healthy', count: 4 }]);
    const cleared = buildReducer(withEffect, { type: 'armorEffect/setCount', id: 'mod_Legendary_Armor3_Healthy', count: 0 });
    expect(cleared.player.armorEffects).toEqual({});
    const decoded = await decodeBuild(await encodeBuild(cleared), 'live');
    expect(decoded!.state.player.armorEffects).toEqual({});
  });

  it('clamps a count to the effect\'s maxCount and drops unknown ids with a warning', async () => {
    const encoded = await encodeRawWire({
      ae: [
        ['mod_Legendary_Armor2_StatStrength', 99], // stackable, max 5
        ['mod_armor_UnderArmor_style_standard', 5], // single-slot, max 1
        ['NotARealArmorEffect', 3],
      ],
    });
    const decoded = await decodeBuild(encoded, 'live');
    expect(decoded!.state.player.armorEffects).toEqual({
      mod_Legendary_Armor2_StatStrength: 5,
      mod_armor_UnderArmor_style_standard: 1,
    });
    expect(decoded!.warnings.some(w => w.includes('NotARealArmorEffect'))).toBe(true);
  });

  it('migrates a legacy "limitBreakingPieces" condition into the checklist selection', async () => {
    const encoded = await encodeRawWire({ pc: { limitBreakingPieces: 5 } });
    const decoded = await decodeBuild(encoded, 'live');
    expect(decoded!.state.player.armorEffects).toEqual({ mod_Legendary_Armor4_LimitBreak: 5 });
    expect(decoded!.warnings.some(w => w.includes('Armor Effects checklist'))).toBe(true);
  });

  it('a legacy "limitBreakingPieces: 0" migrates to no selection at all (not a stored zero)', async () => {
    const encoded = await encodeRawWire({ pc: { limitBreakingPieces: 0 } });
    const decoded = await decodeBuild(encoded, 'live');
    expect(decoded!.state.player.armorEffects).toEqual({});
  });
});

describe('consumables & addictions (2026-07-13 overhaul, hermetic fixtures)', () => {
  it('round-trips selected addictions', async () => {
    const state = createDefaultBuildState();
    state.player.addictions = ['TestAddictionX'];
    const decoded = await decodeBuild(await encodeBuild(state), 'live');
    expect(decoded).not.toBeNull();
    expect(decoded!.state.player.addictions).toEqual(['TestAddictionX']);
    expect(decoded!.warnings).toEqual([]);
  });

  it('drops an unknown addiction id with a warning', async () => {
    const state = createDefaultBuildState();
    state.player.addictions = ['NotARealAddiction'];
    const decoded = await decodeBuild(await encodeBuild(state), 'live');
    expect(decoded!.state.player.addictions).toEqual([]);
    expect(decoded!.warnings.some(w => w.includes('unknown addiction'))).toBe(true);
  });

  it('sanitizes a legacy two-chem payload down to one, with a warning', async () => {
    // Hand-crafted: the reducer's consumable/toggle would never let two chems
    // coexist, so this simulates an old (or adversarial) share URL.
    const state = createDefaultBuildState();
    state.player.consumables = ['TestChemA', 'TestChemB'];
    const decoded = await decodeBuild(await encodeBuild(state), 'live');
    expect(decoded!.state.player.consumables).toEqual(['TestChemB']);
    expect(decoded!.warnings.some(w => w.includes('stacking rules'))).toBe(true);
  });

  it('a legal single-consumable payload round-trips without a stacking warning', async () => {
    const state = createDefaultBuildState();
    state.player.consumables = ['TestChemA'];
    const decoded = await decodeBuild(await encodeBuild(state), 'live');
    expect(decoded!.state.player.consumables).toEqual(['TestChemA']);
    expect(decoded!.warnings).toEqual([]);
  });

  it('skips an incoming addictionCount condition key with a warning and does not set it', async () => {
    // Simulates a pre-overhaul URL that stored a manual addictionCount.
    const encoded = await encodeRawWire({ pc: { addictionCount: 7 } });
    const decoded = await decodeBuild(encoded, 'live');
    expect(decoded).not.toBeNull();
    expect(decoded!.state.player.conditions.addictionCount).toBe(createDefaultBuildState().player.conditions.addictionCount);
    expect(decoded!.warnings.some(w => w.includes('addictionCount'))).toBe(true);
  });

  it('migrates a legacy string targetDistance bucket to a representative raw-unit number', async () => {
    // Simulates a pre-Phase-1 URL that stored the old 'close'|'none'|'far' bucket.
    const close = await decodeBuild(await encodeRawWire({ ec: { targetDistance: 'close' } }), 'live');
    expect(close!.state.enemy.conditions.targetDistance).toBe(400);
    expect(close!.warnings).toEqual([]);

    const none = await decodeBuild(await encodeRawWire({ ec: { targetDistance: 'none' } }), 'live');
    expect(none!.state.enemy.conditions.targetDistance).toBe(900);

    const far = await decodeBuild(await encodeRawWire({ ec: { targetDistance: 'far' } }), 'live');
    expect(far!.state.enemy.conditions.targetDistance).toBe(1500);
  });

  it('warns and falls back to default on an unrecognized legacy targetDistance string', async () => {
    const decoded = await decodeBuild(await encodeRawWire({ ec: { targetDistance: 'medium' } }), 'live');
    expect(decoded).not.toBeNull();
    expect(decoded!.state.enemy.conditions.targetDistance).toBe(
      createDefaultBuildState().enemy.conditions.targetDistance
    );
    expect(decoded!.warnings.some(w => w.includes('targetDistance'))).toBe(true);
  });

  it('round-trips a real numeric targetDistance value written by the current app', async () => {
    const state = createDefaultBuildState();
    state.enemy.conditions.targetDistance = 3200;
    const decoded = await decodeBuild(await encodeBuild(state), 'live');
    expect(decoded!.state.enemy.conditions.targetDistance).toBe(3200);
    expect(decoded!.warnings).toEqual([]);
  });
});
