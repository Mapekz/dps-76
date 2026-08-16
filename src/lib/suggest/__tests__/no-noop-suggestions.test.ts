import { describe, expect, it } from 'bun:test';
import type { GameMode } from '@/types';
import {
  makeBuildReducer,
  createDefaultBuildState,
  type BuildAction,
  type BuildState,
} from '@/state/build-reducer';
import { PerkId } from '@/data/perk-ids';
import { allocationOf } from '@/lib/build-rules';
import { getPerks, getWeapons } from '@/data';
import { computePerkBudget, perkSpecialKey } from '@/data/perk-budget';
import { perkHasEngineEffect } from '@/data/perk-modifiers';
import { SPECIAL_ALLOCATION_POOL } from '@/lib/player-stats';
import { evaluateSuggestions, topSuggestions } from '@/lib/suggest/evaluate';
import type { EvaluatedSuggestion, SuggestionReport } from '@/lib/suggest/types';
import { buildStaticLoadoutContext } from '@/lib/suggest/loadout-context';

const MODE: GameMode = 'live';
const buildReducer = makeBuildReducer(MODE);
const BIG_LIMIT = 500;

function stateFrom(
  actions: BuildAction[],
  from: BuildState = createDefaultBuildState(),
): BuildState {
  return actions.reduce(buildReducer, from);
}

function applyActions(state: BuildState, actions: readonly BuildAction[]): BuildState {
  let next = state;
  for (const action of actions) next = buildReducer(next, action);
  return next;
}

function surfaced(report: SuggestionReport, groups?: ReadonlySet<EvaluatedSuggestion['group']>) {
  const opts = groups ? { groups } : {};
  const { ranked, tied } = topSuggestions(report, BIG_LIMIT, 0.01, opts);
  return [...ranked, ...tied];
}

function assertUniversalInvariants(state: BuildState, report: SuggestionReport): void {
  for (const scope of [surfaced(report), surfaced(report, new Set(['consumable'] as const))]) {
    for (const suggestion of scope) {
      expect(suggestion.primaryDeltaPct).toBeGreaterThan(0);
      const applied = applyActions(state, suggestion.action);
      expect(applied).not.toEqual(state);
    }
  }
}

describe('over-budget perk with NO free pool points', () => {
  it('does not surface unaffordable luck-gated perks when the allocation pool is full', () => {
    const state = stateFrom([
      { type: 'weapon/select', weaponId: 'CombatRifle_Fixer' },
      { type: 'special/set', stat: 'strength', value: 15 },
      { type: 'special/set', stat: 'perception', value: 15 },
      { type: 'special/set', stat: 'endurance', value: 15 },
      { type: 'special/set', stat: 'charisma', value: 4 },
      { type: 'special/set', stat: 'intelligence', value: 3 },
      { type: 'special/set', stat: 'agility', value: 3 },
      { type: 'special/set', stat: 'luck', value: 1 },
      { type: 'perk/add', perkId: PerkId.LuckyBreak, rank: 1, legendary: false },
    ]);

    const allocated = Object.values(allocationOf(state.player)).reduce((sum, v) => sum + v, 0);
    expect(allocated).toBe(SPECIAL_ALLOCATION_POOL);

    const report = evaluateSuggestions(state, MODE, 'vats');
    const luckAdds = surfaced(report).filter((s) => s.family === `perk:${PerkId.BetterCriticals}`);
    expect(luckAdds).toEqual([]);

    assertUniversalInvariants(state, report);
  });
});

describe('over-budget perk WITH free pool points', () => {
  it('surfaces an allocation compound for a luck perk with a (+N LCK) label', () => {
    const state = stateFrom([
      { type: 'weapon/select', weaponId: 'CombatRifle_Fixer' },
      { type: 'special/set', stat: 'luck', value: 1 },
    ]);

    const report = evaluateSuggestions(state, MODE, 'vats');
    const allocation = surfaced(report).filter(
      (s) => s.family === `perk:${PerkId.BetterCriticals}`,
    );
    expect(allocation.length).toBeGreaterThan(0);
    expect(allocation.some((s) => /\(\+\d+ LCK\)$/.test(s.label))).toBe(true);
    expect(allocation.every((s) => s.primaryDeltaPct > 0)).toBe(true);

    const pick = allocation.find((s) => s.action[0]?.type === 'special/set') ?? allocation[0];
    const applied = applyActions(state, pick.action);
    expect(applied.player.conditions.luck).toBeGreaterThan(state.player.conditions.luck);
    expect(applied.player.perks.some((p) => p.perkId === PerkId.BetterCriticals)).toBe(true);

    assertUniversalInvariants(state, report);
  });
});

