import { describe, it, expect } from 'vitest';
import { equippedRaceLock, perkRaceRestriction } from '@/data/perk-race';

// Real generated data: GHL_* perk families are ghoul-only (every modifier
// carries playerIsGhoul: true); ordinary combat cards carry no race gate.
describe('perkRaceRestriction', () => {
  it('detects ghoul-only cards (Glowing Criticals)', () => {
    expect(perkRaceRestriction('live', 'GlowingCriticals')).toBe('ghoul');
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
});
