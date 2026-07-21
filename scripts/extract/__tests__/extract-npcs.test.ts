import { describe, it, expect, beforeEach } from 'vitest';
import type { EsmClient, EsmRecord } from '../esm-client';
import { CURATED_TARGETS } from '../curated-targets';
import {
  RACE_NPC_TEMPLATES,
  BOSS_EPIC_RANK_QUESTS,
  avToNumber,
  mergeProperties,
  resolveStat,
  epicRankFromEncounterWaves,
  epicRankFromForceLegendaryAlias,
  resolveEpicRankFromVmad,
  resolveNormalizedLevelAdjustment,
  applyNormalizedLevelAdjustment,
  extractNpcs,
  type RawProperty,
} from '../extract-npcs';
import npcEarle from './fixtures/npc-earle.json';
import npcSbq from './fixtures/npc-sbq.json';
import npcSuperMutantTemplate from './fixtures/npc-supermutant-template.json';
import raceSuperMutant from './fixtures/race-supermutant.json';
import raceWendigoColossus from './fixtures/race-wendigocolossus.json';
import raceScorchbeast from './fixtures/race-scorchbeast.json';
import questCb15 from './fixtures/qust-cb15-scorchedearth.json';
import questStormRegionBoss from './fixtures/qust-storm-regionboss.json';
import questE06Colossus from './fixtures/qust-e06-colossus.json';

// npc-*.json fixtures are verbatim `esm -p get <edid> --json` output
// (20260710 ESM): EN06_LvlWendigoColossus_Nuked (Earle, 0x0059E02F),
// EncScorchbeastQueen01Template (the SBQ world-spawn template curated row,
// 0x00043C75 — NOT the unique boss CB15_ScorchBeastQueen), EncSuperMutant_Template
// (0x0001A00C). race-*.json fixtures are TRIMMED to {header, editor_id,
// fields.Properties} — a RACE record carries ~50-200KB of unrelated
// morph/head-part/outfit data no code path here reads; keeping the full dump
// would 5-10x these fixtures' size for zero test value.
//
// qust-*.json fixtures are TRIMMED (2026-07-19, `esm -p get <questEdid>
// --json`, live-queried — not inherited from any earlier informal
// investigation) to {header, editor_id, fields.'Virtual Machine Adapter'}:
// CB15_ScorchedEarth (0x003E271D, SBQ's summon quest — shape a, the
// 'defaultquestencounterwavescript' EncounterWaves boss wave), Storm_RegionBoss
// (0x006AD506, Storm Goliath's — shape b, 3 boss-alias
// defaultforcelegendaryalias scripts), and E06_Colossus (0x00583D14, Earle's
// — carries NEITHER shape; locks in the "epicRank left unset" fallback).

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

describe('BOSS_EPIC_RANK_QUESTS', () => {
  it('has an entry for every mapped boss, keyed by a real curated target edid', () => {
    const curatedEdids = new Set(CURATED_TARGETS.map(t => t.edid));
    for (const key of Object.keys(BOSS_EPIC_RANK_QUESTS)) {
      expect(curatedEdids.has(key), `BOSS_EPIC_RANK_QUESTS key "${key}" is not a curated target edid`).toBe(true);
    }
  });

  it('covers exactly the 3 ESM-proven bosses (SBQ, Earle, Storm Goliath) — Earle stays mapped despite resolving to no rank (see extract-npcs.ts header note)', () => {
    expect(Object.keys(BOSS_EPIC_RANK_QUESTS).sort()).toEqual(
      ['EncScorchbeastQueen01Template', 'StormBossRace', 'WendigoColossusRace'].sort()
    );
  });
});

type Vmad = Parameters<typeof resolveEpicRankFromVmad>[0];
const vmadOf = (quest: { fields: Record<string, unknown> }): Vmad => quest.fields['Virtual Machine Adapter'] as Vmad;

describe('epicRankFromEncounterWaves (shape a — CB15_ScorchedEarth, SBQ)', () => {
  it('reads BossEpicLevel from the boss wave when BossEpicChance is 100', () => {
    expect(epicRankFromEncounterWaves(vmadOf(questCb15))).toBe(3);
  });

  it('returns null when no EncounterWaves property exists', () => {
    expect(epicRankFromEncounterWaves({ version: 6, scripts: [], aliases: [] })).toBeNull();
  });

  it('ignores a wave with BossEpicLevel but a sub-100 BossEpicChance (a roll, not a forced rank)', () => {
    const vmad = {
      version: 6,
      scripts: [
        {
          name: 'defaultquestencounterwavescript',
          status: 0,
          properties: [
            {
              name: 'EncounterWaves',
              type: 17,
              value: [[
                { name: 'BossEpicLevel', type: 3, value: 3 },
                { name: 'BossEpicChance', type: 4, value: 50.0 },
              ]],
            },
          ],
        },
      ],
    };
    expect(epicRankFromEncounterWaves(vmad)).toBeNull();
  });
});

