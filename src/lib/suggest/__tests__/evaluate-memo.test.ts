import { describe, expect, it } from 'bun:test';
import {
  createDefaultBuildState,
  makeBuildReducer,
  type BuildAction,
  type BuildState,
} from '@/state/build-reducer';
import { PerkId } from '@/data/perk-ids';
import { resolveLoadout } from '@/lib/loadout';
import { createMemoScope } from '@/lib/loadout-memo';
import { computeScenarios } from '@/lib/engine/scenarios';
import { evaluateActions, evaluateSuggestions, snapshotOf } from '@/lib/suggest/evaluate';
import type { DpsSnapshot, EvaluatedSuggestion, SuggestionGroup } from '@/lib/suggest/types';

/**
 * Correctness guard for `resolveLoadout`'s opt-in `MemoScope` cache
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

  it('memoized evaluation matches naive ground truth for allocation compounds', () => {
    const allocState = applyActions(createDefaultBuildState(), [
      { type: 'weapon/select', weaponId: 'CombatRifle_Fixer' },
      { type: 'special/set', stat: 'luck', value: 1 },
    ]);
    const allocReport = evaluateSuggestions(allocState, 'live', 'vats');
    const compound = allocReport.suggestions.find((s) => s.id.endsWith(':alloc'));
    expect(compound).toBeDefined();
    const naive = naiveSnapshot(allocState, compound!.action);
    expect(naive).not.toBeNull();
    expect(compound!.result).toEqual(naive!);
  });
});

/**
 * Regression guard for the bug this file's `MemoScope` rewrite fixed:
 * `resolveLoadout`'s `player` assembly reads `playerConfig.addictions` (via
 * `deriveAddictionCount`) but the pre-rewrite `LoadoutMemo`'s cache key for
 * `player` never listed it — a candidate that only replaced `addictions`
 * (leaving `conditions`/`mutations`/every other key input referentially
 * identical) would incorrectly hit the PREVIOUS `player` object, silently
 * dropping Junkie's addiction-count-driven damage.
 *
 * `variants.ts` never emits an `addiction/toggle` candidate today (see
 * CONTEXT.md/that file), so `evaluateSuggestions`' own sweep can't exercise
 * this — this test drives `evaluateActions` directly with a SHARED
 * `MemoScope` across two calls (the exact reuse pattern the sweep relies on)
 * to exercise it regardless.
 */
describe('addiction/toggle candidate — MemoScope key regression (see loadout.ts playerAgg)', () => {
  function junkieBuildState(): BuildState {
    let state = createDefaultBuildState();
    state = applyActions(state, [
      { type: 'weapon/select', weaponId: 'CombatRifle_Fixer' },
      // Junkie's: +10% dbm per active (unsuppressed) addiction — a pure
      // function of `addictionCount`, so any DPS movement below is
      // attributable entirely to the addiction toggle, not to some other
      // damage source moving at the same time.
      {
        type: 'weapon/legendary',
        slotIndex: 0,
        omodId: 'mod_Legendary_Weapon1_DamageAddiction',
      },
    ]);
    return state;
  }

  it('toggling an addiction on, in a MemoScope already warmed by a zero-addiction evaluation, still moves DPS', () => {
    const state = junkieBuildState();
    const scope = createMemoScope();
    const zero: DpsSnapshot = {
      freeAim: { perHit: 0, burstDps: 0, sustainedDps: 0, uptime: 1 },
      vats: { perHit: 0, burstDps: 0, sustainedDps: 0, uptime: 1 },
    };

    // Warm the scope on the 0-addiction state first — this is what makes the
    // regression reachable: a fresh scope's first call can't hit a stale
    // cache, so the bug only shows up on a SECOND call sharing the scope.
    const warm = evaluateActions(state, 'live', [], zero, scope);
    expect(warm).not.toBeNull();

    const toggled = evaluateActions(
      state,
      'live',
      [{ type: 'addiction/toggle', id: 'AbAddictionAlcohol' }],
      zero,
      scope,
    );
    expect(toggled).not.toBeNull();

    // The bug's failure mode: toggled.result === warm.result (the stale
    // 0-addiction player object served again). Assert real movement instead.
    expect(toggled!.result.freeAim.sustainedDps).toBeGreaterThan(warm!.result.freeAim.sustainedDps);

    // And exactness against a fully naive (unmemoized, no scope at all)
    // evaluation of the SAME toggled state — not just "some" movement.
    const naive = naiveSnapshot(state, [{ type: 'addiction/toggle', id: 'AbAddictionAlcohol' }]);
    expect(naive).not.toBeNull();
    expect(toggled!.result).toEqual(naive!);
  });
});
