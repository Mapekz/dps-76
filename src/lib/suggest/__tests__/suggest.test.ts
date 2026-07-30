import { describe, it, expect } from 'bun:test';
import {
  makeBuildReducer,
  createDefaultBuildState,
  type BuildAction,
  type BuildState,
} from '@/state/build-reducer';
import { getPerks } from '@/data';
import { enumerateVariants } from '@/lib/suggest/variants';
import {
  collapseSuggestionFamilies,
  evaluateSuggestions,
  snapshotOf,
  topSuggestions,
} from '@/lib/suggest/evaluate';
import type { DpsSnapshot, EvaluatedSuggestion, ScenarioHeadline } from '@/lib/suggest/types';
import { resolveLoadout } from '@/lib/loadout';
import { computeScenarios } from '@/lib/engine/scenarios';
import { PerkId } from '@/data/perk-ids';

const buildReducer = makeBuildReducer('live');

function stateFrom(
  actions: BuildAction[],
  from: BuildState = createDefaultBuildState(),
): BuildState {
  return actions.reduce(buildReducer, from);
}

const fixerState = stateFrom([
  { type: 'weapon/select', weaponId: 'CombatRifle_Fixer' },
  { type: 'perk/add', perkId: PerkId.CenterMasochist, rank: 1, legendary: false },
]);

// Tier-4 legendary armor effects (all engine-effective, per getArmorEffects'
// own curation filter) used across the armor-enumeration tests below.
const ARMOR_A = 'mod_Legendary_Armor4_BattleLoaders'; // Battle-Loader's
const ARMOR_B = 'mod_Legendary_Armor4_LimitBreak'; // Limit-Breaking
const ARMOR_MISC = 'mod_armor_UnderArmor_style_Casual'; // Casual Style (misc, maxCount 1)

