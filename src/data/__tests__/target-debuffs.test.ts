import { describe, it, expect } from 'vitest';
import { getTargetDebuffModifiers, TENDERIZER_MAX_STACKS } from '@/data/target-debuffs';

describe('getTargetDebuffModifiers — Taking One for the Team flat DR debuff', () => {
  it('rank 0 (default/off) emits only Tenderizer', () => {
    expect(getTargetDebuffModifiers({})).toHaveLength(1);
    expect(getTargetDebuffModifiers({ takingOneForTheTeamDrRank: 0 })).toHaveLength(1);
  });

  // Magnitude table, esm-walk-confirmed (docs/assumptions.md "Resist mitigation" §3.3):
  // ranks 1-4 → 6/10/15/50 flat DamageResist points. Rank 4's jump to 50 (not
  // ~20, the arithmetic extrapolation) is a flagged possible ESM anomaly —
  // modeled as-is, not "corrected".
  it.each([
    [1, 6],
    [2, 10],
    [3, 15],
    [4, 50],
  ])('rank %i → magnitude %i on the armorPenFlat bucket, unconditioned', (rank, magnitude) => {
    const mods = getTargetDebuffModifiers({ takingOneForTheTeamDrRank: rank as 1 | 2 | 3 | 4 });
    const toftt = mods.find(m => m.id === 'target-debuff:TakingOneForTheTeamDr');
    expect(toftt).toMatchObject({ bucket: 'armorPenFlat', op: 'ADD', value: magnitude, conditions: [] });
  });

  it('is distinct from the Tenderizer stack debuff (both present when both active)', () => {
    const mods = getTargetDebuffModifiers({ takingOneForTheTeamDrRank: 2 });
    expect(mods).toHaveLength(2);
    expect(mods.some(m => m.id === 'target-debuff:Tenderizer')).toBe(true);
    expect(mods.some(m => m.id === 'target-debuff:TakingOneForTheTeamDr')).toBe(true);
  });

  it('Tenderizer stays unconditioned-except-for-stacks (regression guard)', () => {
    const mods = getTargetDebuffModifiers({});
    const tenderizer = mods.find(m => m.id === 'target-debuff:Tenderizer');
    expect(tenderizer?.conditions[0]).toMatchObject({ kind: 'stacks', counter: 'tenderizer', max: TENDERIZER_MAX_STACKS });
  });
});
