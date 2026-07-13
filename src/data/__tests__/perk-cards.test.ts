import { describe, it, expect } from 'vitest';
import { PerkId } from '@/data/perk-ids';
import { Special } from '@/data/special';
import { getPerks } from '@/data';
import { getDataset } from '@/data/dataset';
import { getGeneratedPerk, getLoadoutModifiers } from '@/data/perk-modifiers';
import { computePerkBudget } from '@/data/perk-budget';
import { perkCardOverrides } from '@/data/overrides/perk-overrides';
import { legendaryPerkIds } from '@/lib/nukes-dragons';
import { SPECIAL_KEYS, type SpecialKey } from '@/lib/player-stats';

/**
 * Drift detection for the ESM-derived perk registry (src/data/perk-cards.ts),
 * in the spirit of the vetted-weapons-roster test: pins real PCRD card data
 * and fails loudly (with the offending list) when a future `pnpm extract`
 * changes the join surface.
 */

function baseSpecial(overrides: Partial<Record<SpecialKey, number>> = {}): Record<SpecialKey, number> {
  return { ...(Object.fromEntries(SPECIAL_KEYS.map(k => [k, 1])) as Record<SpecialKey, number>), ...overrides };
}

describe('perk card registry — join coverage', () => {
  it('every non-legendary carded generated family is claimed by a registry PerkId, except the known gender-twin "Girl" cards', () => {
    const registry = getPerks('live');
    const claimedFamilies = new Set<string>();
    for (const perkId of Object.keys(registry)) {
      const generated = getGeneratedPerk('live', perkId);
      if (generated) claimedFamilies.add(generated.family);
    }

    const orphans = getDataset('live')
      .perks.filter(f => f.card && !f.card.isLegendaryCard && !claimedFamilies.has(f.family))
      .map(f => f.family)
      .sort();

    // ActionGirl/Aquagirl/PartyGirl: gender-twin ESM families with identical
    // effects to their "Boy" counterpart — the registry intentionally joins
    // ONE combined PerkId (ActionBoyGirl/AquaBoyGirl/PartyBoyGirl) to the Boy
    // family (perkFamilyOverrides), so the Girl family is expected to stay
    // unclaimed rather than getting its own PerkId.
    // Antibiotic/Conductor/LightMeal: real PCRDs in the ESM, but NOT cards in
    // the live game (user-confirmed 2026-07-13 — unreleased content, the
    // record graph can't distinguish shipped from unshipped) — deliberately
    // given no PerkId.
    expect(orphans).toEqual(['ActionGirl', 'Antibiotic', 'Aquagirl', 'Conductor', 'LightMeal', 'PartyGirl']);
  });

  it('every perkCardOverrides entry is for a PerkId that cannot otherwise derive a card (no stale overrides)', () => {
    const staleOverrides = Object.keys(perkCardOverrides).filter(perkId => !!getGeneratedPerk('live', perkId)?.card);
    expect(staleOverrides).toEqual([]);
  });
});

describe('perk card registry — internal consistency', () => {
  it('maxRank equals costs.length for every registry perk', () => {
    const registry = getPerks('live');
    const mismatches = Object.entries(registry)
      .filter(([, perk]) => perk.maxRank !== perk.costs.length)
      .map(([id, perk]) => `${id} (maxRank=${perk.maxRank}, costs.length=${perk.costs.length})`);
    expect(mismatches).toEqual([]);
  });

  it('legendary perks carry no `special` (never SPECIAL-slotted)', () => {
    const registry = getPerks('live');
    for (const perkId of legendaryPerkIds) {
      const perk = registry[perkId as PerkId];
      expect(perk, `legendary PerkId "${perkId}" is missing from the registry`).toBeDefined();
      expect(perk?.special, `legendary PerkId "${perkId}" unexpectedly carries a special`).toBeUndefined();
    }
  });

  it('a legendary card never contributes to the SPECIAL perk-point budget', () => {
    const budget = computePerkBudget(
      'live',
      [], // legendary cards belong in the legendaryPerks list, not perks
      [{ perkId: PerkId.LegendaryStrength, rank: 4 }],
      baseSpecial()
    );
    // legendaryBonus (the +1/+2/+3/+5 stat/point grant) is separate from
    // cardPoints (SPECIAL-budget consumption) — only the latter must stay 0.
    expect(Object.values(budget.cardPoints).every(v => v === 0)).toBe(true);
  });
});