describe('enumerateVariants', () => {
  it('emits omod alternatives per slot but never the equipped option', () => {
    const withReceiver = stateFrom(
      [
        {
          type: 'weapon/mod',
          slot: 'ap_gun_Receiver',
          omodId: 'mod_CombatRifle_Receiver_Damage-Auto',
        },
      ],
      fixerState,
    );
    const variants = enumerateVariants(withReceiver, 'live');
    const receiverMods = variants.filter((v) => v.id.startsWith('mod:ap_gun_Receiver'));
    expect(receiverMods.length).toBeGreaterThan(0);
    expect(receiverMods.some((v) => v.id.endsWith('mod_CombatRifle_Receiver_Damage-Auto'))).toBe(
      false,
    );
    // Unequipping back to stock is offered once something is equipped.
    expect(receiverMods.some((v) => v.id === 'mod:ap_gun_Receiver:stock')).toBe(true);
  });

  it('offers per-rank rank-ups for equipped perks and per-rank adds for damage-relevant unequipped ones', () => {
    const variants = enumerateVariants(fixerState, 'live');
    const rankUp = variants.find((v) => v.id === `perk-rank:${PerkId.CenterMasochist}:2`);
    expect(rankUp?.action).toEqual([
      { type: 'perk/setRank', perkId: PerkId.CenterMasochist, rank: 2 },
    ]);
    expect(rankUp?.family).toBe(`perk:${PerkId.CenterMasochist}`);
    expect(variants.some((v) => v.id.startsWith('perk-add:'))).toBe(true);
    // Perk at max rank offers no candidate anywhere in its family (base raised
    // so the rank-up isn't merely budget-blocked — the family is genuinely empty).
    const maxed = stateFrom(
      [
        { type: 'special/set', stat: 'perception', value: 3 },
        { type: 'perk/setRank', perkId: PerkId.CenterMasochist, rank: 3 },
      ],
      fixerState,
    );
    expect(
      enumerateVariants(maxed, 'live').some((v) => v.family === `perk:${PerkId.CenterMasochist}`),
    ).toBe(false);
  });

  it('flags perk moves that break the SPECIAL budget with the deficit', () => {
    // Base Perception 1 with its 1 card point spent (Center Masochist rank 1)
    // → the rank-up is illegal by exactly 1 point.
    const variants = enumerateVariants(fixerState, 'live');
    const rankUp = variants.find((v) => v.id === `perk-rank:${PerkId.CenterMasochist}:2`);
    expect(rankUp?.budget).toEqual({ legal: false, special: 'perception', deficit: 1 });
  });

  it('emits one candidate per rank above current, for a multi-rank equipped perk', () => {
    // Center Masochist: maxRank 3, costs [1, 2, 3] — rank 1 is equipped in
    // fixerState, so ranks 2 and 3 should both be offered, same family, with
    // point deltas 1 (2-1) and 2 (3-1) respectively.
    const perk = getPerks('live')[PerkId.CenterMasochist];
    expect(perk.maxRank).toBe(3);

    const variants = enumerateVariants(fixerState, 'live');
    const rank2 = variants.find((v) => v.id === `perk-rank:${PerkId.CenterMasochist}:2`);
    const rank3 = variants.find((v) => v.id === `perk-rank:${PerkId.CenterMasochist}:3`);
    expect(rank2).toBeDefined();
    expect(rank3).toBeDefined();
    expect(rank2!.family).toBe(rank3!.family);
    expect(rank2!.cost).toBe(1);
    expect(rank3!.cost).toBe(2);
    // No rank-4 (past maxRank) or rank-1 (current) candidate.
    expect(variants.some((v) => v.id === `perk-rank:${PerkId.CenterMasochist}:4`)).toBe(false);
    expect(variants.some((v) => v.id === `perk-rank:${PerkId.CenterMasochist}:1`)).toBe(false);
  });

  it('offers every rank 1..maxRank for unequipped damage-relevant perks', () => {
    const variants = enumerateVariants(fixerState, 'live');
    const addCandidates = variants.filter((v) => v.id.startsWith('perk-add:'));
    expect(addCandidates.length).toBeGreaterThan(0);

    const byPerk = new Map<string, typeof addCandidates>();
    for (const c of addCandidates) {
      const perkId = c.id.split(':')[1];
      const list = byPerk.get(perkId) ?? [];
      list.push(c);
      byPerk.set(perkId, list);
    }

    const registry = getPerks('live');
    for (const [perkId, candidates] of byPerk) {
      const perk = registry[perkId as PerkId];
      expect(perk).toBeDefined();
      const ranks = candidates.map((c) => Number(c.id.split(':')[2])).sort((a, b) => a - b);
      expect(ranks).toEqual(Array.from({ length: perk.maxRank }, (_, i) => i + 1));
      // Every candidate in an unequipped perk's family stays that same family.
      expect(candidates.every((c) => c.family === `perk:${perkId}`)).toBe(true);
    }
  });

  it('offers mutation toggles in both directions', () => {
    const variants = enumerateVariants(fixerState, 'live');
    const takes = variants.filter((v) => v.group === 'mutation' && v.label.startsWith('Take'));
    expect(takes.length).toBeGreaterThan(0);
    const firstAction = takes[0].action[0];
    const withMutation = stateFrom(
      [
        {
          type: 'mutation/toggle',
          id: firstAction.type === 'mutation/toggle' ? firstAction.id : '',
        },
      ],
      fixerState,
    );
    const drops = enumerateVariants(withMutation, 'live').filter(
      (v) => v.group === 'mutation' && v.label.startsWith('Drop'),
    );
    expect(drops.length).toBe(1);
  });

  describe('armor effects', () => {
    it('caps plain increases to the remaining per-tier budget and offers same-tier swaps', () => {
      const withA = stateFrom(
        [{ type: 'armorEffect/setCount', id: ARMOR_A, count: 3 }],
        fixerState,
      );
      const variants = enumerateVariants(withA, 'live');

      // free = 5 - 3 = 2: B (currently 0) can only step up to 1 and 2.
      const bIncreases = variants.filter((v) => v.id.startsWith(`armor-count:${ARMOR_B}:`));
      const bCounts = bIncreases.map((v) => Number(v.id.split(':')[2])).sort((a, b) => a - b);
      expect(bCounts).toEqual([1, 2]);
      expect(bIncreases.every((v) => v.group === 'armor' && v.budget.legal)).toBe(true);
      expect(bIncreases.every((v) => v.family === `armor-count:${ARMOR_B}`)).toBe(true);

      // Swaps: k of A (count 3) replaced by k of B, for every k in 1..3.
      const swaps = variants.filter((v) => v.id.startsWith(`armor-swap:${ARMOR_A}:${ARMOR_B}:`));
      const swapKs = swaps.map((v) => Number(v.id.split(':')[3])).sort((a, b) => a - b);
      expect(swapKs).toEqual([1, 2, 3]);
      const swapK1 = swaps.find((v) => v.id === `armor-swap:${ARMOR_A}:${ARMOR_B}:1`)!;
      expect(swapK1.action).toEqual([
        { type: 'armorEffect/setCount', id: ARMOR_A, count: 2 },
        { type: 'armorEffect/setCount', id: ARMOR_B, count: 1 },
      ]);
      expect(swapK1.budget.legal).toBe(true);
      expect(swapK1.cost).toBe(1);
      expect(swaps.every((v) => v.family === `armor-swap:${ARMOR_A}->${ARMOR_B}`)).toBe(true);
    });

    it('offers no plain increases anywhere in a full tier, only swaps', () => {
      const fullTier = stateFrom(
        [{ type: 'armorEffect/setCount', id: ARMOR_A, count: 5 }],
        fixerState,
      );
      const variants = enumerateVariants(fullTier, 'live');

      const tier4Increases = variants.filter(
        (v) => v.group === 'armor' && v.id.startsWith('armor-count:') && v.id.includes('Armor4'),
      );
      expect(tier4Increases).toEqual([]);

      const swaps = variants.filter((v) => v.id.startsWith(`armor-swap:${ARMOR_A}:${ARMOR_B}:`));
      const swapKs = swaps.map((v) => Number(v.id.split(':')[3])).sort((a, b) => a - b);
      expect(swapKs).toEqual([1, 2, 3, 4, 5]);
    });

    it('offers plain increases for misc effects with no per-tier cap', () => {
      const fullTier = stateFrom(
        [{ type: 'armorEffect/setCount', id: ARMOR_A, count: 5 }],
        fixerState,
      );
      const variants = enumerateVariants(fullTier, 'live');
      const miscIncrease = variants.find((v) => v.id === `armor-count:${ARMOR_MISC}:1`);
      expect(miscIncrease).toBeDefined();
      expect(miscIncrease?.group).toBe('armor');
      expect(miscIncrease?.budget.legal).toBe(true);
    });
  });
});