describe('epicRankFromForceLegendaryAlias (shape b — Storm_RegionBoss, Storm Goliath)', () => {
  it('reads minRank from a defaultforcelegendaryalias boss-alias script', () => {
    expect(epicRankFromForceLegendaryAlias(vmadOf(questStormRegionBoss))).toBe(3);
  });

  it('skips alias entries whose scripts are not defaultforcelegendaryalias', () => {
    const vmad = {
      version: 6,
      scripts: [],
      aliases: [
        { alias_id: 0, form_id: '0x1', alias_scripts: [{ name: 'someOtherAliasScript', status: 0, properties: [{ name: 'minRank', type: 3, value: 5 }] }] },
      ],
    };
    expect(epicRankFromForceLegendaryAlias(vmad)).toBeNull();
  });
});

describe('resolveEpicRankFromVmad (both shapes combined)', () => {
  it('CB15_ScorchedEarth resolves via shape a', () => {
    expect(resolveEpicRankFromVmad(vmadOf(questCb15))).toBe(3);
  });

  it('Storm_RegionBoss resolves via shape b', () => {
    expect(resolveEpicRankFromVmad(vmadOf(questStormRegionBoss))).toBe(3);
  });

  it('E06_Colossus (Earle) matches NEITHER shape — real 20260710 ESM data, not a synthetic gap', () => {
    expect(resolveEpicRankFromVmad(vmadOf(questE06Colossus))).toBeNull();
  });
});

describe('applyNormalizedLevelAdjustment', () => {
  it('a null base stays null regardless of adjustment (no window to fabricate)', () => {
    expect(applyNormalizedLevelAdjustment(null, { op: 'add', delta: 25 })).toBeNull();
    expect(applyNormalizedLevelAdjustment(null, { op: 'set', value: 150 })).toBeNull();
    expect(applyNormalizedLevelAdjustment(null, null)).toBeNull();
  });

  it('a null adjustment leaves the base untouched', () => {
    expect(applyNormalizedLevelAdjustment(25, null)).toBe(25);
  });

  it('Add accumulates onto the base', () => {
    expect(applyNormalizedLevelAdjustment(25, { op: 'add', delta: 25 })).toBe(50);
  });

  it('Set replaces the base outright', () => {
    expect(applyNormalizedLevelAdjustment(25, { op: 'set', value: 150 })).toBe(150);
  });
});

