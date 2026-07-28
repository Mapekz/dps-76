import { describe, it, expect } from 'vitest';
import type { EsmClient, EsmRecord } from '../esm-client';
import {
  CURVE_TABLE_GROUPS,
  CURVE_TABLE_SINGLETONS,
  extractCurveTables,
  tierFromEdid,
  toCurveTableFile,
} from '../extract-curvetables';
import armorTier22 from './fixtures/curv-creatures-armor-tier22.json';
import armorTier49Zzz from './fixtures/curv-creatures-armor-tier49-zzz.json';
import percentOfMinToMaxRange from './fixtures/curv-player-range-percentofmintomaxrangedamagemult.json';
import luckVatsCriticalCharge from './fixtures/curv-player-vats-luckvatscriticalcharge.json';
import chargedMeleeAttack from './fixtures/curv-legendarymods-weapon-chargedmeleeattack.json';
import specialLevelReward from './fixtures/curv-player-special-levelrewardcurve.json';
import legendaryPerkSlotCount from './fixtures/curv-player-perks-legendaryperkslotcount.json';

// Fixtures are verbatim `esm -p get <formid|edid> --json` output (20260710
// ESM): CT_Creatures_Armor_Universal_Tier22 (0x0076E999, the record proven
// stale in the Phase 2 spike — 50 points, domain 1-540, vs. the checked-in
// hand-copy's 50 points/domain 2-100) and the zzz-renamed Tier49
// (0x0076E9B4, `zzzCT_Creatures_Armor_Universal_Tier49` — still FormID-live,
// just hidden from CK's "new record" browser by convention). The singleton
// fixtures are `CT_Player_PercentOfMinToMaxRangeDMGMult` (0x008407AC, the
// range-falloff curve `src/lib/distance.ts` consumes),
// `CT_LuckVATSCriticalCharge` (0x00655629, 20260717 ESM, the per-LCK VATS
// crit-meter fill curve `src/lib/engine/crit-meter.ts` consumes),
// `CT_Legendary_Weapon_ChargedUpWeapon` (0x008A3B85, 20260717 ESM, the
// Charged 4★ melee bonus curve `src/lib/engine/scenarios.ts` consumes),
// `SPECIAL_LevelRewardCurve` (0x004F473F, 20260717 ESM, the level→SPECIAL
// points curve behind `src/lib/player-stats.ts`'s allocation pool), and
// `LegendaryPerkSlotCount` (0x005B67A0, 20260717 ESM, the slot→unlock-level
// curve behind `src/state/build-reducer.ts`'s LEGENDARY_PERK_SLOTS).

describe('tierFromEdid', () => {
  it('parses a plain tier suffix', () => {
    expect(tierFromEdid('CT_Creatures_Health_Universal_Tier23')).toBe(23);
  });

  it('parses a zero-padded tier suffix without keeping the padding', () => {
    expect(tierFromEdid('CT_Creatures_Health_Universal_Tier01')).toBe(1);
  });

  it('is tolerant of the zzz-retired-record prefix', () => {
    expect(tierFromEdid('zzzCT_Creatures_Armor_Universal_Tier49')).toBe(49);
  });

  it('returns null when there is no trailing tier number', () => {
    expect(tierFromEdid('CT_Player_PercentOfMinToMaxRangeDMGMult')).toBeNull();
  });
});

describe('toCurveTableFile', () => {
  it('normalizes the raw esm Curve field to the checked-in {curve:[...]} shape', () => {
    const file = toCurveTableFile((armorTier22 as { fields: { Curve: unknown } }).fields.Curve);
    expect(file).not.toBeNull();
    expect(file!.curve).toHaveLength(50);
    // The exact staleness gap the Phase 2 spike found: checked-in tier22
    // armor was {x:2,y:7}…{x:100,y:144}; live is {x:1,y:23}…{x:540,y:2151}.
    expect(file!.curve[0]).toEqual({ x: 1, y: 23 });
    expect(file!.curve.at(-1)).toEqual({ x: 540, y: 2151 });
  });

  it('drops float-integer noise the same way JSON.stringify naturally does (1.0 → 1, not "1.0")', () => {
    const file = toCurveTableFile([{ x: 1.0, y: 23.0 }]);
    expect(JSON.stringify(file)).toBe('{"curve":[{"x":1,"y":23}]}');
  });

  it('returns null for a non-array input', () => {
    expect(toCurveTableFile(null)).toBeNull();
    expect(toCurveTableFile(undefined)).toBeNull();
  });

  it('returns an empty curve (not null) for an empty array', () => {
    expect(toCurveTableFile([])).toEqual({ curve: [] });
  });

  it('normalizes the singleton range-falloff curve (CT_Player_PercentOfMinToMaxRangeDMGMult), matching the previously hand-copied file', () => {
    const file = toCurveTableFile(
      (percentOfMinToMaxRange as { fields: { Curve: unknown } }).fields.Curve,
    );
    expect(file).toEqual({
      curve: [
        { x: 1, y: 1 },
        { x: 1.5, y: 0.75 },
        { x: 1.75, y: 0.55 },
        { x: 2, y: 0.2 },
      ],
    });
  });
});

