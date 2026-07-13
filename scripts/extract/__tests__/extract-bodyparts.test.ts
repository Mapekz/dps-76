import { describe, it, expect } from 'vitest';
import { bptdToParts, extractBodyParts } from '../extract-bodyparts';
import type { EsmClient } from '../esm-client';
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

describe('extractBodyParts NPC_ → RACE resolution', () => {
  // Fake EsmClient: only .get() is exercised. Records mimic the wire shape
  // (header.signature/form_id + fields); the BPTD reuses the human fixture.
  const records: Record<string, { header: { signature: string; form_id: string }; fields: Record<string, unknown> }> = {
    HumanRace: {
      header: { signature: 'RACE', form_id: '0x00013746' },
      fields: { 'Body Part Data': '0x00017AD4' },
    },
    Burn_BountyTarget_BIG_Death: {
      header: { signature: 'NPC_', form_id: '0x007CFAA9' },
      fields: { Race: '0x00013746' },
    },
    '0x00013746': {
      header: { signature: 'RACE', form_id: '0x00013746' },
      fields: { 'Body Part Data': '0x00017AD4' },
    },
    '0x00017AD4': {
      header: { signature: 'BPTD', form_id: '0x00017AD4' },
      fields: (human as { fields: unknown }).fields as Record<string, unknown>,
    },
  };
  const fakeClient = {
    get: async (target: string) => {
      const record = records[target];
      if (!record) throw new Error(`not found: ${target}`);
      return record;
    },
  } as unknown as EsmClient;

  it('resolves NPC_ rows through fields.Race and RACE rows directly', async () => {
    const { races } = await extractBodyParts(fakeClient);
    const boss = races.find(r => r.id === 'Burn_BountyTarget_BIG_Death');
    const race = races.find(r => r.id === 'HumanRace');
    expect(boss).toBeDefined();
    expect(race).toBeDefined();
    // The boss resolved to the RACE's formId and BPTD, not the NPC's.
    expect(boss!.formId).toBe('0x00013746');
    expect(boss!.bodyPartDataFormId).toBe('0x00017AD4');
    expect(boss!.category).toBe('headhunt');
    expect(boss!.parts).toEqual(race!.parts);
    // Standard rows keep taking the direct RACE path.
    expect(race!.category).toBe('standard');
    expect(race!.formId).toBe('0x00013746');
  });

  it('files unfetchable rows under unresolved instead of crashing', async () => {
    const { unresolved } = await extractBodyParts(fakeClient);
    // Every curated row missing from the fake store is reported, none throw.
    expect(unresolved.length).toBeGreaterThan(0);
    expect(unresolved.every(u => u.startsWith('bodyparts:'))).toBe(true);
  });
});
