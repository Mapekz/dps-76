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

// Fixtures are verbatim `esm -p get <formid|edid> --json` output (20260710
// ESM): CT_Creatures_Armor_Universal_Tier22 (0x0076E999, the record proven
// stale in the Phase 2 spike — 50 points, domain 1-540, vs. the checked-in
// hand-copy's 50 points/domain 2-100) and the zzz-renamed Tier49
// (0x0076E9B4, `zzzCT_Creatures_Armor_Universal_Tier49` — still FormID-live,
// just hidden from CK's "new record" browser by convention). The singleton
// fixtures are `CT_Player_PercentOfMinToMaxRangeDMGMult` (0x008407AC), the
// range-falloff curve `src/lib/distance.ts` consumes — previously a
// hand-copy, now owned by `CURVE_TABLE_SINGLETONS` — and
// `CT_LuckVATSCriticalCharge` (0x00655629, 20260717 ESM), the per-LCK VATS
// crit-meter fill curve `src/lib/engine/crit-meter.ts` consumes.

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
    const file = toCurveTableFile((percentOfMinToMaxRange as { fields: { Curve: unknown } }).fields.Curve);
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
  // Every test's fake client resolves the singleton's get() (keyed by its
  // editor_id, same as the extractor's own `client.get(singleton.editorId)`
  // call) so group-focused tests aren't forced to special-case the extra
  // file the singleton loop always appends — see the dedicated singleton
  // tests below for its own success/failure paths.
  const records: Record<string, EsmRecord> = {
    '0x0076E999': armorTier22 as unknown as EsmRecord,
    '0x0076E9B4': armorTier49Zzz as unknown as EsmRecord,
    CT_Player_PercentOfMinToMaxRangeDMGMult: percentOfMinToMaxRange as unknown as EsmRecord,
    CT_LuckVATSCriticalCharge: luckVatsCriticalCharge as unknown as EsmRecord,
  };

  function makeClient(searchRows: Array<{ form_id: string; editor_id: string }>): EsmClient {
    return {
      async search(pattern: string, opts: { type?: string }) {
        // Only the Creatures/Armor group's pattern is exercised by this fake
        // client — the other 3 groups return empty (landing in `files: []`,
        // not `unresolved`).
        if (pattern.includes('Creatures_Armor') && opts.type === 'CURV') {
          return searchRows.map(r => ({ ...r, record_type: 'CURV', name: null }));
        }
        return [];
      },
      async get(formId: string) {
        const record = records[formId];
        if (!record) throw new Error(`stub: no record for ${formId}`);
        return record;
      },
    } as unknown as EsmClient;
  }

  const singletonRelativePath = 'player/range/percentofmintomaxrangedamagemult.json';
  const luckSingletonRelativePath = 'player/vats/luckvatscriticalcharge.json';

  it('writes one file per tier, sorted ascending, including a zzz-renamed record, plus both singletons', async () => {
    const client = makeClient([
      { form_id: '0x0076E999', editor_id: 'CT_Creatures_Armor_Universal_Tier22' },
      { form_id: '0x0076E9B4', editor_id: 'zzzCT_Creatures_Armor_Universal_Tier49' },
    ]);
    const { files, unresolved } = await extractCurveTables(client);
    expect(unresolved).toEqual([]);
    expect(files).toHaveLength(4);
    expect(files.map(f => f.relativePath)).toEqual([
      'creatures/armor/armor_universal_tier22.json',
      'creatures/armor/armor_universal_tier49.json',
      singletonRelativePath,
      luckSingletonRelativePath,
    ]);
    expect(files[0].content.curve).toHaveLength(50);
  });

  it('reports unresolved for a search hit with no parseable tier and skips it (not a crash)', async () => {
    const client = makeClient([
      { form_id: '0x0076E999', editor_id: 'CT_Creatures_Armor_Universal_Tier22' },
      { form_id: '0x00999999', editor_id: 'CT_Creatures_Armor_NotATierRecord' },
    ]);
    const { files, unresolved } = await extractCurveTables(client);
    expect(files).toHaveLength(3); // 1 tier + both singletons
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]).toContain('CT_Creatures_Armor_NotATierRecord');
  });

  it('reports unresolved when get() fails for a matched record', async () => {
    const client = makeClient([{ form_id: '0xDEADBEEF', editor_id: 'CT_Creatures_Armor_Universal_Tier1' }]);
    const { files, unresolved } = await extractCurveTables(client);
    expect(files.map(f => f.relativePath)).toEqual([singletonRelativePath, luckSingletonRelativePath]);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]).toContain('CT_Creatures_Armor_Universal_Tier1');
  });

  it('covers all 4 Universal Tier families, none other', () => {
    expect(CURVE_TABLE_GROUPS.map(g => g.outSubdir).sort()).toEqual(
      ['creatures/armor', 'creatures/health', 'player/armor', 'player/damage'].sort()
    );
  });

  describe('singleton curve tables', () => {
    it('lists exactly the range-falloff and luck-crit-charge singletons today', () => {
      expect(CURVE_TABLE_SINGLETONS).toEqual([
        {
          editorId: 'CT_Player_PercentOfMinToMaxRangeDMGMult',
          outSubdir: 'player/range',
          filename: 'percentofmintomaxrangedamagemult.json',
        },
        {
          editorId: 'CT_LuckVATSCriticalCharge',
          outSubdir: 'player/vats',
          filename: 'luckvatscriticalcharge.json',
        },
      ]);
    });

    it('fetches each singleton by editor_id (not search+tier) and writes it alongside the group files', async () => {
      // No group search hits at all — the singletons don't depend on any
      // CURVE_TABLE_GROUPS match.
      const client = makeClient([]);
      const { files, unresolved } = await extractCurveTables(client);
      expect(unresolved).toEqual([]);
      expect(files).toHaveLength(2);
      const [rangeFile, luckFile] = files;
      expect(rangeFile.relativePath).toBe(singletonRelativePath);
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
      expect(luckFile.relativePath).toBe(luckSingletonRelativePath);
      expect(luckFile.editorId).toBe('CT_LuckVATSCriticalCharge');
      expect(luckFile.formId).toBe('0x00655629');
      // Domain 1–100 matches the SPECIAL clamp exactly (docs/assumptions.md).
      expect(luckFile.content.curve).toHaveLength(22);
      expect(luckFile.content.curve[0]).toEqual({ x: 1, y: 3 });
      expect(luckFile.content.curve.at(-1)).toEqual({ x: 100, y: 45 });
    });

    it('reports unresolved when get() fails for a singleton (not a crash)', async () => {
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
      expect(unresolved).toHaveLength(2);
      expect(unresolved[0]).toContain('CT_Player_PercentOfMinToMaxRangeDMGMult');
      expect(unresolved[1]).toContain('CT_LuckVATSCriticalCharge');
    });
  });
});
