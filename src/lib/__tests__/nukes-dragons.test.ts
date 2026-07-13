import { describe, it, expect } from 'vitest';
import {
  isLegendaryPerkKey,
  legendaryPerkIds,
  nukesDragonsPerks,
  parseBuildUrl,
  reclassifyPerkLoadouts,
} from '@/lib/nukes-dragons';
import { PerkId } from '@/data/perk-ids';

// Pins the ghoul-card vs legendary-perk classification. Ground truth is N&D's
// own database (data.nukesdragons.com character bundle): ghoul cards own the
// "0" key space EXCEPT the case-sensitive stragglers 0D/0N, which are the two
// ghoul-exclusive legendary perks; all other legendary perks use "x" keys.

describe('isLegendaryPerkKey', () => {
  it('accepts legendary keys, including the two "0"-prefixed ghoul legendaries', () => {
    for (const key of ['x0', 'x4', 'xa', 'xm', 'xp', 'xq', '0D', '0N']) {
      expect(isLegendaryPerkKey(key), key).toBe(true);
    }
  });

  it('rejects ghoul-card keys, including the case twins of 0D/0N', () => {
    for (const key of ['01', '05', '0z', '0d', '0n', 'ad', 'l3']) {
      expect(isLegendaryPerkKey(key), key).toBe(false);
    }
  });
});

describe('legendaryPerkIds', () => {
  it('contains the real legendary perks and the Legendary SPECIAL cards', () => {
    for (const id of [
      PerkId.TakingOneForTheTeam,
      PerkId.FollowThrough,
      PerkId.BrawlingChemist,
      PerkId.WhatRads,
      PerkId.ActionDiet,
      PerkId.FeralRage,
      PerkId.LegendaryStrength,
    ]) {
      expect(legendaryPerkIds.has(id), id).toBe(true);
    }
  });

  it('excludes ghoul cards', () => {
    for (const id of [PerkId.RadSpecialist, PerkId.GlowingCriticals, PerkId.ArmsOfSteel, PerkId.ActionGhoul]) {
      expect(legendaryPerkIds.has(id), id).toBe(false);
    }
  });

  it('every legendary-keyed N&D mapping is in the set (and vice versa for 0-keys)', () => {
    for (const [key, perkId] of Object.entries(nukesDragonsPerks)) {
      expect(legendaryPerkIds.has(perkId), `${key} → ${perkId}`).toBe(isLegendaryPerkKey(key));
    }
  });
});

describe('parseBuildUrl', () => {
  it('reads legendary perks from the lp= param alongside p=', () => {
    // Real v2 N&D URL shape: regular + ghoul cards in p=, legendary in lp=.
    const perks = parseBuildUrl('https://nukesdragons.com/fallout-76/character?v=2&s=fffffff&p=lt30n1&lp=xp4xm2');
    expect(perks).toEqual([
      { key: 'lt', name: PerkId.BloodyMess, rank: 3 },
      { key: '0n', name: PerkId.GlowingCriticals, rank: 1 },
      { key: 'xp', name: PerkId.TakingOneForTheTeam, rank: 4 },
      { key: 'xm', name: PerkId.FollowThrough, rank: 2 },
    ]);
  });
});

describe('reclassifyPerkLoadouts', () => {
  it('moves ghoul cards out of legendaryPerks and legendary perks out of perks', () => {
    const result = reclassifyPerkLoadouts(
      [
        { perkId: PerkId.BloodyMess, rank: 3 },
        { perkId: PerkId.TakingOneForTheTeam, rank: 2 },
      ],
      [
        { perkId: PerkId.RadSpecialist, rank: 1 },
        { perkId: PerkId.LegendaryLuck, rank: 4 },
      ]
    );
    expect(result.migrated).toBe(2);
    expect(result.perks).toEqual([
      { perkId: PerkId.BloodyMess, rank: 3 },
      { perkId: PerkId.RadSpecialist, rank: 1 },
    ]);
    expect(result.legendaryPerks).toEqual([
      { perkId: PerkId.TakingOneForTheTeam, rank: 2 },
      { perkId: PerkId.LegendaryLuck, rank: 4 },
    ]);
  });

  it('reports zero migrations for a correctly-split loadout', () => {
    const result = reclassifyPerkLoadouts(
      [{ perkId: PerkId.BloodyMess, rank: 3 }],
      [{ perkId: PerkId.FollowThrough, rank: 4 }]
    );
    expect(result.migrated).toBe(0);
  });
});
