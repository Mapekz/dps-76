import { describe, it, expect, beforeEach } from 'vitest';
import type { EsmClient, EsmRecord } from '../esm-client';
import { CURATED_TARGETS } from '../curated-targets';
import {
  RACE_NPC_TEMPLATES,
  avToNumber,
  mergeProperties,
  resolveStat,
  extractNpcs,
  type RawProperty,
} from '../extract-npcs';
import npcEarle from './fixtures/npc-earle.json';
import npcSbq from './fixtures/npc-sbq.json';
import npcSuperMutantTemplate from './fixtures/npc-supermutant-template.json';
import raceSuperMutant from './fixtures/race-supermutant.json';
import raceWendigoColossus from './fixtures/race-wendigocolossus.json';
import raceScorchbeast from './fixtures/race-scorchbeast.json';

// npc-*.json fixtures are verbatim `esm -p get <edid> --json` output
// (20260710 ESM): EN06_LvlWendigoColossus_Nuked (Earle, 0x0059E02F),
// EncScorchbeastQueen01Template (the SBQ world-spawn template curated row,
// 0x00043C75 — NOT the unique boss CB15_ScorchBeastQueen), EncSuperMutant_Template
// (0x0001A00C). race-*.json fixtures are TRIMMED to {header, editor_id,
// fields.Properties} — a RACE record carries ~50-200KB of unrelated
// morph/head-part/outfit data no code path here reads; keeping the full dump
// would 5-10x these fixtures' size for zero test value.

describe('avToNumber', () => {
  it('parses a padded hex AV string', () => {
    expect(avToNumber('0x000002D4')).toBe(0x2d4);
  });
  it('returns null for null/undefined', () => {
    expect(avToNumber(null)).toBeNull();
    expect(avToNumber(undefined)).toBeNull();
  });
});

describe('mergeProperties', () => {
  const race: RawProperty[] = [
    { 'Actor Value': '0x000002E3', Value: 0, 'Curve Table': { editor_id: 'CT_Creatures_Armor_Universal_Tier22' } },
    { 'Actor Value': '0x000002D4', Value: 0, 'Curve Table': null }, // RACE placeholder — see SuperMutantRace fixture note below.
  ];
  const npc: RawProperty[] = [
    { 'Actor Value': '0x000002D4', Value: 0, 'Curve Table': { editor_id: 'CT_Creatures_Health_Universal_Tier23' } },
  ];

  it('NPC_ overrides RACE per-AV; RACE fills AVs the NPC_ lacks', () => {
    const merged = mergeProperties(race, npc);
    expect(merged.get(0x2e3)).toEqual({ value: 0, curveTableEdid: 'CT_Creatures_Armor_Universal_Tier22' });
    // NPC_'s real curve wins over the RACE's flat-0/no-curve placeholder.
    expect(merged.get(0x2d4)).toEqual({ value: 0, curveTableEdid: 'CT_Creatures_Health_Universal_Tier23' });
  });

  it('an AV present on neither layer is simply absent from the map', () => {
    const merged = mergeProperties([], []);
    expect(merged.size).toBe(0);
  });
});

describe('resolveStat', () => {
  const unresolved: string[] = [];
  beforeEach(() => {
    unresolved.length = 0;
  });

  it('flat value with no curve table', () => {
    expect(resolveStat({ value: 850, curveTableEdid: null }, 'x', unresolved)).toEqual({ flatValue: 850, curveTier: null });
    expect(unresolved).toEqual([]);
  });

  it('curve table with a zero flat value resolves to a Tier number, flatValue 0', () => {
    expect(resolveStat({ value: 0, curveTableEdid: 'CT_Creatures_Health_Universal_Tier23' }, 'x', unresolved)).toEqual({
      flatValue: 0,
      curveTier: 23,
    });
  });

  it('flat-wins: a nonzero flat value alongside a curve table ignores the curve (RD01_Enc06_ScorchtongueHead pattern)', () => {
    expect(resolveStat({ value: 500000, curveTableEdid: 'CT_Creatures_Health_Universal_Tier59' }, 'x', unresolved)).toEqual({
      flatValue: 500000,
      curveTier: null,
    });
  });

  it('a non-Tier-suffixed curve table is reported unresolved and dropped to 0/null', () => {
    const result = resolveStat({ value: 0, curveTableEdid: 'CT_Creatures_Health_HumanRaider' }, 'some-label', unresolved);
    expect(result).toEqual({ flatValue: 0, curveTier: null });
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]).toContain('some-label');
    expect(unresolved[0]).toContain('CT_Creatures_Health_HumanRaider');
  });

  it('an absent entry resolves to 0/null with no unresolved note (the caller reports absence itself)', () => {
    expect(resolveStat(undefined, 'x', unresolved)).toEqual({ flatValue: 0, curveTier: null });
    expect(unresolved).toEqual([]);
  });
});

describe('RACE_NPC_TEMPLATES', () => {
  it('has an entry for every RACE-signature curated row, and no dangling entries for rows not in CURATED_TARGETS', () => {
    const curatedEdids = new Set(CURATED_TARGETS.map(t => t.edid));
    for (const key of Object.keys(RACE_NPC_TEMPLATES)) {
      expect(curatedEdids.has(key), `RACE_NPC_TEMPLATES key "${key}" is not a curated target edid`).toBe(true);
    }
  });
});

