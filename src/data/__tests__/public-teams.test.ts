import { describe, it, expect } from 'bun:test';
import { getPublicTeamModifiers } from '@/data/public-teams';

describe('getPublicTeamModifiers', () => {
  it('returns no modifiers when not in a public team', () => {
    expect(getPublicTeamModifiers('none', 2)).toEqual([]);
  });

  it('grants +Intelligence for a solo casual team (bond score 1)', () => {
    const mods = getPublicTeamModifiers('casual', 0);
    expect(mods).toHaveLength(1);
    expect(mods[0].bucket).toBe('specialIntelligence');
    expect('value' in mods[0] ? mods[0].value : null).toBe(1);
  });

  it('caps casual team Intelligence at bond score 4', () => {
    const mods = getPublicTeamModifiers('casual', 3);
    expect('value' in mods[0] ? mods[0].value : null).toBe(4);
  });

  it('stays capped at 4 even with more teammates than the cap implies', () => {
    const mods = getPublicTeamModifiers('casual', 5);
    expect('value' in mods[0] ? mods[0].value : null).toBe(4);
  });

  it('grants +Endurance for an exploration team scaled by team size', () => {
    const mods = getPublicTeamModifiers('exploration', 1);
    expect(mods).toHaveLength(1);
    expect(mods[0].bucket).toBe('specialEndurance');
    expect('value' in mods[0] ? mods[0].value : null).toBe(2);
  });
});