describe('resolveNormalizedLevelAdjustment', () => {
  /** Builds a fake PERK record's `Effects` array in the exact shape esm emits (verified live against crModNormalizedLevelPerk_25/HTO_crModNormalizedLevelPerk_Boss, 20260717 dump). */
  function entryPointEffect(entryPoint: string, functionName: string, float: number) {
    return {
      Effect: {
        'Effect Header': { 'Effect Type': { value: 2, name: 'Entry Point' } },
        'Entry Point': { 'Entry Point': { name: entryPoint }, Function: { name: functionName } },
        Float: float,
      },
    };
  }
  const nonEntryPointEffect = { Effect: { 'Effect Header': { 'Effect Type': { value: 1, name: 'Ability' } } } };

  function fakeClientWith(records: Record<string, EsmRecord>): EsmClient {
    return {
      async get(target: string): Promise<EsmRecord> {
        const record = records[target];
        if (!record) throw new Error(`not found: ${target}`);
        return record;
      },
    } as unknown as EsmClient;
  }

  const npcWithPerks = (perkFormIds: string[]) =>
    ({ fields: { Perks: perkFormIds.map(id => ({ Perk: { Perk: id } })) } }) as unknown as EsmRecord;

  it('an NPC with no Perks field resolves to {min: null, max: null}', async () => {
    const npc = { fields: {} } as unknown as EsmRecord;
    const result = await resolveNormalizedLevelAdjustment(fakeClientWith({}), npc, 'x', []);
    expect(result).toEqual({ min: null, max: null });
  });

  it('crModNormalizedLevelPerk_25-shaped perk (Add +25/+25 on both entry points)', async () => {
    const client = fakeClientWith({
      '0x0089ECDB': {
        fields: {
          Effects: [
            entryPointEffect('Mod NPC Normalized Min Level', 'Add Value', 25),
            entryPointEffect('Mod NPC Normalized Max level', 'Add Value', 25),
            entryPointEffect('Mod NPC Normalized Level', 'Add Value', 25), // irrelevant 3rd entry point — ignored
          ],
        },
      } as unknown as EsmRecord,
    });
    const npc = npcWithPerks(['0x0089ECDB']);
    const result = await resolveNormalizedLevelAdjustment(client, npc, 'x', []);
    expect(result).toEqual({ min: { op: 'add', delta: 25 }, max: { op: 'add', delta: 25 } });
  });

  it('HTO_crModNormalizedLevelPerk_Boss-shaped perk (Set 150/200)', async () => {
    const client = fakeClientWith({
      '0x00862421': {
        fields: {
          Effects: [
            entryPointEffect('Mod NPC Normalized Min Level', 'Set Value', 150),
            entryPointEffect('Mod NPC Normalized Max level', 'Set Value', 200),
          ],
        },
      } as unknown as EsmRecord,
    });
    const npc = npcWithPerks(['0x00862421']);
    const result = await resolveNormalizedLevelAdjustment(client, npc, 'x', []);
    expect(result).toEqual({ min: { op: 'set', value: 150 }, max: { op: 'set', value: 200 } });
  });

  it('two Add perks accumulate cumulatively per bound', async () => {
    const client = fakeClientWith({
      '0xAAA': { fields: { Effects: [entryPointEffect('Mod NPC Normalized Min Level', 'Add Value', 10)] } } as unknown as EsmRecord,
      '0xBBB': { fields: { Effects: [entryPointEffect('Mod NPC Normalized Min Level', 'Add Value', 25)] } } as unknown as EsmRecord,
    });
    const npc = npcWithPerks(['0xAAA', '0xBBB']);
    const result = await resolveNormalizedLevelAdjustment(client, npc, 'x', []);
    expect(result.min).toEqual({ op: 'add', delta: 35 });
  });

  it('two Set perks: last one (in Perks array order) wins', async () => {
    const client = fakeClientWith({
      '0xAAA': { fields: { Effects: [entryPointEffect('Mod NPC Normalized Min Level', 'Set Value', 15)] } } as unknown as EsmRecord,
      '0xBBB': { fields: { Effects: [entryPointEffect('Mod NPC Normalized Min Level', 'Set Value', 40)] } } as unknown as EsmRecord,
    });
    const npc = npcWithPerks(['0xAAA', '0xBBB']);
    const result = await resolveNormalizedLevelAdjustment(client, npc, 'x', []);
    expect(result.min).toEqual({ op: 'set', value: 40 });
  });

  it('an unresolvable Perks entry pushes an unresolved note and is skipped, not a crash', async () => {
    const unresolved: string[] = [];
    const npc = npcWithPerks(['0xDEAD']);
    const result = await resolveNormalizedLevelAdjustment(fakeClientWith({}), npc, 'SomeNpc', unresolved);
    expect(result).toEqual({ min: null, max: null });
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]).toContain('SomeNpc');
    expect(unresolved[0]).toContain('0xDEAD');
  });

  it('ignores non-Entry-Point effects and unrelated entry points on the same perk', async () => {
    const client = fakeClientWith({
      '0xCCC': {
        fields: {
          Effects: [
            nonEntryPointEffect,
            entryPointEffect('Mod Weapon Attack Damage', 'Multiply Value', 1.5),
            entryPointEffect('Mod NPC Normalized Max level', 'Add Value', 25),
          ],
        },
      } as unknown as EsmRecord,
    });
    const npc = npcWithPerks(['0xCCC']);
    const result = await resolveNormalizedLevelAdjustment(client, npc, 'x', []);
    expect(result).toEqual({ min: null, max: { op: 'add', delta: 25 } });
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
    // Epic-rank summon quests (Phase A) — keyed by questEdid, exactly how
    // `resolveBossEpicRank` fetches them (BOSS_EPIC_RANK_QUESTS).
    CB15_ScorchedEarth: questCb15 as unknown as EsmRecord,
    E06_Colossus: questE06Colossus as unknown as EsmRecord,
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

  it('resolves Earle (WendigoColossusRace → the Earle override, not the generic template); its epic rank stays unset (E06_Colossus proves neither VMAD shape)', async () => {
    const { npcs, unresolved } = await extractNpcs(fakeClient);
    const earle = npcs.find(n => n.id === 'WendigoColossusRace');
    expect(earle).toBeDefined();
    expect(earle!.formId).toBe('0x0059E02F');
    expect(earle!.name).toBe('Earle / Wendigo Colossus');
    expect(earle!.levelMinGlobal).toBe(80);
    expect(earle!.levelMaxGlobal).toBe(100);
    expect(earle!.levelOffsetGlobal).toBeNull();
    expect(earle!.healthCurveTier).toBe(55);
    expect(earle!.resists).toHaveLength(6);
    expect(earle!.epicRank).toBeUndefined();
    expect(unresolved.some(u => u.includes('WendigoColossusRace epic-rank quest E06_Colossus'))).toBe(true);
  });

  it('resolves the Scorchbeast Queen curated row (EncScorchbeastQueen01Template, already NPC_-keyed); epicRank 3 from CB15_ScorchedEarth', async () => {
    const { npcs } = await extractNpcs(fakeClient);
    const sbq = npcs.find(n => n.id === 'EncScorchbeastQueen01Template');
    expect(sbq).toBeDefined();
    expect(sbq!.name).toBe('Scorchbeast Queen');
    expect(sbq!.healthCurveTier).toBe(55);
    expect(sbq!.levelMinGlobal).toBe(80);
    expect(sbq!.levelMaxGlobal).toBe(100);
    expect(sbq!.epicRank).toBe(3);
  });

  it('a curated row with no BOSS_EPIC_RANK_QUESTS entry (SuperMutantRace) never gets an epicRank', async () => {
    const { npcs } = await extractNpcs(fakeClient);
    const sm = npcs.find(n => n.id === 'SuperMutantRace');
    expect(sm!.epicRank).toBeUndefined();
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
