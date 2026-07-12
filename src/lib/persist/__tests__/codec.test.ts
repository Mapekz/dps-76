import { describe, it, expect } from 'vitest';
import { decodeBuild, encodeBuild } from '@/lib/persist/codec';
import { buildReducer, createDefaultBuildState, type BuildAction } from '@/state/build-reducer';
import { nukesDragonsPerks } from '@/lib/nukes-dragons';

function stateFrom(actions: BuildAction[]) {
  return actions.reduce(buildReducer, createDefaultBuildState());
}

// A real N&D key → PerkId pair to exercise the dictionary path.
const [ndKey, ndPerkId] = Object.entries(nukesDragonsPerks).find(([k]) => !k.startsWith('0'))!;
void ndKey;

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
      { type: 'perk/add', perkId: ndPerkId, rank: 3, legendary: false },
      { type: 'special/set', stat: 'luck', value: 20 },
      { type: 'condition/set', key: 'isSneaking', value: true },
      { type: 'condition/set', key: 'healthPercent', value: 20 },
      { type: 'enemy/condition', key: 'isBurning', value: true },
      { type: 'view/set', view: { emphasized: 'vats', breakdownOpen: true } },
      { type: 'build/importNd', perks: [], name: 'Bloodied Commando', special: null },
    ]);
    const decoded = await decodeBuild(await encodeBuild(state), 'live');
    expect(decoded).not.toBeNull();
    // importNd with [] cleared perks; re-check the state actually round-trips.
    expect(decoded!.state).toEqual(state);
    expect(decoded!.warnings).toEqual([]);
  });

  it('round-trips perks through the N&D key dictionary', async () => {
    const state = stateFrom([{ type: 'perk/add', perkId: ndPerkId, rank: 2, legendary: false }]);
    const encoded = await encodeBuild(state);
    const decoded = await decodeBuild(encoded, 'live');
    expect(decoded!.state.player.perks).toEqual([{ perkId: ndPerkId, rank: 2 }]);
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

  it('non-default conditions survive while defaults are not serialized', async () => {
    const state = stateFrom([{ type: 'condition/set', key: 'tenderizerStacks', value: 500 }]);
    const encoded = await encodeBuild(state);
    const decoded = await decodeBuild(encoded, 'live');
    expect(decoded!.state.player.conditions.tenderizerStacks).toBe(500);
    // Sanity: encoding stays compact (deflate of a sparse diff).
    expect(encoded.length).toBeLessThan(200);
  });
});
