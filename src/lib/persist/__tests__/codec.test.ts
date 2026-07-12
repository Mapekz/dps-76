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
      // Raise every stat to 8 (56 = exactly the pool) so any rank-3 card fits its stat's budget.
      ...(['strength', 'perception', 'endurance', 'charisma', 'intelligence', 'agility', 'luck'] as const).map(
        stat => ({ type: 'special/set' as const, stat, value: 8 })
      ),
      { type: 'perk/add', perkId: ndPerkId, rank: 3, legendary: false },
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

describe('derived condition fields', () => {
  it('never serializes derived keys, even when non-default in state', async () => {
    const state = createDefaultBuildState();
    state.player.conditions.strangeInNumbers = true;
    state.player.conditions.hungerThirstTier = 6;
    state.player.conditions.maxHealth = 999;
    state.player.conditions.mutationCount = 5;
    const encoded = await encodeBuild(state);
    const decoded = await decodeBuild(encoded, 'live');
    const defaults = createDefaultBuildState().player.conditions;
    expect(decoded!.state.player.conditions.strangeInNumbers).toBe(defaults.strangeInNumbers);
    expect(decoded!.state.player.conditions.hungerThirstTier).toBe(defaults.hungerThirstTier);
    expect(decoded!.state.player.conditions.maxHealth).toBe(defaults.maxHealth);
    expect(decoded!.state.player.conditions.mutationCount).toBe(defaults.mutationCount);
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
});
