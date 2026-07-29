import { describe, it, expect } from 'bun:test';
import {
  makeBuildReducer,
  createDefaultBuildState,
  type BuildAction,
  type BuildState,
} from '@/state/build-reducer';
import { enumerateVariants } from '@/lib/suggest/variants';
import { evaluateSuggestions, snapshotOf, topSuggestions } from '@/lib/suggest/evaluate';
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

  it('offers rank-ups for equipped perks and adds for damage-relevant unequipped ones', () => {
    const variants = enumerateVariants(fixerState, 'live');
    const rankUp = variants.find((v) => v.id === `perk-rank:${PerkId.CenterMasochist}`);
    expect(rankUp?.action).toEqual({
      type: 'perk/setRank',
      perkId: PerkId.CenterMasochist,
      rank: 2,
    });
    expect(variants.some((v) => v.id.startsWith('perk-add:'))).toBe(true);
    // Perk at max rank is not offered a rank-up (base raised so the rank-up isn't budget-blocked).
    const maxed = stateFrom(
      [
        { type: 'special/set', stat: 'perception', value: 3 },
        { type: 'perk/setRank', perkId: PerkId.CenterMasochist, rank: 3 },
      ],
      fixerState,
    );
    expect(
      enumerateVariants(maxed, 'live').some((v) => v.id === `perk-rank:${PerkId.CenterMasochist}`),
    ).toBe(false);
  });

  it('flags perk moves that break the SPECIAL budget with the deficit', () => {
    // Base Perception 1 with its 1 card point spent (Center Masochist rank 1)
    // → the rank-up is illegal by exactly 1 point.
    const variants = enumerateVariants(fixerState, 'live');
    const rankUp = variants.find((v) => v.id === `perk-rank:${PerkId.CenterMasochist}`);
    expect(rankUp?.budget).toEqual({ legal: false, special: 'perception', deficit: 1 });
  });

  it('offers mutation toggles in both directions', () => {
    const variants = enumerateVariants(fixerState, 'live');
    const takes = variants.filter((v) => v.group === 'mutation' && v.label.startsWith('Take'));
    expect(takes.length).toBeGreaterThan(0);
    const withMutation = stateFrom(
      [
        {
          type: 'mutation/toggle',
          id: takes[0].action.type === 'mutation/toggle' ? takes[0].action.id : '',
        },
      ],
      fixerState,
    );
    const drops = enumerateVariants(withMutation, 'live').filter(
      (v) => v.group === 'mutation' && v.label.startsWith('Drop'),
    );
    expect(drops.length).toBe(1);
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
});
