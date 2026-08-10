import { describe, it, expect } from 'bun:test';
import type { EsmRecord } from '../esm-client';
import { createInMemoryEsmSource } from '../esm-source-fake';
import {
  asNumber,
  parseCurve,
  projectileExplosionFormId,
  explosionIsChain,
  decodeExplosionDamage,
  explosionComponents,
  type DecodedExplosionDamage,
} from '../normalize/explosion';

// Pins `normalize/explosion.ts` decoding in isolation — synthetic minimal
// PROJ/EXPL stubs, not full weapon fixtures (those live in extract-*.test.ts).

describe('asNumber', () => {
  it('returns finite numbers unchanged', () => {
    expect(asNumber(42)).toBe(42);
    expect(asNumber(0)).toBe(0);
    expect(asNumber(-3.5)).toBe(-3.5);
  });

  it('returns the fallback for non-numeric values (strings are not coerced)', () => {
    expect(asNumber('42')).toBe(0);
    expect(asNumber('42', 7)).toBe(7);
    expect(asNumber(undefined, 1)).toBe(1);
    expect(asNumber(null)).toBe(0);
    expect(asNumber(NaN)).toBe(0);
    expect(asNumber(Infinity)).toBe(0);
  });
});

describe('parseCurve', () => {
  it('extracts tier from curve_path and returns populated curve points', () => {
    const result = parseCurve({
      curve_path: 'Creatures\\Health\\Damage_Universal_Tier5.json',
      curve: [
        { x: 1, y: 10 },
        { x: 50, y: 200 },
      ],
    });
    expect(result).toEqual({
      tier: 5,
      curve: [
        { x: 1, y: 10 },
        { x: 50, y: 200 },
      ],
    });
  });

  it('returns null tier and null curve when the node is missing or empty', () => {
    expect(parseCurve(null)).toEqual({ tier: null, curve: null });
    expect(parseCurve(undefined)).toEqual({ tier: null, curve: null });
    expect(parseCurve({})).toEqual({ tier: null, curve: null });
    expect(parseCurve({ curve: [] })).toEqual({ tier: null, curve: null });
  });

  it('returns tier null when curve_path has no Tier suffix but keeps a non-empty curve', () => {
    const result = parseCurve({
      curve_path: 'Player\\Range\\PercentOfMinToMaxRangeDMGMult',
      curve: [{ x: 1, y: 1 }],
    });
    expect(result.tier).toBeNull();
    expect(result.curve).toEqual([{ x: 1, y: 1 }]);
  });
});

describe('projectileExplosionFormId', () => {
  const EXPL_ID = '0x00EX0001';
  const PROJ_EXPLODING = '0x00PR0001';
  const PROJ_NO_FLAG = '0x00PR0002';
  const PROJ_ZERO_SENTINEL = '0x00PR0003';

  const client = createInMemoryEsmSource({
    records: {
      [PROJ_EXPLODING]: {
        header: { signature: 'PROJ', form_id: PROJ_EXPLODING },
        editor_id: 'proj_with_explosion',
        fields: {
          Data: {
            Flags: { flags: ['Explosion'] },
            Explosion: EXPL_ID,
          },
        },
      } as unknown as EsmRecord,
      [PROJ_NO_FLAG]: {
        header: { signature: 'PROJ', form_id: PROJ_NO_FLAG },
        editor_id: 'proj_without_flag',
        fields: {
          Data: {
            Flags: { flags: [] },
            Explosion: EXPL_ID,
          },
        },
      } as unknown as EsmRecord,
      [PROJ_ZERO_SENTINEL]: {
        header: { signature: 'PROJ', form_id: PROJ_ZERO_SENTINEL },
        editor_id: 'proj_zero_sentinel',
        fields: {
          Data: {
            Flags: { flags: ['Explosion'] },
            Explosion: '0x00000000',
          },
        },
      } as unknown as EsmRecord,
    },
  });

  it('returns the Explosion formid when the PROJ carries the Explosion flag and a real target', async () => {
    expect(await projectileExplosionFormId(client, PROJ_EXPLODING)).toBe(EXPL_ID);
  });

  it('returns null when the Explosion flag is absent (stale formid ignored)', async () => {
    expect(await projectileExplosionFormId(client, PROJ_NO_FLAG)).toBeNull();
  });

  it('returns null when Explosion is the explicit zero sentinel', async () => {
    expect(await projectileExplosionFormId(client, PROJ_ZERO_SENTINEL)).toBeNull();
  });
});

describe('explosionIsChain', () => {
  it('is true when Data.Flags1.flags includes Chain', () => {
    const expl = {
      header: { signature: 'EXPL', form_id: '0x00EX0001' },
      editor_id: 'expl_chain',
      fields: {
        Data: { Flags1: { flags: ['Chain', 'Other'] } },
      },
    } as unknown as EsmRecord;
    expect(explosionIsChain(expl)).toBe(true);
  });

  it('is false when Chain is absent', () => {
    const expl = {
      header: { signature: 'EXPL', form_id: '0x00EX0002' },
      editor_id: 'expl_normal',
      fields: { Data: { Flags1: { flags: [] } } },
    } as unknown as EsmRecord;
    expect(explosionIsChain(expl)).toBe(false);
  });
});

