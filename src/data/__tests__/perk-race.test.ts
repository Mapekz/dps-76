import { describe, it, expect } from 'bun:test';
import { equippedRaceLock, perkRaceRestriction, wrongRacePerks } from '@/data/perk-race';
import { getGeneratedPerk } from '@/data/perk-modifiers';
import { legendaryPerkIds } from '@/lib/nukes-dragons';

// Real generated data: race restrictions come from the PCRD "Race
// Restriction" card field (Perk.raceRestriction), not from playerIsGhoul
// modifier conditions — most race-locked cards carry no such condition on
// their modifiers at all (they're reload/heal/etc. perks with a race-locked
// card and nothing else), so a card-only perk still resolves correctly here.
describe('perkRaceRestriction', () => {
  it('detects ghoul-only cards with damage modifiers (Glowing Criticals)', () => {
    expect(perkRaceRestriction('pts', 'GlowingCriticals')).toBe('ghoul');
  });

  it('detects card-only ghoul-locked perks with no modifiers (Wild West Hands)', () => {
    expect(perkRaceRestriction('pts', 'WildWestHands')).toBe('ghoul');
  });

  it('detects ghoul-only Bomb Scientist (STAT_DmgGrenade carrier)', () => {
    expect(perkRaceRestriction('pts', 'BombScientist')).toBe('ghoul');
  });

  it('detects card-only human-locked perks with no modifiers (Quick Hands)', () => {
    expect(perkRaceRestriction('pts', 'QuickHands')).toBe('human');
  });

  it('detects race restrictions on legendary perk cards (Action Diet, What Rads?)', () => {
    expect(perkRaceRestriction('pts', 'ActionDiet')).toBe('ghoul');
    expect(perkRaceRestriction('pts', 'WhatRads')).toBe('human');
  });

  it('leaves unrestricted cards unlocked', () => {
    expect(perkRaceRestriction('pts', 'Commando')).toBeNull();
  });

  it('returns null for unknown perk ids', () => {
    expect(perkRaceRestriction('pts', 'NotARealPerk')).toBeNull();
  });

  // Drift guard: every legendary perk's race restriction must trace back to
  // its own PCRD card, not an assumption baked into the registry — so a
  // re-extract that adds/changes a legendary card's Race Restriction (as
  // WhatRads/ActionDiet/FeralRage already carry) is caught automatically
  // instead of silently defaulting to unrestricted.
  it('matches ESM ground truth for every legendary perk', () => {
    for (const perkId of legendaryPerkIds) {
      const expected = getGeneratedPerk('pts', perkId)?.card?.raceRestriction ?? null;
      expect(perkRaceRestriction('pts', perkId), perkId).toBe(expected);
    }
  });
});

describe('equippedRaceLock', () => {
  it('locks to ghoul when a ghoul-only perk is equipped', () => {
    const lock = equippedRaceLock('pts', [], [{ perkId: 'GlowingCriticals', rank: 1 }]);
    expect(lock.locked).toBe('ghoul');
    expect(lock.conflict).toBe(false);
    expect(lock.lockedBy.length).toBe(1);
  });

  it('reports no lock for an unrestricted loadout', () => {
    const lock = equippedRaceLock('pts', [{ perkId: 'Commando', rank: 3 }], []);
    expect(lock.locked).toBeNull();
    expect(lock.lockedBy).toEqual([]);
  });

  it('flags a conflict when both human-only and ghoul-only perks are equipped', () => {
    const lock = equippedRaceLock(
      'pts',
      [{ perkId: 'QuickHands', rank: 1 }],
      [{ perkId: 'ActionDiet', rank: 1 }],
    );
    expect(lock.locked).toBeNull();
    expect(lock.conflict).toBe(true);
    expect(lock.lockedBy.length).toBe(2);
  });
});

describe('wrongRacePerks', () => {
  it('lists human-only perks a switch to ghoul would remove', () => {
    const removed = wrongRacePerks('pts', [{ perkId: 'QuickHands', rank: 1 }], [], true);
    expect(removed).toEqual(['Quick Hands']);
  });

  it('lists ghoul-only perks a switch to human would remove', () => {
    const removed = wrongRacePerks('pts', [], [{ perkId: 'ActionDiet', rank: 1 }], false);
    expect(removed).toEqual(['Action Diet']);
  });

  it('leaves unrestricted perks alone', () => {
    const removed = wrongRacePerks('pts', [{ perkId: 'Commando', rank: 3 }], [], true);
    expect(removed).toEqual([]);
  });
});