describe('evaluateSuggestions', () => {
  it('baseline equals a direct computeScenarios of the unpatched config (drift guard)', () => {
    const report = evaluateSuggestions(fixerState, 'live', 'freeAim');
    const direct = snapshotOf(
      computeScenarios(resolveLoadout(fixerState.player, fixerState.enemy, 'live')!),
    );
    expect(report.baseline).toEqual(direct);
  });

  it('ranks by the chosen metric and computes hand-checkable deltas', () => {
    const report = evaluateSuggestions(fixerState, 'live', 'freeAim');
    // Center Masochist rank 2 on torso hits: +25% dbm over rank 1's +75%... rank deltas
    // are data-driven; just verify ordering and delta arithmetic consistency.
    for (const s of report.suggestions.slice(0, 20)) {
      expect(s.result.freeAim.sustainedDps - report.baseline!.freeAim.sustainedDps).toBeCloseTo(
        s.delta.freeAim.sustainedDps,
        8,
      );
      expect(s.primaryDeltaPct).toBeCloseTo(
        s.delta.freeAim.sustainedDps / report.baseline!.freeAim.sustainedDps,
        8,
      );
    }
    const sorted = [...report.suggestions].sort((a, b) => b.primaryDeltaPct - a.primaryDeltaPct);
    expect(report.suggestions.map((s) => s.id)).toEqual(sorted.map((s) => s.id));
  });

  it('returns an empty report with no weapon equipped', () => {
    const report = evaluateSuggestions(createDefaultBuildState(), 'live', 'vats');
    expect(report.baseline).toBeNull();
    expect(report.suggestions).toEqual([]);
  });

  it('topSuggestions splits ranked movers from <1% ties and drops losers', () => {
    const report = evaluateSuggestions(fixerState, 'live', 'freeAim');
    const { ranked, tied } = topSuggestions(report, 8);
    expect(ranked.every((s) => s.primaryDeltaPct >= 0.01)).toBe(true);
    expect(tied.every((s) => s.primaryDeltaPct > 0 && s.primaryDeltaPct < 0.01)).toBe(true);
    expect(ranked.length).toBeLessThanOrEqual(8);
  });

  it('topSuggestions defaults to structural groups only, but an explicit group set can select consumables', () => {
    const report = evaluateSuggestions(fixerState, 'live', 'vats');

    const consumableOnly = topSuggestions(report, 20, 0.01, { groups: new Set(['consumable']) });
    const allConsumable = [...consumableOnly.ranked, ...consumableOnly.tied];
    expect(allConsumable.length).toBeGreaterThan(0);
    expect(allConsumable.every((s) => s.group === 'consumable')).toBe(true);

    const structuralOnly = topSuggestions(report, 20);
    const allStructural = [...structuralOnly.ranked, ...structuralOnly.tied];
    expect(allStructural.every((s) => s.group !== 'consumable')).toBe(true);
  });
});