describe('perk card registry — pinned real values (20260710 ESM)', () => {
  const registry = getPerks('live');

  it('Tenderizer: single rank costing 2 Charisma points', () => {
    expect(registry[PerkId.Tenderizer]).toMatchObject({ special: Special.Charisma, maxRank: 1, costs: [2] });
  });

  it('Strong Back: single rank costing 2 Strength points', () => {
    expect(registry[PerkId.StrongBack]).toMatchObject({ special: Special.Strength, maxRank: 1, costs: [2] });
  });

  it('Rifleman Expert ("Scoped-up"): single rank costing 2 Perception points', () => {
    expect(registry[PerkId.RiflemanExpert]).toMatchObject({ special: Special.Perception, maxRank: 1, costs: [2] });
  });

  it('Rifleman Master ("Smart Shot"): single rank costing 3 Perception points', () => {
    expect(registry[PerkId.RiflemanMaster]).toMatchObject({ special: Special.Perception, maxRank: 1, costs: [3] });
  });

  it('Party Boy/Girl: 2 ranks costing 2/3 Charisma points', () => {
    expect(registry[PerkId.PartyBoyGirl]).toMatchObject({ special: Special.Charisma, maxRank: 2, costs: [2, 3] });
  });

  it('Center Masochist (ESM family "Commando"): 3 ranks costing 1/2/3 Perception points', () => {
    expect(registry[PerkId.CenterMasochist]).toMatchObject({ special: Special.Perception, maxRank: 3, costs: [1, 2, 3] });
  });

  it('Bringing the Big Guns (renamed from "Bringing Out the Big Guns", joins HeavyGunnerMaster): single rank costing 3 Strength points', () => {
    expect(registry[PerkId.BringingOutTheBigGuns]).toMatchObject({ special: Special.Strength, maxRank: 1, costs: [3] });
  });

  it('the net-new PerkIds join real ESM cards', () => {
    expect(registry[PerkId.PortablePower]).toMatchObject({ special: Special.Strength, maxRank: 3, costs: [1, 2, 3] });
    expect(registry[PerkId.SturdyFrame]).toMatchObject({ special: Special.Strength, maxRank: 2, costs: [1, 2] });
  });

  it('compressed cards clamp maxRank to the PCRD entry count — the surplus PERK ranks are dead content', () => {
    // LifegiverCard 0x0000BB40: single live rank costing 2 END (LifeGiver02/03 are dead).
    expect(registry[PerkId.LifeGiver]).toMatchObject({ special: Special.Endurance, maxRank: 1, costs: [2] });
    // BodyguardsCard 0x00310BF8: single live rank costing 1 CHA (ranks 2-4 dead).
    expect(registry[PerkId.Bodyguards]).toMatchObject({ special: Special.Charisma, maxRank: 1, costs: [1] });
    // DemolitionExpertCard 0x003440B9: 3 live ranks costing 1/2/3 INT (ranks 4-5 dead).
    expect(registry[PerkId.DemolitionExpert]).toMatchObject({
      special: Special.Intelligence,
      maxRank: 3,
      costs: [1, 2, 3],
    });
  });

  it("Starched Genes resolves its single live rank through rankSources to the family's rank-2 record", () => {
    const generated = getGeneratedPerk('live', PerkId.StarchedGenes);
    expect(generated?.card?.rankSources).toEqual([2]);
    expect(registry[PerkId.StarchedGenes]?.maxRank).toBe(1);
    // The modifiers served for card rank 1 must be the family's rank-2 set.
    const served = getLoadoutModifiers('live', [{ perkId: PerkId.StarchedGenes, rank: 1 }]);
    expect(served).toEqual(generated!.ranks[1].modifiers);
  });

  it('every joined card has rankSources aligned with costs and within the family rank range', () => {
    const broken = getDataset('live')
      .perks.filter(
        f =>
          f.card &&
          (f.card.rankSources.length !== f.card.costs.length ||
            f.card.rankSources.some(r => r < 1 || r > f.maxRank))
      )
      .map(f => f.family);
    expect(broken).toEqual([]);
  });
});
