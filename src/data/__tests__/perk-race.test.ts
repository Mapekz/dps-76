import { describe, it, expect } from 'vitest';
import { equippedRaceLock, perkRaceRestriction, wrongRacePerks } from '@/data/perk-race';

// Real generated data: race restrictions come from the PCRD "Race
// Restriction" card field (Perk.raceRestriction), not from playerIsGhoul
// modifier conditions — most race-locked cards carry no such condition on
// their modifiers at all (they're reload/heal/etc. perks with a race-locked
// card and nothing else), so a card-only perk still resolves correctly here.
describe('perkRaceRestriction', () => {
  it('detects ghoul-only cards with damage modifiers (Glowing Criticals)', () => {
    expect(perkRaceRestriction('live', 'GlowingCriticals')).toBe('ghoul');
  });

  it('detects card-only ghoul-locked perks with no modifiers (Wild West Hands)', () => {
    expect(perkRaceRestriction('live', 'WildWestHands')).toBe('ghoul');
  });

  it('detects card-only human-locked perks with no modifiers (Quick Hands)', () => {
    expect(perkRaceRestriction('live', 'QuickHands')).toBe('human');
  });

  it('detects race restrictions on legendary perk cards (Action Diet, What Rads?)', () => {
    expect(perkRaceRestriction('live', 'ActionDiet')).toBe('ghoul');
    expect(perkRaceRestriction('live', 'WhatRads')).toBe('human');
  });

  it('leaves unrestricted cards unlocked', () => {
    expect(perkRaceRestriction('live', 'Commando')).toBeNull();
  });

  it('returns null for unknown perk ids', () => {
    expect(perkRaceRestriction('live', 'NotARealPerk')).toBeNull();
  });
});

describe('equippedRaceLock', () => {
  it('locks to ghoul when a ghoul-only perk is equipped', () => {
    const lock = equippedRaceLock('live', [], [{ perkId: 'GlowingCriticals', rank: 1 }]);
    expect(lock.locked).toBe('ghoul');
    expect(lock.conflict).toBe(false);
    expect(lock.lockedBy.length).toBe(1);
  });

  it('reports no lock for an unrestricted loadout', () => {
    const lock = equippedRaceLock('live', [{ perkId: 'Commando', rank: 3 }], []);
    expect(lock.locked).toBeNull();
    expect(lock.lockedBy).toEqual([]);
  });

  it('flags a conflict when both human-only and ghoul-only perks are equipped', () => {
    const lock = equippedRaceLock('live', [{ perkId: 'QuickHands', rank: 1 }], [{ perkId: 'ActionDiet', rank: 1 }]);
    expect(lock.locked).toBeNull();
    expect(lock.conflict).toBe(true);
    expect(lock.lockedBy.length).toBe(2);
  });
});

describe('wrongRacePerks', () => {
  it('lists human-only perks a switch to ghoul would remove', () => {
    const removed = wrongRacePerks('live', [{ perkId: 'QuickHands', rank: 1 }], [], true);
    expect(removed).toEqual(['Quick Hands']);
  });

  it('lists ghoul-only perks a switch to human would remove', () => {
    const removed = wrongRacePerks('live', [], [{ perkId: 'ActionDiet', rank: 1 }], false);
    expect(removed).toEqual(['Action Diet']);
  });

  it('leaves unrestricted perks alone', () => {
    const removed = wrongRacePerks('live', [{ perkId: 'Commando', rank: 3 }], [], true);
    expect(removed).toEqual([]);
  });
});