describe('collapseSuggestionFamilies', () => {
  const headline: ScenarioHeadline = { perHit: 0, burstDps: 0, sustainedDps: 0 };
  const snapshot: DpsSnapshot = { freeAim: headline, vats: headline };

  function fixture(
    id: string,
    family: string,
    cost: number,
    primaryDeltaPct: number,
  ): EvaluatedSuggestion {
    return {
      id,
      action: [],
      label: id,
      group: 'perk',
      budget: { legal: true },
      family,
      cost,
      result: snapshot,
      delta: snapshot,
      primaryDeltaPct,
    };
  }

  it('collapses a monotonic 3-member family to next (+10%) and best (+20%)', () => {
    const members = [
      fixture('f1:0', 'f1', 0, 0),
      fixture('f1:1', 'f1', 1, 0.1),
      fixture('f1:2', 'f1', 2, 0.2),
    ];
    const result = collapseSuggestionFamilies(members);
    expect(result.map((r) => r.id).sort()).toEqual(['f1:1', 'f1:2']);
  });

  it('collapses a plateau (two members tied at the top delta) to a single, cheaper row', () => {
    const members = [
      fixture('f2:0', 'f2', 0, 0),
      fixture('f2:1', 'f2', 1, 0.2),
      fixture('f2:2', 'f2', 2, 0.2),
    ];
    const result = collapseSuggestionFamilies(members);
    expect(result.map((r) => r.id)).toEqual(['f2:1']);
  });

  it('passes size-1 families through untouched', () => {
    const members = [fixture('f3:0', 'f3', 0, -0.05)];
    const result = collapseSuggestionFamilies(members);
    expect(result).toEqual(members);
  });

  it('collapses an all-non-positive family to a single best member', () => {
    const members = [
      fixture('f4:0', 'f4', 0, -0.1),
      fixture('f4:1', 'f4', 1, 0),
      fixture('f4:2', 'f4', 2, -0.2),
    ];
    const result = collapseSuggestionFamilies(members);
    expect(result.map((r) => r.id)).toEqual(['f4:1']);
  });

  it('leaves distinct families independent of each other', () => {
    const members = [fixture('a:0', 'a', 0, 0.05), fixture('b:0', 'b', 0, 0.1)];
    const result = collapseSuggestionFamilies(members);
    expect(result.map((r) => r.id).sort()).toEqual(['a:0', 'b:0']);
  });
});
