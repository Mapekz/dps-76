import { describe, expect, it } from 'bun:test';
import { createDefaultBuildState, makeBuildReducer } from '@/state/build-reducer';
import { normalizeBuildState, clampCrippledLimbCount } from '@/lib/build-rules';

describe('clampCrippledLimbCount', () => {
  it('clamps to the race crippable-part count', () => {
    expect(clampCrippledLimbCount('live', 'BlueDevilRace', 6)).toBe(0);
    expect(clampCrippledLimbCount('live', null, 6)).toBe(6);
  });
});

describe('normalizeBuildState', () => {
  it('clamps crippledLimbCount on hydrate and surfaces a warning', async () => {
    const state = createDefaultBuildState();
    state.enemy.conditions.targetRace = 'BlueDevilRace';
    state.enemy.conditions.crippledLimbCount = 6;

    const { state: normalized, warnings } = normalizeBuildState('live', state);
    expect(normalized.enemy.conditions.crippledLimbCount).toBe(0);
    expect(warnings.some((w) => w.includes('crippled limb count'))).toBe(true);
  });

  it('is a no-op with no warnings for a valid default build', () => {
    const state = createDefaultBuildState();
    const { state: normalized, warnings } = normalizeBuildState('live', state);
    expect(normalized).toEqual(state);
    expect(warnings).toEqual([]);
  });
});

describe('build/hydrate and enemy/condition', () => {
  const run = makeBuildReducer('live');

  it('build/hydrate runs normalization', () => {
    const bad = createDefaultBuildState();
    bad.enemy.conditions.targetRace = 'BlueDevilRace';
    bad.enemy.conditions.crippledLimbCount = 4;
    const hydrated = run(createDefaultBuildState(), { type: 'build/hydrate', state: bad });
    expect(hydrated.enemy.conditions.crippledLimbCount).toBe(0);
  });

  it('enemy/condition clamps crippledLimbCount to the selected race', () => {
    let state = createDefaultBuildState();
    state = run(state, { type: 'enemy/condition', key: 'targetRace', value: 'BlueDevilRace' });
    state = run(state, { type: 'enemy/condition', key: 'crippledLimbCount', value: 5 });
    expect(state.enemy.conditions.crippledLimbCount).toBe(0);
  });
});