describe('extractCurveTables', () => {
  /** Minimal DFOB stub — real DFOB records carry exactly one `Object` field. */
  function dfobRecord(formId: string, editorId: string, target: string): EsmRecord {
    return {
      header: { signature: 'DFOB', form_id: formId },
      editor_id: editorId,
      fields: { Object: target },
    };
  }

  // Every test's fake client resolves the singletons' DFOB-first chain
  // (DFOB by formid → `Object` → CURV by formid, same as
  // `resolveSingletonRecord`) so group-focused tests aren't forced to
  // special-case the extra files the singleton loop always appends. CURV
  // records are ALSO keyed by editor_id for the fallback-path tests. See the
  // dedicated singleton tests below for the DFOB failure/repoint paths.
  const records: Record<string, EsmRecord> = {
    '0x0076E999': armorTier22 as unknown as EsmRecord,
    '0x0076E9B4': armorTier49Zzz as unknown as EsmRecord,
    // DFOB bridges (formid → Object → CURV formid).
    '0x008407AD': dfobRecord(
      '0x008407AD',
      'CombatFormulaPercentOfMinToMaxRangeDMGMult_DO',
      '0x008407AC',
    ),
    '0x0065562A': dfobRecord('0x0065562A', 'LuckVATSCriticalChargeCurve_DO', '0x00655629'),
    '0x0089A83C': dfobRecord(
      '0x0089A83C',
      'WeaponSecondaryChargeUpDamageBonusCurve_DO',
      '0x008A3B85',
    ),
    '0x004F4740': dfobRecord('0x004F4740', 'SpecialPointCurve_DO', '0x004F473F'),
    '0x005B67A1': dfobRecord('0x005B67A1', 'LegendaryPerkSlotCurve_DO', '0x005B67A0'),
    // Singleton CURVs by formid (the DFOB target hop)…
    '0x008407AC': percentOfMinToMaxRange as unknown as EsmRecord,
    '0x00655629': luckVatsCriticalCharge as unknown as EsmRecord,
    '0x008A3B85': chargedMeleeAttack as unknown as EsmRecord,
    '0x004F473F': specialLevelReward as unknown as EsmRecord,
    '0x005B67A0': legendaryPerkSlotCount as unknown as EsmRecord,
    // …and by editor_id (the DFOB-failure fallback path).
    CT_Player_PercentOfMinToMaxRangeDMGMult: percentOfMinToMaxRange as unknown as EsmRecord,
    CT_LuckVATSCriticalCharge: luckVatsCriticalCharge as unknown as EsmRecord,
    CT_Legendary_Weapon_ChargedUpWeapon: chargedMeleeAttack as unknown as EsmRecord,
    SPECIAL_LevelRewardCurve: specialLevelReward as unknown as EsmRecord,
    LegendaryPerkSlotCount: legendaryPerkSlotCount as unknown as EsmRecord,
  };

  function makeClient(
    searchRows: Array<{ form_id: string; editor_id: string }>,
    recordSet: Record<string, EsmRecord> = records,
  ): EsmClient {
    return {
      async search(pattern: string, opts: { type?: string }) {
        // Only the Creatures/Armor group's pattern is exercised by this fake
        // client — the other 3 groups return empty (landing in `files: []`,
        // not `unresolved`).
        if (pattern.includes('Creatures_Armor') && opts.type === 'CURV') {
          return searchRows.map((r) => ({ ...r, record_type: 'CURV', name: null }));
        }
        return [];
      },
      async get(formId: string) {
        const record = recordSet[formId];
        if (!record) throw new Error(`stub: no record for ${formId}`);
        return record;
      },
    } as unknown as EsmClient;
  }

  const singletonRelativePaths = [
    'player/range/percentofmintomaxrangedamagemult.json',
    'player/vats/luckvatscriticalcharge.json',
    'legendarymods/weapon_chargedmeleeattack.json',
    'player/special/levelrewardcurve.json',
    'player/perks/legendaryperkslotcount.json',
  ];

  it('writes one file per tier, sorted ascending, including a zzz-renamed record, plus all 5 singletons', async () => {
    const client = makeClient([
      { form_id: '0x0076E999', editor_id: 'CT_Creatures_Armor_Universal_Tier22' },
      { form_id: '0x0076E9B4', editor_id: 'zzzCT_Creatures_Armor_Universal_Tier49' },
    ]);
    const { files, unresolved } = await extractCurveTables(client);
    expect(unresolved).toEqual([]);
    expect(files).toHaveLength(7);
    expect(files.map((f) => f.relativePath)).toEqual([
      'creatures/armor/armor_universal_tier22.json',
      'creatures/armor/armor_universal_tier49.json',
      ...singletonRelativePaths,
    ]);
    expect(files[0].content.curve).toHaveLength(50);
  });

  it('reports unresolved for a search hit with no parseable tier and skips it (not a crash)', async () => {
    const client = makeClient([
      { form_id: '0x0076E999', editor_id: 'CT_Creatures_Armor_Universal_Tier22' },
      { form_id: '0x00999999', editor_id: 'CT_Creatures_Armor_NotATierRecord' },
    ]);
    const { files, unresolved } = await extractCurveTables(client);
    expect(files).toHaveLength(6); // 1 tier + all 5 singletons
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]).toContain('CT_Creatures_Armor_NotATierRecord');
  });

  it('reports unresolved when get() fails for a matched record', async () => {
    const client = makeClient([
      { form_id: '0xDEADBEEF', editor_id: 'CT_Creatures_Armor_Universal_Tier1' },
    ]);
    const { files, unresolved } = await extractCurveTables(client);
    expect(files.map((f) => f.relativePath)).toEqual(singletonRelativePaths);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]).toContain('CT_Creatures_Armor_Universal_Tier1');
  });

  it('covers all 4 Universal Tier families, none other', () => {
    expect(CURVE_TABLE_GROUPS.map((g) => g.outSubdir).sort()).toEqual(
      ['creatures/armor', 'creatures/health', 'player/armor', 'player/damage'].sort(),
    );
  });

  describe('singleton curve tables', () => {
    it('lists exactly the 5 DFOB-bridged singletons today', () => {
      expect(
        CURVE_TABLE_SINGLETONS.map((s) => ({
          editorId: s.editorId,
          dfobEditorId: s.dfob?.editorId,
        })),
      ).toEqual([
        {
          editorId: 'CT_Player_PercentOfMinToMaxRangeDMGMult',
          dfobEditorId: 'CombatFormulaPercentOfMinToMaxRangeDMGMult_DO',
        },
        { editorId: 'CT_LuckVATSCriticalCharge', dfobEditorId: 'LuckVATSCriticalChargeCurve_DO' },
        {
          editorId: 'CT_Legendary_Weapon_ChargedUpWeapon',
          dfobEditorId: 'WeaponSecondaryChargeUpDamageBonusCurve_DO',
        },
        { editorId: 'SPECIAL_LevelRewardCurve', dfobEditorId: 'SpecialPointCurve_DO' },
        { editorId: 'LegendaryPerkSlotCount', dfobEditorId: 'LegendaryPerkSlotCurve_DO' },
      ]);
    });

    it('resolves each singleton DFOB-first and writes it alongside the group files', async () => {
      // No group search hits at all — the singletons don't depend on any
      // CURVE_TABLE_GROUPS match.
      const client = makeClient([]);
      const { files, unresolved } = await extractCurveTables(client);
      expect(unresolved).toEqual([]);
      expect(files).toHaveLength(5);
      const [rangeFile, luckFile, chargedFile, specialFile, slotsFile] = files;
      expect(rangeFile.relativePath).toBe(singletonRelativePaths[0]);
      expect(rangeFile.editorId).toBe('CT_Player_PercentOfMinToMaxRangeDMGMult');
      expect(rangeFile.formId).toBe('0x008407AC');
      // Matches the previously hand-copied src/data/*/curvetables/player/range/percentofmintomaxrangedamagemult.json exactly.
      expect(rangeFile.content).toEqual({
        curve: [
          { x: 1, y: 1 },
          { x: 1.5, y: 0.75 },
          { x: 1.75, y: 0.55 },
          { x: 2, y: 0.2 },
        ],
      });
      expect(luckFile.relativePath).toBe(singletonRelativePaths[1]);
      expect(luckFile.editorId).toBe('CT_LuckVATSCriticalCharge');
      expect(luckFile.formId).toBe('0x00655629');
      // Domain 1–100 matches the SPECIAL clamp exactly (docs/assumptions.md).
      expect(luckFile.content.curve).toHaveLength(22);
      expect(luckFile.content.curve[0]).toEqual({ x: 1, y: 3 });
      expect(luckFile.content.curve.at(-1)).toEqual({ x: 100, y: 45 });
      expect(chargedFile.relativePath).toBe(singletonRelativePaths[2]);
      expect(chargedFile.editorId).toBe('CT_Legendary_Weapon_ChargedUpWeapon');
      expect(chargedFile.formId).toBe('0x008A3B85');
      // Matches src/lib/engine/scenarios.ts's previously-hardcoded CHARGED_MAX_CHARGES/CHARGED_FULL_BONUS exactly.
      expect(chargedFile.content).toEqual({
        curve: [
          { x: 1, y: 0.5 },
          { x: 2, y: 1.5 },
          { x: 3, y: 3 },
        ],
      });
      // X = player level, Y = cumulative SPECIAL points: (1,0)…(50,49) —
      // src/lib/player-stats.ts derives the 56-point pool from this.
      expect(specialFile.relativePath).toBe(singletonRelativePaths[3]);
      expect(specialFile.formId).toBe('0x004F473F');
      expect(specialFile.content.curve).toHaveLength(50);
      expect(specialFile.content.curve[0]).toEqual({ x: 1, y: 0 });
      expect(specialFile.content.curve.at(-1)).toEqual({ x: 50, y: 49 });
      // X = slot number, Y = unlock level — build-reducer.ts counts y ≤ level.
      expect(slotsFile.relativePath).toBe(singletonRelativePaths[4]);
      expect(slotsFile.formId).toBe('0x005B67A0');
      expect(slotsFile.content).toEqual({
        curve: [
          { x: 1, y: 50 },
          { x: 2, y: 75 },
          { x: 3, y: 100 },
          { x: 4, y: 150 },
          { x: 5, y: 200 },
          { x: 6, y: 300 },
        ],
      });
    });

    it('falls back to the editor_id get (with an unresolved note) when a DFOB fails to resolve', async () => {
      // Strip the DFOB records — every singleton takes the fallback path.
      const noDfobs = Object.fromEntries(
        Object.entries(records).filter(([, rec]) => rec.header.signature !== 'DFOB'),
      );
      const client = makeClient([], noDfobs);
      const { files, unresolved } = await extractCurveTables(client);
      expect(files).toHaveLength(5);
      expect(files.map((f) => f.relativePath)).toEqual(singletonRelativePaths);
      expect(unresolved).toHaveLength(5);
      for (const note of unresolved) expect(note).toContain('falling back');
    });

    it('uses a repointed DFOB target (the exe truth) but flags the mismatch for review', async () => {
      // Repoint the range-falloff DFOB at the luck curve.
      const repointed = {
        ...records,
        '0x008407AD': dfobRecord(
          '0x008407AD',
          'CombatFormulaPercentOfMinToMaxRangeDMGMult_DO',
          '0x00655629',
        ),
      };
      const client = makeClient([], repointed);
      const { files, unresolved } = await extractCurveTables(client);
      expect(files).toHaveLength(5);
      // The DFOB target wins: the range-falloff output now carries the luck curve.
      expect(files[0].relativePath).toBe(singletonRelativePaths[0]);
      expect(files[0].editorId).toBe('CT_LuckVATSCriticalCharge');
      expect(unresolved).toHaveLength(1);
      expect(unresolved[0]).toContain('repointed');
      expect(unresolved[0]).toContain('CombatFormulaPercentOfMinToMaxRangeDMGMult_DO');
    });

    it('falls back (with a note) when a DFOB points at a non-CURV record', async () => {
      const misdirected = {
        ...records,
        // Point the charged-melee DFOB at another DFOB record (not a CURV).
        '0x0089A83C': dfobRecord(
          '0x0089A83C',
          'WeaponSecondaryChargeUpDamageBonusCurve_DO',
          '0x0065562A',
        ),
      };
      const client = makeClient([], misdirected);
      const { files, unresolved } = await extractCurveTables(client);
      expect(files).toHaveLength(5);
      expect(files[2].editorId).toBe('CT_Legendary_Weapon_ChargedUpWeapon'); // fallback get by editor_id
      expect(unresolved).toHaveLength(1);
      expect(unresolved[0]).toContain('not a CURV');
    });

    it('reports unresolved when every get() fails for a singleton (not a crash)', async () => {
      const client: EsmClient = {
        async search() {
          return [];
        },
        async get(target: string) {
          throw new Error(`stub: no record for ${target}`);
        },
      } as unknown as EsmClient;
      const { files, unresolved } = await extractCurveTables(client);
      expect(files).toEqual([]);
      // Two notes per singleton: the DFOB failure + the editor_id fallback failure.
      expect(unresolved).toHaveLength(10);
      expect(unresolved[0]).toContain('CombatFormulaPercentOfMinToMaxRangeDMGMult_DO');
      expect(unresolved[1]).toContain('get CT_Player_PercentOfMinToMaxRangeDMGMult failed');
    });
  });
});
