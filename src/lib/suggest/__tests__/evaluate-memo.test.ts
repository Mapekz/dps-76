import { describe, expect, it } from 'bun:test';
import {
  createDefaultBuildState,
  makeBuildReducer,
  type BuildAction,
  type BuildState,
  type ScenarioKey,
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

/**
 * Exactness guard for L2 candidate pruning (#76, evaluate.ts's
 * `recordEngineBucketReads`/`isDisjoint`): pruning must never change the
 * observable `SuggestionReport` — same rows, same order, same numbers — only
 * skip resolve+engine work for candidates it can PROVE are zero-effect. Full
 * `toEqual` on the entire report (not a sample), against the SAME sweep with
 * pruning disabled via `evaluateSuggestions`' `disablePruning` escape hatch,
 * across builds chosen to stress the two known risk spots:
 *
 * - `nakedBuildState`: zero OMODs equipped and zero weapon-stat-bucket perks
 *   — `buildEffectiveWeapon`'s early-return fast path (effective-weapon.ts)
 *   fires for the BASELINE itself, which would silently drop
 *   WEAPON_STAT_BUCKETS/SUSTAIN_CHANCE_BUCKETS/EFFECTIVE_WEAPON_BOOTSTRAP_BUCKETS
 *   from the recorded read-set if evaluate.ts didn't seed them statically
 *   (`ALWAYS_IN_SCOPE_BUCKETS`) — this build is exactly the case that would
 *   catch a regression there.
 * - `meleeBuildState`/`launcherBuildState`: exercise weapon-shape-gated folds
 *   (powerAttackBonus/melee STR term; explosivePayload/explosionRadiusBonus)
 *   that a ranged non-explosive baseline (`richBuildState`) never reads at
 *   all, so a bug that over-prunes them specifically wouldn't show up there.
 */
describe('L2 candidate pruning (#76) — pruned report exactly equals unpruned', () => {
  function nakedBuildState(): BuildState {
    let state = createDefaultBuildState();
    state = applyActions(state, [
      { type: 'weapon/select', weaponId: 'CombatRifle_Fixer' },
      // CenterMasochist is a bodyPart/dbm perk — deliberately NOT a
      // WEAPON_STAT_BUCKETS/SUSTAIN_CHANCE_BUCKETS source, so this build
      // equips a weapon and a perk but never trips buildEffectiveWeapon's
      // "any weapon-stat modifier present" gate.
      { type: 'perk/add', perkId: PerkId.CenterMasochist, rank: 1, legendary: false },
    ]);
    return state;
  }

  function meleeBuildState(): BuildState {
    let state = createDefaultBuildState();
    state = applyActions(state, [
      { type: 'weapon/select', weaponId: 'BaseballBat' },
      { type: 'special/set', stat: 'strength', value: 8 },
      { type: 'perk/add', perkId: PerkId.CenterMasochist, rank: 2, legendary: false },
      { type: 'armorEffect/setCount', id: 'mod_Legendary_Armor2_StatStrength', count: 2 },
      { type: 'mutation/toggle', id: 'Mutation_SpeedDemon' },
    ]);
    return state;
  }

  function launcherBuildState(): BuildState {
    let state = createDefaultBuildState();
    state = applyActions(state, [
      { type: 'weapon/select', weaponId: 'Fatman' },
      { type: 'perk/add', perkId: PerkId.BloodyMess, rank: 1, legendary: false },
      { type: 'armorEffect/setCount', id: 'mod_Legendary_Armor4_BattleLoaders', count: 2 },
      { type: 'mutation/toggle', id: 'Mutation_AdrenalReaction' },
    ]);
    return state;
  }

  const BUILDS: Array<[string, () => BuildState]> = [
    ['rich (ranged, torso target)', richBuildState],
    ['naked (no OMODs, no weapon-stat perks)', nakedBuildState],
    ['melee', meleeBuildState],
    ['launcher', launcherBuildState],
  ];

  describe.each(BUILDS)('%s', (_label, makeState) => {
    it.each<ScenarioKey>(['freeAim', 'vats'])(
      'pruned report deep-equals the unpruned report for metric "%s"',
      (metric) => {
        const state = makeState();
        const pruned = evaluateSuggestions(state, 'live', metric);
        const unpruned = evaluateSuggestions(state, 'live', metric, { disablePruning: true });
        expect(pruned.baseline).toEqual(unpruned.baseline);
        expect(pruned.suggestions).toEqual(unpruned.suggestions);
      },
    );

    it('actually exercises the prune path (sanity: not a no-op test)', () => {
      // A pruned row's `result` is the literal `baseline` reference (see
      // evaluate.ts's ZERO_DELTA synthesis) — a naive/unpruned re-evaluation
      // of a genuine no-op would compute a FRESH (deep-equal but not `===`)
      // snapshot instead, so this reference check is specific to "this row
      // took the pruned path", not "this row happens to be a no-op".
      const state = makeState();
      const report = evaluateSuggestions(state, 'live', 'freeAim');
      const prunedRows = report.suggestions.filter((s) => s.result === report.baseline);
      expect(prunedRows.length).toBeGreaterThan(0);
    });
  });
});
