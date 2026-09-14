import { beforeAll, describe, it, expect } from 'bun:test';
import { createDefaultBuildState, type BuildState } from '@/state/build-reducer';
import {
  buildReducer,
  fixerCenterMasochistState,
  stateFrom,
} from '@/state/__tests__/build-state-fixture';
import { getPerks } from '@/data';
import { getArmorEffects } from '@/data/armor-modifiers';
import { computePerkBudget } from '@/data/perk-budget';
import { perkCardCostAtRank } from '@/lib/player-stats';
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

const fixerCmState = fixerCenterMasochistState();

// Tier-4 legendary armor effects (all engine-effective, per getArmorEffects'
// own curation filter) used across the armor-enumeration tests below.
const ARMOR_A = 'mod_Legendary_Armor4_BattleLoaders'; // Battle-Loader's
const ARMOR_B = 'mod_Legendary_Armor4_LimitBreak'; // Limit-Breaking
const ARMOR_MISC = 'mod_armor_UnderArmor_style_Casual'; // Casual Style (misc, maxCount 1)

describe('enumerateVariants', () => {
  let fixerCmVariants: ReturnType<typeof enumerateVariants>;
  beforeAll(() => {
    fixerCmVariants = enumerateVariants(fixerCmState, 'live', 'vats');
  });

  it('emits omod alternatives per slot but never the equipped option', () => {
    const withReceiver = stateFrom(
      [
        {
          type: 'weapon/mod',
          slot: 'ap_gun_Receiver',
          omodId: 'mod_CombatRifle_Receiver_Damage-Auto',
        },
      ],
      fixerCmState,
    );
    const variants = enumerateVariants(withReceiver, 'live', 'vats');
    const receiverMods = variants.filter((v) => v.id.startsWith('mod:ap_gun_Receiver'));
    expect(receiverMods.length).toBeGreaterThan(0);
    expect(receiverMods.some((v) => v.id.endsWith('mod_CombatRifle_Receiver_Damage-Auto'))).toBe(
      false,
    );
    // Unequipping back to stock is offered once something is equipped.
    expect(receiverMods.some((v) => v.id === 'mod:ap_gun_Receiver:stock')).toBe(true);
  });

  it('offers no candidate in the family of an equipped perk at max rank', () => {
    // Perk at max rank offers no candidate anywhere in its family (base raised
    // so the rank-up isn't merely budget-blocked — the family is genuinely empty).
    const maxed = stateFrom(
      [
        { type: 'special/set', stat: 'perception', value: 3 },
        { type: 'perk/setRank', perkId: PerkId.CenterMasochist, rank: 3 },
      ],
      fixerCmState,
    );
    expect(
      enumerateVariants(maxed, 'live', 'vats').some(
        (v) => v.family === `perk:${PerkId.CenterMasochist}`,
      ),
    ).toBe(false);
  });

  it('turns over-budget perk rank-ups into allocation compounds', () => {
    // Base Perception 1 with its 1 card point spent (Center Masochist rank 1)
    // → the rank-up becomes [special/set, perk/setRank], not a bare illegal row.
    expect(fixerCmVariants.some((v) => v.id === `perk-rank:${PerkId.CenterMasochist}:2`)).toBe(
      false,
    );
    const rankUp = fixerCmVariants.find(
      (v) => v.id === `perk-rank:${PerkId.CenterMasochist}:2:alloc`,
    );
    expect(rankUp).toBeDefined();
    expect(rankUp!.action).toEqual([
      { type: 'special/set', stat: 'perception', value: 2 },
      { type: 'perk/setRank', perkId: PerkId.CenterMasochist, rank: 2 },
    ]);
    expect(rankUp!.family).toBe(`perk:${PerkId.CenterMasochist}`);
    expect(rankUp!.label).toMatch(/\(\+\d+ PER\)$/);
  });

  it('emits one candidate per rank above current, for a multi-rank equipped perk', () => {
    // Center Masochist: maxRank 3, costs [1, 2, 3] — rank 1 is equipped in
    // fixerCmState, so ranks 2 and 3 should both be offered, same family, with
    // point deltas 1 (2-1) and 2 (3-1) respectively.
    const perk = getPerks('live')[PerkId.CenterMasochist];
    expect(perk.maxRank).toBe(3);

    const rank2 = fixerCmVariants.find(
      (v) => v.id === `perk-rank:${PerkId.CenterMasochist}:2:alloc`,
    );
    const rank3 = fixerCmVariants.find(
      (v) => v.id === `perk-rank:${PerkId.CenterMasochist}:3:alloc`,
    );
    expect(rank2).toBeDefined();
    expect(rank3).toBeDefined();
    expect(rank2!.family).toBe(rank3!.family);
    expect(rank2!.cost).toBe(2);
    expect(rank3!.cost).toBe(4);
    // No rank-4 (past maxRank) or rank-1 (current) candidate.
    expect(fixerCmVariants.some((v) => v.id === `perk-rank:${PerkId.CenterMasochist}:4`)).toBe(
      false,
    );
    expect(fixerCmVariants.some((v) => v.id === `perk-rank:${PerkId.CenterMasochist}:1`)).toBe(
      false,
    );
  });

  it('offers every rank 1..maxRank for unequipped damage-relevant perks', () => {
    const addCandidates = fixerCmVariants.filter((v) => v.id.startsWith('perk-add:'));
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
    const takes = fixerCmVariants.filter(
      (v) => v.group === 'mutation' && v.label.startsWith('Take'),
    );
    expect(takes.length).toBeGreaterThan(0);
    const firstAction = takes[0].action[0];
    const withMutation = stateFrom(
      [
        {
          type: 'mutation/toggle',
          id: firstAction.type === 'mutation/toggle' ? firstAction.id : '',
        },
      ],
      fixerCmState,
    );
    const drops = enumerateVariants(withMutation, 'live', 'vats').filter(
      (v) => v.group === 'mutation' && v.label.startsWith('Drop'),
    );
    expect(drops.length).toBe(1);
  });

  describe('armor effects', () => {
    let fullTierVariants: ReturnType<typeof enumerateVariants>;
    beforeAll(() => {
      const fullTier = stateFrom(
        [{ type: 'armorEffect/setCount', id: ARMOR_A, count: 5 }],
        fixerCmState,
      );
      fullTierVariants = enumerateVariants(fullTier, 'live', 'vats');
    });

    it('caps plain increases to the remaining per-tier budget and offers same-tier swaps', () => {
      const withA = stateFrom(
        [{ type: 'armorEffect/setCount', id: ARMOR_A, count: 3 }],
        fixerCmState,
      );
      const variants = enumerateVariants(withA, 'live', 'vats');

      // free = 5 - 3 = 2: B (currently 0) can only step up to 1 and 2.
      const bIncreases = variants.filter((v) => v.id.startsWith(`armor-count:${ARMOR_B}:`));
      const bCounts = bIncreases.map((v) => Number(v.id.split(':')[2])).sort((a, b) => a - b);
      expect(bCounts).toEqual([1, 2]);
      expect(bIncreases.every((v) => v.group === 'armor')).toBe(true);
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
      expect(swapK1.cost).toBe(1);
      expect(swaps.every((v) => v.family === `armor-swap:${ARMOR_A}->${ARMOR_B}`)).toBe(true);
    });

    it('offers no plain increases anywhere in a full tier, only swaps', () => {
      const tier4Increases = fullTierVariants.filter(
        (v) => v.group === 'armor' && v.id.startsWith('armor-count:') && v.id.includes('Armor4'),
      );
      expect(tier4Increases).toEqual([]);

      const swaps = fullTierVariants.filter((v) =>
        v.id.startsWith(`armor-swap:${ARMOR_A}:${ARMOR_B}:`),
      );
      const swapKs = swaps.map((v) => Number(v.id.split(':')[3])).sort((a, b) => a - b);
      expect(swapKs).toEqual([1, 2, 3, 4, 5]);
    });

    it('offers plain increases for misc effects with no per-tier cap', () => {
      const miscIncrease = fullTierVariants.find((v) => v.id === `armor-count:${ARMOR_MISC}:1`);
      expect(miscIncrease).toBeDefined();
      expect(miscIncrease?.group).toBe('armor');
    });

    it('never proposes counts above feasible piece limits or wrong-armor-type effects', () => {
      const ULTRA_LIGHT = getArmorEffects('live').find((e) => e.name === 'Ultra-Light Build')!.id;
      const BODY_JETPACK = 'mod_armor_BOSInfantry_JetPack';
      const UNYIELDING = 'mod_Legendary_Armor1_LowHealthIncreasesStats';

      const withJetpack = stateFrom(
        [{ type: 'armorEffect/setCount', id: BODY_JETPACK, count: 1 }],
        fixerCmState,
      );
      const increases = enumerateVariants(withJetpack, 'live', 'vats').filter((v) =>
        v.id.startsWith(`armor-count:${ULTRA_LIGHT}:`),
      );
      expect(increases.length).toBeGreaterThan(0);
      expect(increases.every((v) => Number(v.id.split(':')[2]) <= 4)).toBe(true);

      const inPa = stateFrom([{ type: 'armorType/set', armorWorn: 'power' }], fixerCmState);
      const paVariants = enumerateVariants(inPa, 'live', 'vats');
      expect(paVariants.some((v) => v.id.includes(UNYIELDING))).toBe(false);
      expect(
        paVariants.some((v) => v.id.startsWith('armor-count:') && v.id.includes(BODY_JETPACK)),
      ).toBe(false);
    });
  });
});