describe('decodeExplosionDamage', () => {
  const DT_FIRE = '0x00DT0001';

  const client = createInMemoryEsmSource({
    records: {},
    resolveEdidMap: { [DT_FIRE]: 'dtFire' },
  });

  it('decodes main physical curve + flat Damage', async () => {
    const expl = {
      header: { signature: 'EXPL', form_id: '0x00EX0101' },
      editor_id: 'expl_main',
      fields: {
        Data: {
          'Damage Curve Table': {
            curve_path: 'Damage_Universal_Tier3.json',
            curve: [{ x: 1, y: 100 }],
          },
          Damage: 50,
          'Base Weapon Damage Mult': 0.15,
        },
      },
    } as unknown as EsmRecord;
    const unresolved: string[] = [];
    const decoded = await decodeExplosionDamage(client, expl, unresolved);
    expect(decoded).toEqual({
      main: { tier: 3, curve: [{ x: 1, y: 100 }], amount: 50 },
      typed: [],
      baseWeaponDamageMult: 0.15,
    });
    expect(unresolved).toEqual([]);
  });

  it('decodes typed Damage Types entries with per-type curves', async () => {
    const expl = {
      header: { signature: 'EXPL', form_id: '0x00EX0102' },
      editor_id: 'expl_typed',
      fields: {
        Data: {},
        'Damage Types': [
          {
            Type: DT_FIRE,
            Amount: 25,
            'Curve Table': {
              curve_path: 'Damage_Universal_Tier2.json',
              curve: [{ x: 1, y: 50 }],
            },
          },
        ],
      },
    } as unknown as EsmRecord;
    const unresolved: string[] = [];
    const decoded = await decodeExplosionDamage(client, expl, unresolved);
    expect(decoded.main).toBeNull();
    expect(decoded.typed).toEqual([
      {
        damageType: 'fire',
        damageTypeEdid: 'dtFire',
        amount: 25,
        tier: 2,
        curve: [{ x: 1, y: 50 }],
      },
    ]);
    expect(decoded.baseWeaponDamageMult).toBe(0);
    expect(unresolved).toEqual([]);
  });

  it('returns empty main and typed when no curve, no positive flat Damage, and no typed entries', async () => {
    const expl = {
      header: { signature: 'EXPL', form_id: '0x00EX0103' },
      editor_id: 'expl_empty',
      fields: { Data: { Damage: 0 } },
    } as unknown as EsmRecord;
    const unresolved: string[] = [];
    const decoded = await decodeExplosionDamage(client, expl, unresolved);
    expect(decoded).toEqual({ main: null, typed: [], baseWeaponDamageMult: 0 });
    expect(unresolved).toEqual([]);
  });
});

describe('explosionComponents', () => {
  it('emits a single explosive component from main-only decoded damage', () => {
    const decoded: DecodedExplosionDamage = {
      main: { tier: 4, curve: [{ x: 1, y: 80 }], amount: 10 },
      typed: [],
      baseWeaponDamageMult: 0,
    };
    expect(explosionComponents(decoded)).toEqual([
      {
        damageType: 'explosive',
        damageTypeEdid: null,
        amount: 10,
        tier: 4,
        curve: [{ x: 1, y: 80 }],
        fromExplosion: true,
      },
    ]);
  });

  it('emits typed elemental components without a main block', () => {
    const decoded: DecodedExplosionDamage = {
      main: null,
      typed: [
        {
          damageType: 'cryo',
          damageTypeEdid: 'dtCryo',
          amount: 30,
          tier: 1,
          curve: [{ x: 1, y: 40 }],
        },
      ],
      baseWeaponDamageMult: 0,
    };
    expect(explosionComponents(decoded)).toEqual([
      {
        damageType: 'cryo',
        damageTypeEdid: 'dtCryo',
        amount: 30,
        tier: 1,
        curve: [{ x: 1, y: 40 }],
        fromExplosion: true,
      },
    ]);
  });

  it('emits main explosive plus each typed entry when both are present', () => {
    const decoded: DecodedExplosionDamage = {
      main: { tier: 2, curve: [{ x: 1, y: 60 }], amount: 5 },
      typed: [
        {
          damageType: 'radiation',
          damageTypeEdid: 'dtRadiation',
          amount: 15,
          tier: null,
          curve: null,
        },
      ],
      baseWeaponDamageMult: 0.2,
    };
    expect(explosionComponents(decoded)).toEqual([
      {
        damageType: 'explosive',
        damageTypeEdid: null,
        amount: 5,
        tier: 2,
        curve: [{ x: 1, y: 60 }],
        fromExplosion: true,
      },
      {
        damageType: 'radiation',
        damageTypeEdid: 'dtRadiation',
        amount: 15,
        tier: null,
        curve: null,
        fromExplosion: true,
      },
    ]);
  });
});
