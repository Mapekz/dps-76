import { describe, it, expect } from 'vitest';
import { bptdToParts } from '../extract-bodyparts';
import stormGoliath from './fixtures/bptd-storm-goliath.json';
import human from './fixtures/bptd-human.json';

// Fixtures are verbatim `esm -p get <formid> --json` output (20260702 ESM):
// BPTD 0x006D79FF (StormBossRace) and 0x00017AD4 (HumanRace). Pins the
// BPTD → GeneratedBodyPart normalization semantics.

describe('bptdToParts', () => {
  it('Human: 6 targetable parts, head at the standard 1.5×', () => {
    const parts = bptdToParts((human as { fields: unknown }).fields);
    expect(parts.map(p => p.name).sort()).toEqual(
      ['Head', 'Left Arm', 'Left Leg', 'Right Arm', 'Right Leg', 'Torso'].sort()
    );
    expect(parts.find(p => p.name === 'Head')).toMatchObject({ dmgMult: 1.5, crippable: true });
    // Technical nodes (Headtracking/Camera/Weapon/foot helpers) are dropped.
    expect(parts.some(p => p.name === 'Headtracking' || p.name === 'Camera')).toBe(false);
  });

  it('Storm Goliath: 8 picker-worthy parts (Root + ×1 non-crippable Back Panel skipped), 7 crippable', () => {
    const parts = bptdToParts((stormGoliath as { fields: unknown }).fields);
    expect(parts).toHaveLength(8);
    expect(parts.filter(p => p.crippable)).toHaveLength(7);
    expect(parts.find(p => p.name === 'Glass')).toMatchObject({ dmgMult: 1.15, crippable: false });
    expect(parts.find(p => p.name === 'Torso')).toMatchObject({ dmgMult: 0.85 });
    expect(parts.some(p => p.partType === 'Root')).toBe(false);
  });

  it('rounds float noise off damage multipliers', () => {
    const parts = bptdToParts((stormGoliath as { fields: unknown }).fields);
    for (const p of parts) {
      expect(p.dmgMult).toBeCloseTo(Math.round(p.dmgMult * 1000) / 1000, 10);
    }
  });
});
