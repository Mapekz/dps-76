import { describe, it, expect } from 'bun:test';
import { bptdToParts, extractBodyParts } from '../extract-bodyparts';
import type { EsmClient } from '../esm-client';
import stormGoliath from './fixtures/bptd-storm-goliath.json';
import human from './fixtures/bptd-human.json';
import guardian from './fixtures/bptd-guardian.json';
import terror from './fixtures/bptd-terror.json';
import scorchbeast from './fixtures/bptd-scorchbeast.json';
import titan from './fixtures/bptd-titan.json';

// Fixtures are verbatim `esm get <formid> --json` output (20260702/20260710
// ESM dumps): BPTD 0x006D79FF (StormBossRace), 0x00017AD4 (HumanRace),
// 0x0077B596 (Guardian), 0x00786D45 (Terror), 0x00017DD5 (Scorchbeast),
// 0x00656CD4 (Ultracite Titan). Pins the BPTD → GeneratedBodyPart
// normalization semantics: a part survives if the game tracks a limb
// condition for it (Data."Actor Value" non-null) or it carries a real damage
// multiplier; `crippable` requires an Actor Value AND a non-Torso part type.

describe('bptdToParts', () => {
  it('Human: 6 targetable parts, head at the standard 1.5×, only the torso non-crippable', () => {
    const { parts, crippableLimbCount } = bptdToParts((human as { fields: unknown }).fields);
    expect(parts.map((p) => p.name).sort()).toEqual(
      ['Head', 'Left Arm', 'Left Leg', 'Right Arm', 'Right Leg', 'Torso'].sort(),
    );
    expect(parts.find((p) => p.name === 'Head')).toMatchObject({ dmgMult: 1.5, crippable: true });
    expect(parts.find((p) => p.name === 'Torso')).toMatchObject({ dmgMult: 1, crippable: false });
    // Technical nodes (Headtracking/Camera/Weapon/Root) are dropped; feet fold into their leg's condition.
    expect(
      parts.some((p) =>
        ['Headtracking', 'Camera', 'Weapon', 'Root', 'RaiderLeftFoot', 'RaiderRightFoot'].includes(
          p.name,
        ),
      ),
    ).toBe(false);
    // 5 distinct crippable Actor Values (arms + legs + head; torso excluded).
    expect(crippableLimbCount).toBe(5);
  });

  it('Storm Goliath: 9 parts including the Actor-Value-tracked Back Panel weak point, Glass now crippable', () => {
    const { parts, crippableLimbCount } = bptdToParts((stormGoliath as { fields: unknown }).fields);
    expect(parts).toHaveLength(9);
    expect(parts.find((p) => p.name === 'Back Panel')).toMatchObject({
      partType: 'Brain',
      dmgMult: 1,
      crippable: true,
    });
    // Glass carries a real limb condition (Actor Value) even without an "On Cripple"/"Explodable" flag.
    expect(parts.find((p) => p.name === 'Glass')).toMatchObject({ dmgMult: 1.15, crippable: true });
    expect(parts.find((p) => p.name === 'Torso')).toMatchObject({
      dmgMult: 0.85,
      crippable: false,
    });
    expect(parts.some((p) => p.partType === 'Root')).toBe(false);
    expect(crippableLimbCount).toBe(8);
  });

  it('rounds float noise off damage multipliers', () => {
    const { parts } = bptdToParts((stormGoliath as { fields: unknown }).fields);
    for (const p of parts) {
      expect(p.dmgMult).toBeCloseTo(Math.round(p.dmgMult * 1000) / 1000, 10);
    }
  });

  it('Ultracite Terror: real eye weak points and armor plates survive (Part Type "Eye" is no longer skipped)', () => {
    const { parts, crippableLimbCount } = bptdToParts((terror as { fields: unknown }).fields);
    expect(parts.map((p) => p.name).sort()).toEqual(
      [
        'Head',
        'LeftEye',
        'Plate A',
        'Plate B',
        'Plate C',
        'Plate D',
        'Plate E',
        'Plate F',
        'Plate G',
        'RightEye',
      ].sort(),
    );
    expect(parts.find((p) => p.name === 'RightEye')).toMatchObject({
      partType: 'Eye',
      dmgMult: 3,
      crippable: true,
    });
    expect(parts.find((p) => p.name === 'LeftEye')).toMatchObject({ dmgMult: 3, crippable: true });
    // The technical "Body" (Torso, null Actor Value) node is dropped, unlike the real armor plates.
    expect(parts.some((p) => p.name === 'Body')).toBe(false);
    expect(crippableLimbCount).toBe(10);
  });

  it('Scorchbeast: arms/wings/legs/head/torso restored; the two legs share one Actor Value and merge to one row', () => {
    const { parts, crippableLimbCount } = bptdToParts((scorchbeast as { fields: unknown }).fields);
    expect(parts.map((p) => p.name).sort()).toEqual(
      ['Head', 'Left Arm', 'Left Leg', 'Left Wing', 'Right Arm', 'Right Wing', 'Torso'].sort(),
    );
    // Right Leg and Left Leg both track Actor Value 0x2CE — one merged row survives (lower Part Type value wins).
    expect(
      parts.filter((p) => p.partType === 'LeftLeg1' || p.partType === 'RightLeg1'),
    ).toHaveLength(1);
    expect(parts.find((p) => p.name === 'Head')).toMatchObject({ dmgMult: 1.5, crippable: true });
    expect(parts.find((p) => p.name === 'Torso')).toMatchObject({ dmgMult: 1, crippable: false });
    expect(crippableLimbCount).toBe(6);
  });

  it('Ultracite Titan: both arms restored, and Chest/Belly survive as distinct rows despite sharing an Actor Value', () => {
    const { parts, crippableLimbCount } = bptdToParts((titan as { fields: unknown }).fields);
    expect(parts.map((p) => p.name).sort()).toEqual(
      ['Belly', 'Chest', 'Head', 'Left Arm', 'Right Arm', 'Torso'].sort(),
    );
    // Chest (×1.35), Belly (×1.15) and Torso (×0.85) all track the same Actor Value (EnduranceCondition) but
    // differ in damage mult, so the dedup key (Actor Value + mult) keeps all three distinct.
    expect(parts.find((p) => p.name === 'Chest')).toMatchObject({ dmgMult: 1.35, crippable: true });
    expect(parts.find((p) => p.name === 'Belly')).toMatchObject({ dmgMult: 1.15, crippable: true });
    expect(parts.find((p) => p.name === 'Torso')).toMatchObject({
      dmgMult: 0.85,
      crippable: false,
    });
    expect(parts.find((p) => p.name === 'Left Arm')).toMatchObject({ dmgMult: 1, crippable: true });
    expect(parts.find((p) => p.name === 'Right Arm')).toMatchObject({
      dmgMult: 1,
      crippable: true,
    });
    // Distinct crippable Actor Values: Chest+Belly share one (counts once), plus Left Arm, Right Arm, Head.
    expect(crippableLimbCount).toBe(4);
  });

  it('Guardian with conditionPartsOnly: only the 2 Actor-Value-tracked parts survive (5 perk-gated ×3 phantoms dropped)', () => {
    const { parts, crippableLimbCount } = bptdToParts((guardian as { fields: unknown }).fields, {
      conditionPartsOnly: true,
    });
    expect(parts.map((p) => p.name).sort()).toEqual(['Torso', 'Ultragenetic Shield System'].sort());
    expect(parts.find((p) => p.name === 'Ultragenetic Shield System')).toMatchObject({
      dmgMult: 1,
      crippable: true,
    });
    expect(parts.find((p) => p.name === 'Torso')).toMatchObject({ dmgMult: 3, crippable: false });
    expect(crippableLimbCount).toBe(1);
  });

  it('Guardian without conditionPartsOnly would surface the 5 null-Actor-Value ×3 phantom parts', () => {
    const { parts } = bptdToParts((guardian as { fields: unknown }).fields);
    expect(parts.length).toBeGreaterThan(2);
  });
});