describe('evaluateSuggestions', () => {
  let freeAimReport: ReturnType<typeof evaluateSuggestions>;
  let vatsReport: ReturnType<typeof evaluateSuggestions>;
  let baselineScenarios: ReturnType<typeof computeScenarios>;

  beforeAll(() => {
    baselineScenarios = computeScenarios(
      resolveLoadout(fixerCmState.player, fixerCmState.enemy, 'live')!,
    );
    freeAimReport = evaluateSuggestions(fixerCmState, 'live', 'freeAim');
    vatsReport = evaluateSuggestions(fixerCmState, 'live', 'vats');
  });

  it('baseline equals a direct computeScenarios of the unpatched config (drift guard)', () => {
    expect(freeAimReport.baseline).toEqual(snapshotOf(baselineScenarios));
  });

  it('ranks by the chosen metric and computes hand-checkable deltas', () => {
    const report = freeAimReport;
    // Center Masochist rank 2 on torso hits: +25% dbm over rank 1's +75%... rank deltas
    // are data-driven; just verify ordering and delta arithmetic consistency.
    for (const s of report.suggestions.slice(0, 20)) {
      expect(s.result.freeAim.totalDps - report.baseline!.freeAim.totalDps).toBeCloseTo(
        s.delta.freeAim.totalDps,
        8,
      );
      expect(s.primaryDeltaPct).toBeCloseTo(
        s.delta.freeAim.totalDps / report.baseline!.freeAim.totalDps,
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

  it('topSuggestions splits ranked movers from <1% ties and surfaces allocation compounds', () => {
    const report = vatsReport;
    const { ranked, tied } = topSuggestions(report, 8);
    expect(ranked.every((s) => s.primaryDeltaPct >= 0.01)).toBe(true);
    expect(tied.every((s) => s.primaryDeltaPct > 0 && s.primaryDeltaPct < 0.01)).toBe(true);
    expect(ranked.length).toBeLessThanOrEqual(8);
    expect(report.suggestions.some((s) => s.id.endsWith(':alloc'))).toBe(true);
    const all = topSuggestions(report, 500);
    const allocation = [...all.ranked, ...all.tied].find((s) => s.id.endsWith(':alloc'));
    expect(allocation).toBeDefined();
    expect(allocation!.action.some((a) => a.type === 'special/set')).toBe(true);
  });

  it('topSuggestions defaults to structural groups only, but an explicit group set can select consumables', () => {
    const report = vatsReport;

    const consumableOnly = topSuggestions(report, 20, 0.01, { groups: new Set(['consumable']) });
    const allConsumable = [...consumableOnly.ranked, ...consumableOnly.tied];
    expect(allConsumable.length).toBeGreaterThan(0);
    expect(allConsumable.every((s) => s.group === 'consumable')).toBe(true);

    const structuralOnly = topSuggestions(report, 20);
    const allStructural = [...structuralOnly.ranked, ...structuralOnly.tied];
    expect(allStructural.every((s) => s.group !== 'consumable')).toBe(true);
  });

  it("a proc-carrying legendary (Electrician's) produces a nonzero preview delta", () => {
    // Electrician's damage is entirely Weapon.procs (reload-cycle explosion) —
    // it never touches sustain.sustainedDps, so the pre-totalDps metric printed
    // ±0%. Rank on freeAim so AP blending cannot hide the proc stream.
    const report = freeAimReport;
    const electrician = report.suggestions.find((s) =>
      s.id.includes('mod_Legendary_Weapon4_Guns_Electricians'),
    );
    expect(electrician).toBeDefined();
    expect(electrician!.delta.freeAim.totalDps).toBeGreaterThan(0);
    expect(electrician!.primaryDeltaPct).toBeGreaterThan(0);

    const patched = stateFrom(electrician!.action, fixerCmState);
    const withProc = computeScenarios(resolveLoadout(patched.player, patched.enemy, 'live')!);
    expect(withProc.freeAim.procDps).toBeGreaterThan(0);
    expect(withProc.freeAim.sustain.sustainedDps).toBeCloseTo(
      baselineScenarios.freeAim.sustain.sustainedDps,
      8,
    );
  });
});

describe('collapseSuggestionFamilies', () => {
  const headline: ScenarioHeadline = { perHit: 0, burstDps: 0, totalDps: 0, uptime: 1 };
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

  const sizeOneRows: { name: string; member: EvaluatedSuggestion }[] = [
    { name: 'passes size-1 families through untouched', member: fixture('f3:0', 'f3', 0, -0.05) },
    {
      name: 'passes a positive size-1 family through untouched',
      member: fixture('solo:0', 'solo', 0, 0.08),
    },
  ];

  for (const row of sizeOneRows) {
    it(row.name, () => {
      const members = [row.member];
      expect(collapseSuggestionFamilies(members)).toEqual(members);
    });
  }

  const singleBestRows: { name: string; members: EvaluatedSuggestion[]; best: string }[] = [
    {
      name: 'collapses an all-non-positive family to a single best member',
      members: [
        fixture('f4:0', 'f4', 0, -0.1),
        fixture('f4:1', 'f4', 1, 0),
        fixture('f4:2', 'f4', 2, -0.2),
      ],
      best: 'f4:1',
    },
    {
      name: 'collapses a family with no positive member to a single best row',
      members: [
        fixture('neg:0', 'neg', 0, -0.2),
        fixture('neg:1', 'neg', 1, -0.05),
        fixture('neg:2', 'neg', 2, -0.1),
      ],
      best: 'neg:1',
    },
  ];

  for (const row of singleBestRows) {
    it(row.name, () => {
      expect(collapseSuggestionFamilies(row.members).map((r) => r.id)).toEqual([row.best]);
    });
  }

  it('leaves distinct families independent of each other', () => {
    const members = [fixture('a:0', 'a', 0, 0.05), fixture('b:0', 'b', 0, 0.1)];
    const result = collapseSuggestionFamilies(members);
    expect(result.map((r) => r.id).sort()).toEqual(['a:0', 'b:0']);
  });

  it('keeps the cheapest positive step and the best when they differ in a 4-member family', () => {
    const members = [
      fixture('fam:0', 'fam', 0, -0.05),
      fixture('fam:1', 'fam', 1, 0.05),
      fixture('fam:2', 'fam', 2, 0.12),
      fixture('fam:3', 'fam', 3, 0.2),
    ];
    const result = collapseSuggestionFamilies(members);
    expect(result.map((r) => r.id)).toEqual(['fam:1', 'fam:3']);
  });
});

describe('manual-uptime sneak gate (Follow Through / Taking One for the Team)', () => {
  // Follow Through only procs off the player's own sneak attacks; TOftT only
  // procs while enemies target the player, which sneaking precludes. The
  // Target-section knobs stay manual and unconditional (any player's card can
  // place the debuff) — only YOUR-card suggestions are gated. See
  // src/data/manual-uptime.ts manualUptimePerkSuggestible.
  const sneaking = (state: BuildState, value: boolean): BuildState =>
    stateFrom([{ type: 'condition/set', key: 'isSneaking', value }], state);

  let notSneakingCandidates: ReturnType<typeof enumerateVariants>;
  let sneakingCandidates: ReturnType<typeof enumerateVariants>;
  beforeAll(() => {
    notSneakingCandidates = enumerateVariants(sneaking(fixerCmState, false), 'live', 'vats');
    sneakingCandidates = enumerateVariants(sneaking(fixerCmState, true), 'live', 'vats');
  });

  it('never suggests Follow Through while not sneaking', () => {
    expect(notSneakingCandidates.some((c) => c.id.includes(PerkId.FollowThrough))).toBe(false);
  });

  it('suggests Follow Through while sneaking', () => {
    expect(sneakingCandidates.some((c) => c.id.includes(PerkId.FollowThrough))).toBe(true);
  });

  it('never suggests adding Taking One for the Team while sneaking', () => {
    expect(
      sneakingCandidates.some(
        (c) =>
          c.id.includes(PerkId.TakingOneForTheTeam) &&
          !c.id.startsWith('leg-perk-swap:TakingOneForTheTeam->'),
      ),
    ).toBe(false);
  });

  it('suggests Taking One for the Team while not sneaking', () => {
    expect(notSneakingCandidates.some((c) => c.id.includes(PerkId.TakingOneForTheTeam))).toBe(true);
  });

  it('still offers swaps that REPLACE an equipped TOftT while sneaking', () => {
    const sixLegendaries = stateFrom(
      [
        { type: 'perk/add', perkId: PerkId.TakingOneForTheTeam, rank: 4, legendary: true },
        { type: 'perk/add', perkId: PerkId.LegendaryStrength, rank: 4, legendary: true },
        { type: 'perk/add', perkId: PerkId.LegendaryPerception, rank: 4, legendary: true },
        { type: 'perk/add', perkId: PerkId.LegendaryEndurance, rank: 4, legendary: true },
        { type: 'perk/add', perkId: PerkId.LegendaryAgility, rank: 4, legendary: true },
        { type: 'perk/add', perkId: PerkId.LegendaryIntelligence, rank: 4, legendary: true },
      ],
      sneaking(fixerCmState, true),
    );
    const candidates = enumerateVariants(sixLegendaries, 'live', 'vats');
    expect(candidates.some((c) => c.id.startsWith('leg-perk-swap:TakingOneForTheTeam->'))).toBe(
      true,
    );
  });
});

describe('legendary swap budget soundness', () => {
  // Removing a Legendary SPECIAL card shrinks budgetPerStat but never unslots
  // the regular cards that no longer fit (perk/remove just filters; the engine
  // folds over-budget cards' modifiers anyway) — so swap-outs must be emitted
  // only when the post-swap loadout stays budget-legal, with a pool-funded
  // allocation fix folded in when that makes it legal.
  // A STR perk slotted at a rank whose cost fits base 1 + Legendary Strength 4
  // (+5 budget) but NOT base 1 alone — removing the legendary orphans it.
  const registry = getPerks('live');
  const strEntry = Object.entries(registry).find(([, p]) => {
    if (p.special !== 'Strength') return false;
    for (let r = 1; r <= p.maxRank; r++) {
      const cost = perkCardCostAtRank(p, r);
      if (cost >= 2 && cost <= 6) return true;
    }
    return false;
  });
  const [strPerkId, strPerk] = strEntry!;
  const strRank = (() => {
    for (let r = 1; r <= strPerk.maxRank; r++) {
      const cost = perkCardCostAtRank(strPerk, r);
      if (cost >= 2 && cost <= 6) return r;
    }
    throw new Error('unreachable');
  })();

  const sixLegendaries = [
    { perkId: PerkId.LegendaryStrength, rank: 4 },
    { perkId: PerkId.LegendaryPerception, rank: 4 },
    { perkId: PerkId.LegendaryEndurance, rank: 4 },
    { perkId: PerkId.LegendaryAgility, rank: 4 },
    { perkId: PerkId.LegendaryIntelligence, rank: 4 },
    { perkId: PerkId.TakingOneForTheTeam, rank: 4 },
  ];

  function swapState(allocations: Record<string, number>): BuildState {
    const base = createDefaultBuildState();
    return {
      ...base,
      player: {
        ...base.player,
        weapon: { weaponId: 'CombatRifle_Fixer', mods: {}, legendaryEffects: [] },
        perks: [{ perkId: strPerkId, rank: strRank }],
        legendaryPerks: sixLegendaries,
        conditions: { ...base.player.conditions, ...allocations },
      },
    };
  }

  // strength 1 everywhere; the rest differ only in whether the 56-point pool
  // has free room for an allocation fix.
  const exhausted = swapState({
    strength: 1,
    perception: 15,
    endurance: 15,
    charisma: 15,
    intelligence: 5,
    agility: 4,
    luck: 1,
  }); // sum 56 — no free points
  const withPool = swapState({
    strength: 1,
    perception: 15,
    endurance: 15,
    charisma: 5,
    intelligence: 5,
    agility: 4,
    luck: 1,
  }); // sum 46 — 10 free points

  let withPoolCandidates: ReturnType<typeof enumerateVariants>;
  beforeAll(() => {
    withPoolCandidates = enumerateVariants(withPool, 'live', 'vats');
  });

  it('skips Legendary Strength swap-outs when the orphaned STR cards cannot be re-funded', () => {
    const candidates = enumerateVariants(exhausted, 'live', 'vats');
    expect(
      candidates.some((c) => c.id.startsWith(`leg-perk-swap:${PerkId.LegendaryStrength}->`)),
    ).toBe(false);
  });

  it('emits the swap with a pool-funded allocation fix when the pool covers the deficit', () => {
    const swap = withPoolCandidates.find(
      (c) =>
        c.id.startsWith(`leg-perk-swap:${PerkId.LegendaryStrength}->`) &&
        /\(\+\d+ STR\)$/.test(c.label),
    );
    expect(swap).toBeDefined();
    // Applying the compound must land on a budget-LEGAL loadout.
    const applied = swap!.action.reduce(buildReducer, withPool);
    const allocation = Object.fromEntries(
      (
        [
          'strength',
          'perception',
          'endurance',
          'charisma',
          'intelligence',
          'agility',
          'luck',
        ] as const
      ).map((k) => [k, applied.player.conditions[k]]),
    ) as Record<
      'strength' | 'perception' | 'endurance' | 'charisma' | 'intelligence' | 'agility' | 'luck',
      number
    >;
    const budget = computePerkBudget(
      'live',
      applied.player.perks,
      applied.player.legendaryPerks,
      allocation,
    );
    expect(budget.overBudget).toBe(false);
  });

  it('still emits plain swaps for stats with no orphaned cards', () => {
    expect(
      withPoolCandidates.some(
        (c) =>
          c.id.startsWith(`leg-perk-swap:${PerkId.LegendaryEndurance}->`) &&
          !c.label.includes('(+'),
      ),
    ).toBe(true);
  });
});