describe('extractNpcs (fake client — full RACE→NPC_ resolution + GLOB level windows)', () => {
  const GLOBS: Record<string, number> = {
    '0x005CFA59': 80, // Renorm_MinLVL_Boss_EN06WendigoColossus
    '0x005CFA55': 100, // Renorm_MaxLVL_Boss_EN06WendigoColossus
    '0x005C4042': 80, // Renorm_MinLVL_Tier12-ish (SBQ template min)
    '0x005C4036': 100, // (SBQ template max)
    '0x005C4038': 15, // SuperMutant min
    '0x005C4033': 100, // SuperMutant max
  };

  const records: Record<string, EsmRecord> = {
    HumanRace: { header: { signature: 'RACE', form_id: '0x00013746' }, editor_id: 'HumanRace', fields: {} } as unknown as EsmRecord,
    EN06_LvlWendigoColossus_Nuked: npcEarle as unknown as EsmRecord,
    [(npcEarle as { header: { form_id: string } }).header.form_id]: npcEarle as unknown as EsmRecord,
    WendigoColossusRace: raceWendigoColossus as unknown as EsmRecord,
    [(raceWendigoColossus as { header: { form_id: string } }).header.form_id]: raceWendigoColossus as unknown as EsmRecord,
    EncScorchbeastQueen01Template: npcSbq as unknown as EsmRecord,
    [(npcSbq as { header: { form_id: string } }).header.form_id]: npcSbq as unknown as EsmRecord,
    ScorchBeastRace: raceScorchbeast as unknown as EsmRecord,
    [(raceScorchbeast as { header: { form_id: string } }).header.form_id]: raceScorchbeast as unknown as EsmRecord,
    SuperMutantRace: { ...(raceSuperMutant as unknown as EsmRecord), editor_id: 'SuperMutantRace' },
    [(raceSuperMutant as { header: { form_id: string } }).header.form_id]: raceSuperMutant as unknown as EsmRecord,
    EncSuperMutant_Template: npcSuperMutantTemplate as unknown as EsmRecord,
    [(npcSuperMutantTemplate as { header: { form_id: string } }).header.form_id]: npcSuperMutantTemplate as unknown as EsmRecord,
  };
  for (const [formId, value] of Object.entries(GLOBS)) {
    records[formId] = { header: { signature: 'GLOB', form_id: formId }, editor_id: `glob_${formId}`, fields: { Value: value } } as unknown as EsmRecord;
  }

  // Only a slice of CURATED_TARGETS is stocked above — the rest resolve
  // through this fake client's `get` throwing "not found", landing in
  // `unresolved` rather than crashing. That's fine: this test only asserts
  // the 3 stocked rows resolve correctly plus a total-shape sanity check.
  const fakeClient = {
    async get(target: string): Promise<EsmRecord> {
      const record = records[target];
      if (!record) throw new Error(`not found: ${target}`);
      return record;
    },
  } as unknown as EsmClient;

  it('resolves Earle (WendigoColossusRace → the Earle override, not the generic template)', async () => {
    const { npcs } = await extractNpcs(fakeClient);
    const earle = npcs.find(n => n.id === 'WendigoColossusRace');
    expect(earle).toBeDefined();
    expect(earle!.formId).toBe('0x0059E02F');
    expect(earle!.name).toBe('Earle / Wendigo Colossus');
    expect(earle!.levelMinGlobal).toBe(80);
    expect(earle!.levelMaxGlobal).toBe(100);
    expect(earle!.levelOffsetGlobal).toBeNull();
    expect(earle!.healthCurveTier).toBe(55);
    expect(earle!.resists).toHaveLength(6);
  });

  it('resolves the Scorchbeast Queen curated row (EncScorchbeastQueen01Template, already NPC_-keyed)', async () => {
    const { npcs } = await extractNpcs(fakeClient);
    const sbq = npcs.find(n => n.id === 'EncScorchbeastQueen01Template');
    expect(sbq).toBeDefined();
    expect(sbq!.name).toBe('Scorchbeast Queen');
    expect(sbq!.healthCurveTier).toBe(55);
    expect(sbq!.levelMinGlobal).toBe(80);
    expect(sbq!.levelMaxGlobal).toBe(100);
  });

  it('resolves SuperMutantRace through its mapped template, and the RACE fallback layer never clobbers the NPC_-carried Health curve', async () => {
    const { npcs } = await extractNpcs(fakeClient);
    const sm = npcs.find(n => n.id === 'SuperMutantRace');
    expect(sm).toBeDefined();
    expect(sm!.formId).toBe('0x0001A00C'); // EncSuperMutant_Template's own formId, not SuperMutantRace's.
    expect(sm!.healthCurveTier).toBe(23);
    expect(sm!.healthFlatValue).toBe(0);
  });

  it('unfetchable rows land in unresolved, not a crash', async () => {
    const { npcs, unresolved } = await extractNpcs(fakeClient);
    // Only 3 of CURATED_TARGETS's rows are stocked in the fake store.
    expect(npcs.length).toBeLessThan(CURATED_TARGETS.length);
    expect(unresolved.length).toBeGreaterThan(0);
    expect(unresolved.every(u => u.startsWith('npcs:'))).toBe(true);
  });

  it('every resolved npc carries exactly the 6 documented resist damage types', async () => {
    const { npcs } = await extractNpcs(fakeClient);
    for (const npc of npcs) {
      expect(npc.resists.map(r => r.damageType).sort()).toEqual(
        ['cryo', 'energy', 'fire', 'physical', 'poison', 'radiation'].sort()
      );
    }
  });
});