describe('extractBodyParts NPC_ → RACE resolution', () => {
  // Fake EsmClient: .get() plus a real-shaped .resolveEdid (get → editor_id).
  // Records mimic the wire shape (header.signature/form_id + editor_id +
  // fields); BPTDs reuse the fixtures above.
  const records: Record<
    string,
    {
      header: { signature: string; form_id: string };
      editor_id: string;
      fields: Record<string, unknown>;
    }
  > = {
    HumanRace: {
      header: { signature: 'RACE', form_id: '0x00013746' },
      editor_id: 'HumanRace',
      // Mixed KWDA: only the ActorType* entries survive into `keywords`.
      fields: {
        'Body Part Data': '0x00017AD4',
        Keywords: { Keywords: ['0x0002CB72', '0x00013794', '0x00249612'] },
      },
    },
    '0x0002CB72': {
      header: { signature: 'KYWD', form_id: '0x0002CB72' },
      editor_id: 'ActorTypeHuman',
      fields: {},
    },
    '0x00013794': {
      header: { signature: 'KYWD', form_id: '0x00013794' },
      editor_id: 'ActorTypeNPC',
      fields: {},
    },
    '0x00249612': {
      header: { signature: 'KYWD', form_id: '0x00249612' },
      editor_id: 'NoPowerArmorUse',
      fields: {},
    },
    Burn_BountyTarget_BIG_Death: {
      header: { signature: 'NPC_', form_id: '0x007CFAA9' },
      editor_id: 'Burn_BountyTarget_BIG_Death',
      fields: { Race: '0x00013746' },
    },
    '0x00013746': {
      header: { signature: 'RACE', form_id: '0x00013746' },
      editor_id: 'HumanRace',
      fields: {
        'Body Part Data': '0x00017AD4',
        Keywords: { Keywords: ['0x0002CB72', '0x00013794', '0x00249612'] },
      },
    },
    '0x00017AD4': {
      header: { signature: 'BPTD', form_id: '0x00017AD4' },
      editor_id: 'HumanBodyPartData',
      fields: (human as { fields: unknown }).fields as Record<string, unknown>,
    },
    // Guardian: NPC_ → RACE → BPTD, exercises `conditionPartsOnly` end to end.
    RD01_Enc01_GuardianBot: {
      header: { signature: 'NPC_', form_id: '0x00771D8C' },
      editor_id: 'RD01_Enc01_GuardianBot',
      fields: { Race: '0x00774595' },
    },
    '0x00774595': {
      header: { signature: 'RACE', form_id: '0x00774595' },
      editor_id: 'RD01_GuardianRace',
      fields: { 'Body Part Data': '0x0077B596' },
    },
    '0x0077B596': {
      header: { signature: 'BPTD', form_id: '0x0077B596' },
      editor_id: 'GuardianBodyPartData',
      fields: (guardian as { fields: unknown }).fields as Record<string, unknown>,
    },
    // Blue Devil: RACE directly, exercises `crippleImmune` forcing every part non-crippable.
    BlueDevilRace: {
      header: { signature: 'RACE', form_id: '0x00847623' },
      editor_id: 'BlueDevilRace',
      fields: { 'Body Part Data': '0x00017AD4' },
    },
  };
  const fakeClient = {
    get: async (target: string) => {
      const record = records[target];
      if (!record) throw new Error(`not found: ${target}`);
      return record;
    },
    resolveEdid: async (formId: string) => records[formId]?.editor_id ?? `<unresolved:${formId}>`,
  } as unknown as EsmClient;

  it('resolves NPC_ rows through fields.Race and RACE rows directly', async () => {
    const { races } = await extractBodyParts(fakeClient);
    const boss = races.find((r) => r.id === 'Burn_BountyTarget_BIG_Death');
    const race = races.find((r) => r.id === 'HumanRace');
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

  it('records the resolved RACE edid and its ActorType* keywords for enemy-type matching', async () => {
    const { races } = await extractBodyParts(fakeClient);
    const race = races.find((r) => r.id === 'HumanRace');
    const boss = races.find((r) => r.id === 'Burn_BountyTarget_BIG_Death');
    const guardianBoss = races.find((r) => r.id === 'RD01_Enc01_GuardianBot');
    // RACE rows: raceEdid equals the row id; KWDA filtered to ActorType* only.
    expect(race!.raceEdid).toBe('HumanRace');
    expect(race!.keywords).toEqual(['ActorTypeHuman', 'ActorTypeNPC']);
    // NPC_ rows: raceEdid is the resolved race's edid, not the boss's own id.
    expect(boss!.raceEdid).toBe('HumanRace');
    expect(boss!.keywords).toEqual(['ActorTypeHuman', 'ActorTypeNPC']);
    // A race with no Keywords block yields an empty list, not a crash.
    expect(guardianBoss!.raceEdid).toBe('RD01_GuardianRace');
    expect(guardianBoss!.keywords).toEqual([]);
  });

  it('applies conditionPartsOnly through the full NPC_ → RACE → BPTD resolution', async () => {
    const { races } = await extractBodyParts(fakeClient);
    const boss = races.find((r) => r.id === 'RD01_Enc01_GuardianBot');
    expect(boss).toBeDefined();
    expect(boss!.parts.map((p) => p.name).sort()).toEqual(
      ['Torso', 'Ultragenetic Shield System'].sort(),
    );
    expect(boss!.crippableLimbCount).toBe(1);
    expect(boss!.noCripple).toBe(false);
  });

  it('forces every part non-crippable and crippableLimbCount to 0 for a crippleImmune race', async () => {
    const { races } = await extractBodyParts(fakeClient);
    const blueDevil = races.find((r) => r.id === 'BlueDevilRace');
    expect(blueDevil).toBeDefined();
    expect(blueDevil!.noCripple).toBe(true);
    expect(blueDevil!.crippableLimbCount).toBe(0);
    expect(blueDevil!.parts.every((p) => !p.crippable)).toBe(true);
    // The parts themselves (names/mults) are unaffected — only crippable state is forced.
    expect(blueDevil!.parts.length).toBeGreaterThan(0);
  });

  it('files unfetchable rows under unresolved instead of crashing', async () => {
    const { unresolved } = await extractBodyParts(fakeClient);
    // Every curated row missing from the fake store is reported, none throw.
    expect(unresolved.length).toBeGreaterThan(0);
    expect(unresolved.every((u) => u.startsWith('bodyparts:'))).toBe(true);
  });
});