describe('full legendary perk slots (6 equipped)', () => {
  it('offers swaps only — no plain legendary adds — and each swap changes legendaryPerks', () => {
    const state = stateFrom([
      { type: 'weapon/select', weaponId: 'CombatRifle_Fixer' },
      { type: 'perk/add', perkId: PerkId.FollowThrough, rank: 1, legendary: true },
      { type: 'perk/add', perkId: PerkId.TakingOneForTheTeam, rank: 1, legendary: true },
      { type: 'perk/add', perkId: PerkId.LegendaryAgility, rank: 1, legendary: true },
      { type: 'perk/add', perkId: PerkId.LegendaryPerception, rank: 1, legendary: true },
      { type: 'perk/add', perkId: PerkId.LegendaryLuck, rank: 1, legendary: true },
      { type: 'perk/add', perkId: PerkId.LegendaryStrength, rank: 1, legendary: true },
    ]);
    expect(state.player.legendaryPerks).toHaveLength(6);

    const report = evaluateSuggestions(state, MODE, 'vats');
    const legSuggestions = surfaced(report).filter(
      (s) =>
        s.group === 'perk' &&
        (s.id.startsWith('leg-perk-swap:') ||
          (s.id.startsWith('perk-add:') &&
            s.action.some((a) => a.type === 'perk/add' && a.legendary))),
    );

    expect(legSuggestions.every((s) => s.label.includes(' → '))).toBe(true);
    expect(
      legSuggestions.some(
        (s) =>
          s.id.startsWith('perk-add:') &&
          s.action.length === 1 &&
          s.action[0].type === 'perk/add' &&
          s.action[0].legendary,
      ),
    ).toBe(false);

    for (const suggestion of legSuggestions) {
      const applied = applyActions(state, suggestion.action);
      const before = new Set(state.player.legendaryPerks.map((p) => p.perkId));
      const after = new Set(applied.player.legendaryPerks.map((p) => p.perkId));
      expect(before).not.toEqual(after);
    }

    assertUniversalInvariants(state, report);
  });
});

describe('stat at the 15 cap', () => {
  it('does not surface allocation fixes when luck is capped and card budget is exhausted', () => {
    const weapon = getWeapons(MODE)['CombatRifle_Fixer'];
    let state = stateFrom([
      { type: 'weapon/select', weaponId: 'CombatRifle_Fixer' },
      { type: 'special/set', stat: 'luck', value: 15 },
      { type: 'perk/add', perkId: PerkId.LuckyBreak, rank: 3, legendary: false },
      { type: 'perk/add', perkId: PerkId.BetterCriticals, rank: 3, legendary: false },
      { type: 'perk/add', perkId: PerkId.LuckOfTheDraw, rank: 3, legendary: false },
      { type: 'perk/add', perkId: PerkId.HappyGoLucky, rank: 2, legendary: false },
      { type: 'perk/add', perkId: PerkId.Scrounger, rank: 1, legendary: false },
    ]);

    const ctx = buildStaticLoadoutContext(MODE, state.player, weapon);
    const equipped = new Set(state.player.perks.map((p) => p.perkId));
    const registry = getPerks(MODE);
    for (const [perkId, perk] of Object.entries(registry)) {
      if (equipped.has(perkId)) continue;
      if (perkSpecialKey(MODE, perkId) !== 'luck') continue;
      if (!perkHasEngineEffect(MODE, perkId, ctx)) continue;
      state = buildReducer(state, {
        type: 'perk/add',
        perkId,
        rank: perk.maxRank,
        legendary: false,
      });
      equipped.add(perkId);
      const budget = computePerkBudget(
        MODE,
        state.player.perks,
        state.player.legendaryPerks,
        allocationOf(state.player),
      );
      if (budget.cardPoints.luck >= budget.budgetPerStat.luck) break;
    }

    const report = evaluateSuggestions(state, MODE, 'vats');
    const luckAdds = surfaced(report).filter(
      (s) => s.group === 'perk' && perkSpecialKey(MODE, s.family.slice('perk:'.length)) === 'luck',
    );
    expect(luckAdds).toEqual([]);

    assertUniversalInvariants(state, report);
  });
});

describe('inert-only candidate', () => {
  it('never surfaces rows whose Apply leaves DPS and state unchanged', () => {
    const state = stateFrom([
      { type: 'weapon/select', weaponId: 'CombatRifle_Fixer' },
      { type: 'mutation/toggle', id: 'Mutation_SpeedDemon' },
      { type: 'consumable/toggle', id: 'Brew_BlackwaterBrew' },
    ]);

    const report = evaluateSuggestions(state, MODE, 'vats');
    assertUniversalInvariants(state, report);
  });
});
