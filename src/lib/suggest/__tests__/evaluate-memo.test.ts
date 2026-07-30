import { describe, expect, it } from 'bun:test';
import {
  createDefaultBuildState,
  makeBuildReducer,
  type BuildAction,
  type BuildState,
} from '@/state/build-reducer';
import { PerkId } from '@/data/perk-ids';
import { resolveLoadout } from '@/lib/loadout';
import { computeScenarios } from '@/lib/engine/scenarios';
import { evaluateSuggestions, snapshotOf } from '@/lib/suggest/evaluate';
import type { DpsSnapshot, EvaluatedSuggestion, SuggestionGroup } from '@/lib/suggest/types';

/**
 * Correctness guard for `resolveLoadout`'s opt-in `LoadoutMemo` cache
 * (src/lib/loadout-memo.ts, wired through by `evaluateSuggestions`): the
 * memoized full sweep must produce EXACTLY the same per-candidate DPS
 * numbers as evaluating each candidate in isolation, with no memo at all.
 * Full numeric equality (`toEqual`), not "close enough" — the memo is a
 * pure performance layer and must never change an observable result.
 *
 * Exercises every candidate GROUP (`SuggestionGroup`) so a bug scoped to one
 * source (e.g. a cache keyed on the wrong slice, or two entangled sources
 * memoized independently when they shouldn't be) can't hide behind a group
 * that happens not to touch it.
 */

const buildReducer = makeBuildReducer('live');

function applyActions(state: BuildState, actions: readonly BuildAction[]): BuildState {
  let next = state;
  for (const action of actions) next = buildReducer(next, action);
  return next;
}

/** Independent, un-memoized ground truth for one candidate's action list. */
function naiveSnapshot(state: BuildState, actions: readonly BuildAction[]): DpsSnapshot | null {
  const next = applyActions(state, actions);
  const input = resolveLoadout(next.player, next.enemy, 'live'); // no memo
  return input ? snapshotOf(computeScenarios(input)) : null;
}

// A rich build spanning every damage-relevant source the sweep enumerates:
// an equipped weapon with a chosen OMOD (so 'mod' has alternatives) and open
// legendary slots (so 'legendary' has options), several equipped perks
// including one legendary perk (Follow Through — also exercises the
// perk/setRank → syncTargetDebuffConditions → manual-uptime-modifier path),
// legendary armor effects across multiple star tiers plus a misc effect,
// two mutations, and an already-active consumable (so 'consumable' offers
// both "Use" and "Drop" candidates).
function richBuildState(): BuildState {
  let state = createDefaultBuildState();
  state = applyActions(state, [
    { type: 'weapon/select', weaponId: 'CombatRifle_Fixer' },
    {
      type: 'weapon/mod',
      slot: 'ap_gun_Receiver',
      omodId: 'mod_CombatRifle_Receiver_Damage-Auto',
    },
    { type: 'special/set', stat: 'perception', value: 6 },
    { type: 'special/set', stat: 'strength', value: 4 },
    { type: 'special/set', stat: 'luck', value: 4 },
    { type: 'perk/add', perkId: PerkId.CenterMasochist, rank: 2, legendary: false },
    { type: 'perk/add', perkId: PerkId.RiflemanExpert, rank: 3, legendary: false },
    { type: 'perk/add', perkId: PerkId.BloodyMess, rank: 1, legendary: false },
    { type: 'perk/add', perkId: 'FollowThrough', rank: 2, legendary: true },
    { type: 'armorEffect/setCount', id: 'mod_Legendary_Armor4_BattleLoaders', count: 2 },
    { type: 'armorEffect/setCount', id: 'mod_Legendary_Armor2_StatStrength', count: 3 },
    { type: 'armorEffect/setCount', id: 'mod_armor_UnderArmor_style_Casual', count: 1 },
    { type: 'mutation/toggle', id: 'Mutation_SpeedDemon' },
    { type: 'mutation/toggle', id: 'Mutation_AdrenalReaction' },
    { type: 'consumable/toggle', id: 'Brew_BlackwaterBrew' },
  ]);
  return state;
}

const GROUPS: SuggestionGroup[] = ['mod', 'legendary', 'perk', 'mutation', 'armor', 'consumable'];
const SAMPLE_PER_GROUP = 4;

describe('evaluateSuggestions memoization correctness', () => {
  const state = richBuildState();
  const report = evaluateSuggestions(state, 'live', 'freeAim');

  it('produces a non-empty, non-null baseline', () => {
    expect(report.baseline).not.toBeNull();
  });

  it('baseline (computed through the memo) matches the naive un-memoized baseline exactly', () => {
    const naive = naiveSnapshot(state, []);
    expect(report.baseline).toEqual(naive);
  });

  it('covers every candidate group in this build (sanity check the fixture is rich enough)', () => {
    const byGroup = new Map<SuggestionGroup, EvaluatedSuggestion[]>();
    for (const s of report.suggestions) {
      (byGroup.get(s.group) ?? byGroup.set(s.group, []).get(s.group)!).push(s);
    }
    for (const group of GROUPS) {
      expect(byGroup.get(group)?.length ?? 0).toBeGreaterThan(0);
    }
  });

  describe.each(GROUPS)('group "%s"', (group) => {
    it('memoized per-candidate DPS snapshot exactly equals a naive un-memoized evaluation', () => {
      const members = report.suggestions
        .filter((s) => s.group === group)
        .slice(0, SAMPLE_PER_GROUP);
      expect(members.length).toBeGreaterThan(0);

      for (const suggestion of members) {
        const naive = naiveSnapshot(state, suggestion.action);
        // Every candidate here keeps the weapon equipped, so a null naive
        // result would itself be a bug worth failing loudly on.
        expect(naive).not.toBeNull();
        // Full numeric equality — the memo must never move a number, only
        // avoid redundant work getting to it.
        expect(suggestion.result).toEqual(naive!);
      }
    });
  });
});
