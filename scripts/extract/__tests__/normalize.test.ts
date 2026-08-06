import { describe, it, expect } from 'bun:test';
import {
  translate,
  translateEnchantment,
  translateGrantedPerk,
  parseMagicEffects,
  getMgefInfo,
  ENTRY_POINT_BUCKETS,
  resolveStimpakHealEntryPoint,
  SHARED_ONSLAUGHT_COUNTER_AV,
  type MgefInfo,
  type SpellEffect,
  type AvifRoute,
} from '../normalize/mgef';
import {
  flattenPerkConditionRows,
  translateConditions,
  type RawCondition,
} from '../normalize/conditions';
import type { EsmClient, EsmListRow, EsmRecord } from '../esm-client';
import { extractPerks } from '../extract-perks';
import fortifyStrengthChemEffect from './fixtures/mgef-fortifystrengthchemeffect.json';

// Pins the PURE (sync) MGEF → IR translation with plain fixtures — no esm CLI
// client, no shell-out. The async gather lives in translateMagicEffect.

function mgef(overrides: Partial<MgefInfo> = {}): MgefInfo {
  return {
    edid: 'TestMgef',
    name: 'Test',
    archetype: 'Value Modifier',
    actorValue: '0xAV',
    resistValue: null,
    perkToApply: null,
    keywords: [],
    dispelWithKeywords: false,
    detrimental: false,
    ...overrides,
  };
}

function effect(overrides: Partial<SpellEffect> = {}): SpellEffect {
  return {
    mgefFormId: '0xM',
    magnitude: 0,
    duration: 0,
    conditionRows: [],
    curvePoints: null,
    curveInputAv: null,
    magnitudeGlobal: null,
    ...overrides,
  };
}

const noRoutes = new Map<string, AvifRoute[]>();
// AV resolves to a fallback route (STAT_SneakAttackBonus → sneakBonus, ×0.01).
const edids = new Map<string, string>([['0xAV', 'STAT_SneakAttackBonus']]);

describe('translate (pure MGEF → IR)', () => {
  it('emits a plain value modifier via a fallback route: value = magnitude × scale', () => {
    const r = translate(mgef(), effect({ magnitude: 50 }), noRoutes, edids);
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0]).toEqual({ bucket: 'sneakBonus', op: 'ADD', value: 0.5, conditions: [] });
    expect('curve' in r.modifiers[0]).toBe(false);
  });

  it('emits a curve modifier carrying curveScale (not value) when the effect has a curve', () => {
    const curved = effect({
      curvePoints: [
        { x: 0.05, y: 130 },
        { x: 1.0, y: 0 },
      ],
      curveInputAv: '0x00000392',
    });
    const r = translate(mgef(), curved, noRoutes, edids);
    expect(r.modifiers).toHaveLength(1);
    const m = r.modifiers[0];
    expect(m.curve?.input).toBe('healthFraction');
    // The scale becomes curveScale; there is no `value` on the curve variant.
    expect(m.curve ? m.curveScale : null).toBeCloseTo(0.01, 10);
    expect('value' in m).toBe(false);
  });

  it('skips non-value archetypes and reports an override note', () => {
    const r = translate(mgef({ archetype: 'Script' }), effect({ magnitude: 5 }), noRoutes, edids);
    expect(r.modifiers).toHaveLength(0);
    expect(r.notes.some((n) => n.includes('needs override'))).toBe(true);
  });

  it("carries curve.input 'healthCurrent' for a Peak Value Modifier effect on a routed AV (Juggernaut's-style)", () => {
    const routedAv = new Map<string, AvifRoute[]>([
      ['0xAV', [{ bucket: 'dbm', scale: 0.01, rawConditions: [] }]],
    ]);
    const curved = effect({
      curvePoints: [
        { x: 0, y: 0 },
        { x: 1000, y: 100 },
      ],
      curveInputAv: '0x000002D4',
    });
    const r = translate(mgef({ archetype: 'Peak Value Modifier' }), curved, routedAv, edids);
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0].curve?.input).toBe('healthCurrent');
  });

  it("carries curve.input 'intelligence' for a Peak Value Modifier effect on STAT_DmgMultEnergy (Science!-style)", () => {
    const scienceEdids = new Map<string, string>([['0xAV', 'STAT_DmgMultEnergy']]);
    const curved = effect({
      curvePoints: [
        { x: 0, y: 0 },
        { x: 15, y: 0.3 },
      ],
      curveInputAv: '0x000002C6',
    });
    const r = translate(mgef({ archetype: 'Peak Value Modifier' }), curved, noRoutes, scienceEdids);
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0].bucket).toBe('dbm');
    expect(r.modifiers[0].conditions).toEqual([{ kind: 'damageTypeScope', types: ['energy'] }]);
    expect(r.modifiers[0].curve?.input).toBe('intelligence');
  });
});

describe('translate (2026-07-10 review routes)', () => {
  it('routes SPECIAL AVs at scale 1 (legendary +STR stars, chem SPECIAL buffs)', () => {
    const strEdids = new Map<string, string>([['0xAV', 'Strength']]);
    const r = translate(mgef(), effect({ magnitude: 3 }), noRoutes, strEdids);
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0]).toEqual({
      bucket: 'specialStrength',
      op: 'ADD',
      value: 3,
      conditions: [],
    });
  });

  it("routes STAT_DmgPerCrippled to dbm with a perCrippledLimb condition (Bully's)", () => {
    const bullyEdids = new Map<string, string>([['0xAV', 'STAT_DmgPerCrippled']]);
    const r = translate(mgef(), effect({ magnitude: 20 }), noRoutes, bullyEdids);
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0].bucket).toBe('dbm');
    expect(r.modifiers[0].conditions).toEqual([{ kind: 'perCrippledLimb', max: 6 }]);
  });
});

describe('translate (2026-07-11 A3/A4 routes)', () => {
  it("routes STAT_DmgVsClose to dbm with a targetDistance 'close' condition (Guerrilla)", () => {
    const closeEdids = new Map<string, string>([['0xAV', 'STAT_DmgVsClose']]);
    const r = translate(mgef(), effect({ magnitude: 10 }), noRoutes, closeEdids);
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0]).toEqual({
      bucket: 'dbm',
      op: 'ADD',
      value: 0.1,
      conditions: [{ kind: 'targetDistance', range: 'close' }],
    });
  });

  it("routes STAT_DmgVsFar to dbm with a targetDistance 'far' condition (Down Ranger, Sniper's)", () => {
    const farEdids = new Map<string, string>([['0xAV', 'STAT_DmgVsFar']]);
    const r = translate(mgef(), effect({ magnitude: 100 }), noRoutes, farEdids);
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0]).toEqual({
      bucket: 'dbm',
      op: 'ADD',
      value: 1.0,
      conditions: [{ kind: 'targetDistance', range: 'far' }],
    });
  });

  it("parseMagicEffects captures a GLOB-referenced top-level Magnitude as magnitudeGlobal (Sniper's: Effect Item Data reads 0, the real +100 lives on GLOB BOUNTY_SnipersBonus)", () => {
    const record = {
      header: { signature: 'ENCH', form_id: '0xE' },
      editor_id: 'BOUNTY_ench_LegendaryWeapon_Snipers',
      fields: {
        Effects: [
          {
            Effect: {
              'Base Effect': '0x00800569',
              'Effect Item Data': { 'Effect ID': 0, Magnitude: 0.0, Area: 0, Duration: 0 },
              Magnitude: '0x0084DB25',
            },
          },
        ],
      },
    } as unknown as EsmRecord;
    const [parsed] = parseMagicEffects(record);
    expect(parsed.magnitude).toBe(0);
    expect(parsed.magnitudeGlobal).toBe('0x0084DB25');
    // The async gather (translateMagicEffect) resolves this GLOB and
    // substitutes its Value for the flat magnitude before calling translate();
    // verified end-to-end via the re-extracted Sniper's omod (dbm modifier,
    // value 1.0, targetDistance 'far').
  });

  it('parseMagicEffects leaves magnitudeGlobal null for a plain flat-magnitude effect', () => {
    const record = {
      header: { signature: 'ENCH', form_id: '0xE' },
      editor_id: 'ench_LegendaryWeapon_Pyromaniac',
      fields: {
        Effects: [
          {
            Effect: {
              'Base Effect': '0x007954D1',
              'Effect Item Data': { 'Effect ID': 0, Magnitude: 50.0, Area: 0, Duration: 0 },
            },
          },
        ],
      },
    } as unknown as EsmRecord;
    const [parsed] = parseMagicEffects(record);
    expect(parsed.magnitude).toBe(50);
    expect(parsed.magnitudeGlobal).toBeNull();
  });

  it("carries curve.input 'weaponCondition' for Polished via the 0x0000039F engine-AV mapping (20260717 wired a real input AV; the old edid-keyed null-input override is retired)", () => {
    const routedAv = new Map<string, AvifRoute[]>([
      ['0xAV', [{ bucket: 'dbm', scale: 0.01, rawConditions: [] }]],
    ]);
    const curved = effect({
      curvePoints: [
        { x: 1.0, y: 0 },
        { x: 2.0, y: 60 },
      ],
      curveInputAv: '0x0000039F',
    });
    const r = translate(
      mgef({ edid: 'Legendary_Weapon_PolishedPerkApplyEffect', archetype: 'Peak Value Modifier' }),
      curved,
      routedAv,
      edids,
    );
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0].curve?.input).toBe('weaponCondition');
    expect(r.modifiers[0].curve ? r.modifiers[0].curveScale : null).toBeCloseTo(0.01, 10);
  });

  it('drops a Polished-shaped effect whose input AV went back to null (no blanket edid fallback anymore)', () => {
    const routedAv = new Map<string, AvifRoute[]>([
      ['0xAV', [{ bucket: 'dbm', scale: 0.01, rawConditions: [] }]],
    ]);
    const curved = effect({
      curvePoints: [
        { x: 1.0, y: 0 },
        { x: 2.0, y: 60 },
      ],
      curveInputAv: null,
    });
    const r = translate(
      mgef({ edid: 'Legendary_Weapon_PolishedPerkApplyEffect', archetype: 'Peak Value Modifier' }),
      curved,
      routedAv,
      edids,
    );
    expect(r.modifiers).toHaveLength(0);
    expect(r.notes.some((n) => n.includes('unmapped input AV null'))).toBe(true);
  });

  it('leaves an UNMATCHED null curve input at a different edid unresolved (not a blanket rule)', () => {
    const routedAv = new Map<string, AvifRoute[]>([
      ['0xAV', [{ bucket: 'dbm', scale: 0.01, rawConditions: [] }]],
    ]);
    const curved = effect({
      curvePoints: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      curveInputAv: null,
    });
    const r = translate(
      mgef({ edid: 'SomeOtherLegendaryEffect', archetype: 'Peak Value Modifier' }),
      curved,
      routedAv,
      edids,
    );
    expect(r.modifiers).toHaveLength(0);
    expect(r.notes.some((n) => n.includes('unmapped input AV null'))).toBe(true);
  });
});

describe('translate (Onslaught, 2026-07-12)', () => {
  it("carries curve.input 'onslaughtStacks' for a Peak Value Modifier on a routed AV (Whacker Smacker-style)", () => {
    const routedAv = new Map<string, AvifRoute[]>([
      ['0xAV', [{ bucket: 'powerAttackBonus', scale: 0.01, rawConditions: [] }]],
    ]);
    const curved = effect({
      curvePoints: [
        { x: 0, y: 0 },
        { x: 1, y: 5 },
        { x: 100, y: 500 },
      ],
      curveInputAv: '0x00000395',
    });
    const r = translate(mgef({ archetype: 'Peak Value Modifier' }), curved, routedAv, edids);
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0].bucket).toBe('powerAttackBonus');
    expect(r.modifiers[0].curve?.input).toBe('onslaughtStacks');
    expect(r.modifiers[0].curve ? r.modifiers[0].curveScale : null).toBeCloseTo(0.01, 10);
  });
});

describe('translate (Lockpick Skill / Pirate Punch, 2026-08-04)', () => {
  it("carries curve.input 'lockpickSkill' for a curve keyed off STAT_LockpickingTier (0x0032CB37, Pirate Punch's unique-mod curve)", () => {
    const routedAv = new Map<string, AvifRoute[]>([
      ['0xAV', [{ bucket: 'dbm', scale: 0.01, rawConditions: [] }]],
    ]);
    const curved = effect({
      curvePoints: [
        { x: 0, y: 0 },
        { x: 1, y: 5 },
        { x: 20, y: 100 },
      ],
      curveInputAv: '0x0032CB37',
    });
    const r = translate(mgef({ archetype: 'Peak Value Modifier' }), curved, routedAv, edids);
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0].bucket).toBe('dbm');
    expect(r.modifiers[0].curve?.input).toBe('lockpickSkill');
    expect(r.modifiers[0].curve ? r.modifiers[0].curveScale : null).toBeCloseTo(0.01, 10);
  });

  it("routes a flat Peak Value Modifier on STAT_LockpickingTier to the lockpickSkill bucket via the FALLBACK_AVIF_ROUTES fallback (Picklock/Master Infiltrator/Safecracker's-style grant, scale 1 not 0.01 — integer skill points)", () => {
    const lockpickEdids = new Map<string, string>([['0xAV', 'STAT_LockpickingTier']]);
    const r = translate(
      mgef({ archetype: 'Peak Value Modifier' }),
      effect({ magnitude: 1 }),
      noRoutes,
      lockpickEdids,
    );
    expect(r.modifiers).toEqual([{ bucket: 'lockpickSkill', op: 'ADD', value: 1, conditions: [] }]);
  });
});

describe('translate (Medical Malpractice / hacking skill / Stimpak healing, 2026-08-05)', () => {
  it("routes Medical Malpractice's Add Actor Value Mult on Mod Weapon DMG Bonus Mult to dbm ADD with scaledBy stimpakHealMult", async () => {
    const perkFormId = '0x0050D7FD';
    const perk = {
      editor_id: 'MedicalMalpractice_Perk',
      fields: {
        Effects: [
          {
            Effect: {
              'Effect Header': { 'Effect Type': { name: 'Entry Point' } },
              'Entry Point': {
                'Entry Point': { name: 'Mod Weapon DMG Bonus Mult' },
                Function: { name: 'Add Actor Value Mult' },
              },
              Float: 0.01,
              'Function Parameter 3 (Actor Value)': '0x00206F31',
            },
          },
        ],
      },
    };
    const client = {
      async get(formId: string): Promise<EsmRecord> {
        if (formId === perkFormId) return perk as unknown as EsmRecord;
        throw new Error(`unexpected get(${formId})`);
      },
      resolveEdid: async (formId: string) => formId,
    } as unknown as EsmClient;
    const result = await translateGrantedPerk(
      { client, routes: new Map(), edidByFormId: new Map() },
      'mod_Custom_MedicalMalpractice',
      perkFormId,
    );
    expect(result.modifiers).toEqual([
      {
        bucket: 'dbm',
        op: 'ADD',
        value: 0.01,
        scaledBy: 'stimpakHealMult',
        conditions: [],
      },
    ]);
  });

  it('routes a flat Peak Value Modifier on STAT_HackingTier to the hackingSkill bucket via FALLBACK_AVIF_ROUTES (scale 1 — integer skill points)', () => {
    const hackingEdids = new Map<string, string>([['0xAV', 'STAT_HackingTier']]);
    const r = translate(
      mgef({ archetype: 'Peak Value Modifier' }),
      effect({ magnitude: 1 }),
      noRoutes,
      hackingEdids,
    );
    expect(r.modifiers).toEqual([{ bucket: 'hackingSkill', op: 'ADD', value: 1, conditions: [] }]);
  });

  it('routes a flat Peak Value Modifier on STAT_HealMultStimpak to the stimpakHealMult bucket via FALLBACK_AVIF_ROUTES (scale 1 — percent points)', () => {
    const stimpakEdids = new Map<string, string>([['0xAV', 'STAT_HealMultStimpak']]);
    const r = translate(
      mgef({ archetype: 'Peak Value Modifier' }),
      effect({ magnitude: 30 }),
      noRoutes,
      stimpakEdids,
    );
    expect(r.modifiers).toEqual([
      { bucket: 'stimpakHealMult', op: 'ADD', value: 30, conditions: [] },
    ]);
  });
});

describe('CURVE_INPUT_AVS plumbing-perk isolation (2026-08-05)', () => {
  // Hardcoded from `esm get` over STAT_DamagePerk, STAT_CritDamagePerk,
  // STAT_DamageVsPerk, STAT_BeneficialPerk, PlayerPerk — every "Add Actor
  // Value Mult" Function Parameter 3 (Actor Value) on those plumbing perks.
  const PLUMBING_PERK_ACTOR_VALUE_MULT_AVS = [
    '0x00019D38',
    '0x0001BC1B',
    '0x00058D36',
    '0x0008D1BF',
    '0x001477A8',
    '0x0018330E',
    '0x0018912C',
    '0x0018ACC8',
    '0x0018EEE1',
    '0x0018EEEB',
    '0x0018EEEC',
    '0x0018EEED',
    '0x0018EEEE',
    '0x0018EEEF',
    '0x0018EEF1',
    '0x0018EEF2',
    '0x002202CE',
    '0x002202CF',
    '0x00239F99',
    '0x0023A007',
    '0x0023A067',
    '0x0023A068',
    '0x0023A0EA',
    '0x002C99DD',
    '0x002C99E0',
    '0x002C99E1',
    '0x002C9A37',
    '0x002C9A38',
    '0x002DBFCA',
    '0x00312D66',
    '0x003440A1',
    '0x003440A6',
    '0x0035206E',
    '0x003789AC',
    '0x00393F5F',
    '0x004F5775',
    '0x0052CFB0',
    '0x00563B89',
    '0x00645D86',
    '0x00647223',
    '0x00674C84',
    '0x00674C85',
    '0x00690C78',
    '0x006E1052',
    '0x007ACB02',
    '0x007ACE76',
    '0x00900A59',
  ] as const;

  it('has zero overlap with CURVE_INPUT_AVS keys (ungated scaledBy branch safety)', async () => {
    const { CURVE_INPUT_AVS } = await import('../normalize/mgef');
    const curveKeys = new Set(Object.keys(CURVE_INPUT_AVS));
    const overlap = PLUMBING_PERK_ACTOR_VALUE_MULT_AVS.filter((av) => curveKeys.has(av));
    expect(overlap).toEqual([]);
  });
});

describe('translate (Bullet Storm, 2026-07-16)', () => {
  it("routes a Peak Value Modifier on AmmoSpenderMaxStacks to bulletStormMaxStacks (Heavy Gunner's abAmmoSpenderFortifyStacks-style flat magnitude)", () => {
    const bulletStormEdids = new Map<string, string>([['0xAV', 'AmmoSpenderMaxStacks']]);
    const r = translate(
      mgef({ archetype: 'Peak Value Modifier' }),
      effect({ magnitude: 10 }),
      noRoutes,
      bulletStormEdids,
    );
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0]).toEqual({
      bucket: 'bulletStormMaxStacks',
      op: 'ADD',
      value: 10,
      conditions: [],
    });
  });
});

describe('getMgefInfo (consumables overhaul, 2026-07-13)', () => {
  // Fixture is verbatim `esm get FortifyStrengthChemEffect --json` output
  // (20260710 ESM), formid 0x002466E6 — the "Chem: Fortify Strength" MGEF
  // Buffout's Effects list applies. Proof point from the plan: this MGEF
  // carries the "Dispel with Keywords" flag plus 3 keywords (ChemEffect,
  // StackBuffStrength, ChemDispelEffects) — StackBuffStrength is the
  // discriminating keyword that keeps chem STR buffs from colliding with
  // food STR buffs (which key off FoodDispelEffect_Strength instead).
  const stubClient = {
    async get(formId: string): Promise<EsmRecord> {
      if (formId === '0x002466E6') return fortifyStrengthChemEffect as unknown as EsmRecord;
      throw new Error(`unexpected get(${formId})`);
    },
  } as unknown as EsmClient;

  it('parses keywords and dispelWithKeywords from the raw record shape', async () => {
    const info = await getMgefInfo(stubClient, '0x002466E6');
    expect(info.edid).toBe('FortifyStrengthChemEffect');
    expect(info.archetype).toBe('Peak Value Modifier');
    expect(info.keywords).toEqual(['0x0004D897', '0x00246704', '0x0037E0BB']);
    expect(info.dispelWithKeywords).toBe(true);
  });

  it('defaults keywords to [] and dispelWithKeywords to false when absent', async () => {
    const bareClient = {
      async get(): Promise<EsmRecord> {
        return {
          header: { signature: 'MGEF', form_id: '0xBARE' },
          editor_id: 'BareMgef',
          fields: {
            'Magic Effect Data': {
              Data: { Archetype: { name: 'Value Modifier' }, Flags: { value: '0x0', flags: [] } },
            },
          },
        } as unknown as EsmRecord;
      },
    } as unknown as EsmClient;
    const info = await getMgefInfo(bareClient, '0xBARE');
    expect(info.keywords).toEqual([]);
    expect(info.dispelWithKeywords).toBe(false);
  });
});

describe('translateConditions (2026-07-10 review)', () => {
  const kw = (formId: string, andOr?: string): RawCondition => ({
    Function: 'HasKeyword',
    'Parameter 1': formId,
    'Comparison Value': 1,
    Operator: 'Equal To',
    ...(andOr ? { 'AND/OR': andOr } : {}),
  });

  it("translates an enemy-type OR-group to enemyTypeAny (Ghoul Slayer's route conditions)", () => {
    const edidMap = new Map([
      ['0xFERAL', 'ActorTypeFeralGhoul'],
      ['0xGHOUL', 'ActorTypeGhoul'],
    ]);
    const { conditions } = translateConditions([kw('0xFERAL', 'OR'), kw('0xGHOUL')], {
      edidByFormId: edidMap,
    });
    expect(conditions).toEqual([
      { kind: 'enemyTypeAny', keywordsOrRaces: ['ActorTypeFeralGhoul', 'ActorTypeGhoul'] },
    ]);
  });

  it('consumes GetIsPlayer()=1 (granted-perk self-gate) instead of leaving it unresolved', () => {
    const row: RawCondition = {
      Function: 'GetIsPlayer',
      'Comparison Value': 1,
      Operator: 'Equal To',
    };
    const { conditions, unresolved } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([]);
    expect(unresolved).toEqual([]);
  });

  it("resolves a GLOB-valued target GetHealthPercentage to enemyHealthBelowPct (Executioner's ≤ LGND_ExecuteHealthThreshold)", () => {
    const row: RawCondition = {
      Function: 'GetHealthPercentage',
      'Comparison Value': '0xGLOB',
      Operator: 'Less Than Or Equal To',
      'Run On': 'Target',
    };
    const { conditions } = translateConditions([row], {
      edidByFormId: new Map(),
      globalValues: new Map([['0xGLOB', 0.4]]),
    });
    expect(conditions).toEqual([{ kind: 'enemyHealthBelowPct', pct: 40 }]);
  });

  it('translates target GetHealthPercentage ≥ to enemyHealthAbovePct (Instigating ≥60%)', () => {
    const row: RawCondition = {
      Function: 'GetHealthPercentage',
      'Comparison Value': 0.6,
      Operator: 'Greater Than Or Equal To',
      'Run On': 'Target',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'enemyHealthAbovePct', pct: 60 }]);
  });

  it("translates player GetHealthPercentage ≤ to healthBelowPct with no inclusive flag (Foundation's Vengeance ≤0.25)", () => {
    const row: RawCondition = {
      Function: 'GetHealthPercentage',
      'Comparison Value': 0.25,
      Operator: 'Less Than Or Equal To',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'healthBelowPct', pct: 25 }]);
  });

  it('translates player GetHealthPercentage strict < to healthBelowPct with inclusive: false', () => {
    const row: RawCondition = {
      Function: 'GetHealthPercentage',
      'Comparison Value': 0.25,
      Operator: 'Less Than',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'healthBelowPct', pct: 25, inclusive: false }]);
  });

  it('translates target GetHealthPercentage strict < to enemyHealthBelowPct with inclusive: false', () => {
    const row: RawCondition = {
      Function: 'GetHealthPercentage',
      'Comparison Value': 0.4,
      Operator: 'Less Than',
      'Run On': 'Target',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'enemyHealthBelowPct', pct: 40, inclusive: false }]);
  });

  it('translates target GetHealthPercentage strict > to enemyHealthAbovePct with inclusive: false', () => {
    const row: RawCondition = {
      Function: 'GetHealthPercentage',
      'Comparison Value': 0.6,
      Operator: 'Greater Than',
      'Run On': 'Target',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'enemyHealthAbovePct', pct: 60, inclusive: false }]);
  });

  it('translates GetValuePercent(Health) strict < to healthBelowPct with inclusive: false (Emergency Protocols)', () => {
    const row: RawCondition = {
      Function: 'GetValuePercent',
      'Parameter 1': '0x000002D4',
      'Comparison Value': 0.2,
      Operator: 'Less Than',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'healthBelowPct', pct: 20, inclusive: false }]);
  });

  it('translates GetValuePercent(Health) ≤ to healthBelowPct with no inclusive flag', () => {
    const row: RawCondition = {
      Function: 'GetValuePercent',
      'Parameter 1': '0x000002D4',
      'Comparison Value': 0.25,
      Operator: 'Less Than Or Equal To',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'healthBelowPct', pct: 25 }]);
  });

  it('translates GetValuePercent with non-Health param to unresolved (operator preserved)', () => {
    const row: RawCondition = {
      Function: 'GetValuePercent',
      'Parameter 1': '0x000002EA',
      'Comparison Value': 0,
      Operator: 'Equal To',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([
      expect.objectContaining({
        kind: 'unresolved',
        raw: expect.stringMatching(/GetValuePercent.*Equal To/),
      }),
    ]);
  });
});

describe('translateConditions (WornHasKeyword unique self-gate allowlist — Bullet Storm, 2026-07-16)', () => {
  it("translates WornHasKeyword(CustomItemName_FoundationsVengeance) to a weaponKeyword condition instead of unresolved (Foundation's Vengeance +5 max-stack tier)", () => {
    const row: RawCondition = {
      Function: 'WornHasKeyword',
      'Parameter 1': '0xFV',
      'Comparison Value': 1,
      Operator: 'Equal To',
      'Run On': 'Subject',
    };
    const edidMap = new Map([['0xFV', 'CustomItemName_FoundationsVengeance']]);
    const { conditions, unresolved } = translateConditions([row], { edidByFormId: edidMap });
    expect(conditions).toEqual([
      { kind: 'weaponKeyword', keyword: 'CustomItemName_FoundationsVengeance', present: true },
    ]);
    expect(unresolved).toEqual([]);
  });

  it("translates WornHasKeyword(RD01_CustomItemName_Valkyrie) to a weaponKeyword condition (Valkyrie's spin-up curve gate)", () => {
    const row: RawCondition = {
      Function: 'WornHasKeyword',
      'Parameter 1': '0xVLK',
      'Comparison Value': 1,
      Operator: 'Equal To',
      'Run On': 'Subject',
    };
    const edidMap = new Map([['0xVLK', 'RD01_CustomItemName_Valkyrie']]);
    const { conditions } = translateConditions([row], { edidByFormId: edidMap });
    expect(conditions).toEqual([
      { kind: 'weaponKeyword', keyword: 'RD01_CustomItemName_Valkyrie', present: true },
    ]);
  });

  it('leaves an off-allowlist CustomItemName_* keyword (dn_TheActionHero) unresolved — deliberately not added, its gated effect is data-broken either way', () => {
    const row: RawCondition = {
      Function: 'WornHasKeyword',
      'Parameter 1': '0xTAH',
      'Comparison Value': 1,
      Operator: 'Equal To',
      'Run On': 'Subject',
    };
    const edidMap = new Map([['0xTAH', 'dn_TheActionHero']]);
    const { conditions, unresolved } = translateConditions([row], { edidByFormId: edidMap });
    expect(conditions).toEqual([{ kind: 'unresolved', raw: 'WornHasKeyword(dn_TheActionHero)=1' }]);
    expect(unresolved).toEqual(['WornHasKeyword(dn_TheActionHero)=1']);
  });
});

describe('translateConditions (subjectIsTarget — Contact-delivery GetIsPlayer inversion, 2026-07-14)', () => {
  it('consumes GetIsPlayer()=0 (the NPC branch) instead of marking it inactive, when subjectIsTarget is set', () => {
    const row: RawCondition = {
      Function: 'GetIsPlayer',
      'Comparison Value': 0,
      Operator: 'Equal To',
      'Run On': 'Subject',
    };
    const { conditions, unresolved } = translateConditions([row], {
      edidByFormId: new Map(),
      subjectIsTarget: true,
    });
    expect(conditions).toEqual([]);
    expect(unresolved).toEqual([]);
  });

  it('marks GetIsPlayer()=1 (the PVP-only branch) inactive when subjectIsTarget is set', () => {
    const row: RawCondition = {
      Function: 'GetIsPlayer',
      'Comparison Value': 1,
      Operator: 'Equal To',
      'Run On': 'Subject',
    };
    const { conditions } = translateConditions([row], {
      edidByFormId: new Map(),
      subjectIsTarget: true,
    });
    expect(conditions).toBeNull();
  });

  it('leaves the default (granted-to-player) GetIsPlayer reading unchanged when subjectIsTarget is unset', () => {
    const grantedRow: RawCondition = {
      Function: 'GetIsPlayer',
      'Comparison Value': 1,
      Operator: 'Equal To',
    };
    expect(translateConditions([grantedRow], { edidByFormId: new Map() }).conditions).toEqual([]);
    const inactiveRow: RawCondition = {
      Function: 'GetIsPlayer',
      'Comparison Value': 0,
      Operator: 'Equal To',
    };
    expect(translateConditions([inactiveRow], { edidByFormId: new Map() }).conditions).toBeNull();
  });
});

describe("translateConditions (GetIsPlayer Run On: Target — granted-PERK tab-index-2 gate, Battle-Loader's 2026-07-18)", () => {
  // flattenPerkConditionRows (normalize/conditions.ts) forces tab-index-2 rows'
  // Run On to 'Target' regardless of the raw ESM field — verified on
  // Legendary_Armor_BattleLoadersPerk 0x0079B522, whose tab 2 carries
  // "GetIsPlayer Equal To 0.0" meaning "the bashed target isn't a player"
  // (always true in PvE). Without this fix the row read as the SELF-gate
  // shape (wants=false → 'inactive'), silently killing the whole effect —
  // this is the same inversion `subjectIsTarget` already applies for
  // Contact-delivery ENCH/SPEL walks, driven here by the row's own Run On
  // field instead of a walk-scoped context flag.
  it('consumes GetIsPlayer(Target)=0 (the NPC-bashed-target branch) instead of marking it inactive', () => {
    const row: RawCondition = {
      Function: 'GetIsPlayer',
      'Comparison Value': 0,
      Operator: 'Equal To',
      'Run On': 'Target',
    };
    const { conditions, unresolved } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([]);
    expect(unresolved).toEqual([]);
  });

  it('marks GetIsPlayer(Target)=1 (the PVP-only branch) inactive', () => {
    const row: RawCondition = {
      Function: 'GetIsPlayer',
      'Comparison Value': 1,
      Operator: 'Equal To',
      'Run On': 'Target',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toBeNull();
  });
});

describe('translateConditions (non-sprint combat model — IsSprinting/IsSwimming/ArmorTypePower, 2026-07-15)', () => {
  it('consumes IsSprinting()=0 (not sprinting) instead of leaving it unresolved', () => {
    const row: RawCondition = {
      Function: 'IsSprinting',
      'Comparison Value': 0,
      Operator: 'Equal To',
    };
    const { conditions, unresolved } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([]);
    expect(unresolved).toEqual([]);
  });

  it('marks IsSprinting()=1 (sprint-only) inactive', () => {
    const row: RawCondition = {
      Function: 'IsSprinting',
      'Comparison Value': 1,
      Operator: 'Equal To',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toBeNull();
  });

  it('consumes IsSwimming()=0 (not swimming) instead of leaving it unresolved', () => {
    const row: RawCondition = {
      Function: 'IsSwimming',
      'Comparison Value': 0,
      Operator: 'Equal To',
    };
    const { conditions, unresolved } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([]);
    expect(unresolved).toEqual([]);
  });

  it('marks IsSwimming()=1 (swim-only) inactive', () => {
    const row: RawCondition = {
      Function: 'IsSwimming',
      'Comparison Value': 1,
      Operator: 'Equal To',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toBeNull();
  });

  it('maps WornHasKeyword(ArmorTypePower)=1 to inPowerArmor', () => {
    const row: RawCondition = {
      Function: 'WornHasKeyword',
      'Parameter 1': '0xPA',
      'Comparison Value': 1,
      Operator: 'Equal To',
      'Run On': 'Subject',
    };
    const { conditions, unresolved } = translateConditions([row], {
      edidByFormId: new Map([['0xPA', 'ArmorTypePower']]),
    });
    expect(conditions).toEqual([{ kind: 'inPowerArmor', value: true }]);
    expect(unresolved).toEqual([]);
  });
});

describe('translateConditions (2026-07-11 condition kinds)', () => {
  it("dedupes Last Shot's GetLoadedAmmoCount()=0 + IsNextClipLastShot pair into ONE lastRound gate", () => {
    const rows: RawCondition[] = [
      {
        Function: 'GetLoadedAmmoCount',
        'Comparison Value': 0,
        Operator: 'Equal To',
        'Run On': 'Subject',
      },
      {
        Function: 'IsNextClipLastShot',
        'Comparison Value': 0,
        Operator: 'Greater Than',
        'Run On': 'Subject',
      },
    ];
    const { conditions, unresolved } = translateConditions(rows, { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'lastRound' }]);
    expect(unresolved).toEqual([]);
  });

  it("translates target GetNumActiveEffectsWithKeyword ≥1 to enemyHasActiveEffect (Pyromaniac's fire gate)", () => {
    const row: RawCondition = {
      Function: 'GetNumActiveEffectsWithKeyword',
      'Parameter 1': '0xFIRE',
      'Comparison Value': 1,
      Operator: 'Greater Than Or Equal To',
      'Run On': 'Target',
    };
    const { conditions } = translateConditions([row], {
      edidByFormId: new Map([['0xFIRE', 'DamageTypeFire']]),
    });
    expect(conditions).toEqual([{ kind: 'enemyHasActiveEffect', keyword: 'DamageTypeFire' }]);
  });

  it("translates GetGroupTargetCount == N and ≥ N to enemyGroupCount tiers (Encircler's)", () => {
    const eq: RawCondition = {
      Function: 'GetGroupTargetCount',
      'Comparison Value': 3,
      Operator: 'Equal To',
      'Run On': 'Subject',
    };
    const ge: RawCondition = {
      Function: 'GetGroupTargetCount',
      'Comparison Value': 5,
      Operator: 'Greater Than Or Equal To',
      'Run On': 'Subject',
    };
    expect(translateConditions([eq], { edidByFormId: new Map() }).conditions).toEqual([
      { kind: 'enemyGroupCount', count: 3 },
    ]);
    expect(translateConditions([ge], { edidByFormId: new Map() }).conditions).toEqual([
      { kind: 'enemyGroupCount', count: 5, orMore: true },
    ]);
  });

  it("translates WornApparelHasKeywordCount == N and ≥ N to wornPieceCount tiers (Battle-Loader's, Phase 3 armor pipeline)", () => {
    const edidByFormId = new Map([['0x00792A12', 'HasLegendary_Armor_BattleLoaders']]);
    const eq: RawCondition = {
      Function: 'WornApparelHasKeywordCount',
      'Parameter 1': '0x00792A12',
      'Comparison Value': 4,
      Operator: 'Equal To',
      'Run On': 'Subject',
    };
    const ge: RawCondition = {
      Function: 'WornApparelHasKeywordCount',
      'Parameter 1': '0x00792A12',
      'Comparison Value': 5,
      Operator: 'Greater Than Or Equal To',
      'Run On': 'Subject',
    };
    expect(translateConditions([eq], { edidByFormId }).conditions).toEqual([
      { kind: 'wornPieceCount', keyword: 'HasLegendary_Armor_BattleLoaders', count: 4 },
    ]);
    expect(translateConditions([ge], { edidByFormId }).conditions).toEqual([
      {
        kind: 'wornPieceCount',
        keyword: 'HasLegendary_Armor_BattleLoaders',
        count: 5,
        orMore: true,
      },
    ]);
  });

  it("translates GetPlayerTeammateCount == N to teammateCount and consumes the teammate GetDistance row (Fencer's)", () => {
    const rows: RawCondition[] = [
      {
        Function: 'GetPlayerTeammateCount',
        'Comparison Value': 2,
        Operator: 'Equal To',
        'Run On': 'Subject',
      },
      {
        Function: 'GetDistance',
        'Parameter 1': null,
        'Comparison Value': 2500,
        Operator: 'Less Than',
        'Run On': 'Potential Players',
      },
    ];
    const { conditions, unresolved } = translateConditions(rows, { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'teammateCount', count: 2 }]);
    expect(unresolved).toEqual([]);
  });

  it("translates GetPlayerTeammateCount >= N to teammateCount with orMore (United Ordeal's 'in a team of >=1')", () => {
    const row: RawCondition = {
      Function: 'GetPlayerTeammateCount',
      'Comparison Value': 1,
      Operator: 'Greater Than Or Equal To',
      'Run On': 'Subject',
    };
    const { conditions, unresolved } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'teammateCount', count: 1, orMore: true }]);
    expect(unresolved).toEqual([]);
  });

  it("consumes target HasPerk(ImmuneToPoison)=0 — a generic target is assumed vulnerable (Viper's)", () => {
    const row: RawCondition = {
      Function: 'HasPerk',
      'Parameter 1': '0xIMMUNE',
      'Comparison Value': 0,
      Operator: 'Equal To',
      'Run On': 'Target',
    };
    const { conditions, unresolved } = translateConditions([row], {
      edidByFormId: new Map([['0xIMMUNE', 'ImmuneToPoison']]),
    });
    expect(conditions).toEqual([]);
    expect(unresolved).toEqual([]);
  });

  it("translates GetIsPlayerGhoul to a playerIsGhoul gate (Gourmand's =0, Glowing Criticals =1)", () => {
    const human: RawCondition = {
      Function: 'GetIsPlayerGhoul',
      'Comparison Value': 0,
      Operator: 'Equal To',
    };
    const ghoul: RawCondition = {
      Function: 'GetIsPlayerGhoul',
      'Comparison Value': 1,
      Operator: 'Equal To',
    };
    expect(translateConditions([human], { edidByFormId: new Map() }).conditions).toEqual([
      { kind: 'playerIsGhoul', value: false },
    ]);
    expect(translateConditions([ghoul], { edidByFormId: new Map() }).conditions).toEqual([
      { kind: 'playerIsGhoul', value: true },
    ]);
  });

  it('leaves an off-pattern GetDistance row unresolved instead of silently consuming it', () => {
    const row: RawCondition = {
      Function: 'GetDistance',
      'Comparison Value': 500,
      Operator: 'Less Than',
      'Run On': 'Target',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([
      { kind: 'unresolved', raw: 'GetDistance Less Than 500 on Target' },
    ]);
  });
});

describe('translate (Damage-archetype DoT effects)', () => {
  it('emits a dotDamage modifier scoped to the resolved Resist Value element', () => {
    const dotEdids = new Map<string, string>([['0xResist', 'FireResist']]);
    const r = translate(
      mgef({ archetype: 'Damage', resistValue: '0xResist' }),
      effect({ magnitude: 12, duration: 5 }),
      noRoutes,
      dotEdids,
    );
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0]).toEqual({
      bucket: 'dotDamage',
      op: 'ADD',
      value: 12,
      durationSec: 5,
      conditions: [{ kind: 'damageTypeScope', types: ['fire'] }],
    });
  });

  it('still emits the dotDamage modifier (without a damageTypeScope condition) for an unmapped Resist Value, plus a note', () => {
    const dotEdids = new Map<string, string>([['0xResist', 'SomeUnmappedResist']]);
    const r = translate(
      mgef({ archetype: 'Damage', resistValue: '0xResist' }),
      effect({ magnitude: 12, duration: 5 }),
      noRoutes,
      dotEdids,
    );
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0]).toEqual({
      bucket: 'dotDamage',
      op: 'ADD',
      value: 12,
      durationSec: 5,
      conditions: [],
    });
    expect(r.notes.some((n) => n.includes('unmapped Resist Value'))).toBe(true);
  });
});

describe('translate (silent-drop guard for unrouted AVs)', () => {
  const leftAttackEdids = new Map<string, string>([['0xLAC', 'LeftAttackCondition']]);

  it('with noteUnroutedAvs: emits zero modifiers and a "no route for AV" note for a non-STAT_* unrouted AV', () => {
    const r = translate(
      mgef({ actorValue: '0xLAC' }),
      effect({ magnitude: 10 }),
      noRoutes,
      leftAttackEdids,
      { noteUnroutedAvs: true },
    );
    expect(r.modifiers).toHaveLength(0);
    expect(r.notes.some((n) => n.includes('no route for AV'))).toBe(true);
  });

  it('without noteUnroutedAvs: emits zero modifiers and NO such note (perk path unchanged)', () => {
    const r = translate(
      mgef({ actorValue: '0xLAC' }),
      effect({ magnitude: 10 }),
      noRoutes,
      leftAttackEdids,
    );
    expect(r.modifiers).toHaveLength(0);
    expect(r.notes.some((n) => n.includes('no route for AV'))).toBe(false);
  });
});

describe('translateConditions (Stage C3, killstreak GetValue tiers)', () => {
  it('consumes the redundant "kill streak ≥1" gate on curve-driven effects', () => {
    const row: RawCondition = {
      Function: 'GetValue',
      'Parameter 1': '0x00000399',
      'Comparison Value': 1,
      Operator: 'Greater Than Or Equal To',
    };
    const { conditions, unresolved } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([]);
    expect(unresolved).toEqual([]);
  });

  it("translates GetValue(killStreak) Equal To N to a killStreakCount condition (Thrill-Seeker's tiers)", () => {
    const row: RawCondition = {
      Function: 'GetValue',
      'Parameter 1': '0x00000399',
      'Comparison Value': 5,
      Operator: 'Equal To',
    };
    const { conditions, unresolved } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'killStreakCount', count: 5 }]);
    expect(unresolved).toEqual([]);
  });

  it('leaves an unrecognized comparison on the killstreak AV unresolved instead of silently consuming it', () => {
    const row: RawCondition = {
      Function: 'GetValue',
      'Parameter 1': '0x00000399',
      'Comparison Value': 3,
      Operator: 'Greater Than Or Equal To',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([
      { kind: 'unresolved', raw: 'GetValue(0x00000399) Greater Than Or Equal To 3' },
    ]);
  });
});

describe('translateConditions (GetInIronSights / HasCompletedChallenge)', () => {
  it('translates GetInIronSights Equal To 1 to aimingDownSights', () => {
    const row: RawCondition = {
      Function: 'GetInIronSights',
      'Comparison Value': 1,
      Operator: 'Equal To',
    };
    const { conditions, unresolved } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'aimingDownSights', value: true }]);
    expect(unresolved).toEqual([]);
  });

  it('translates IsPowerAttacking Equal To 0/1 to powerAttack', () => {
    const off: RawCondition = {
      Function: 'IsPowerAttacking',
      'Comparison Value': 0,
      Operator: 'Equal To',
    };
    const on: RawCondition = {
      Function: 'IsPowerAttacking',
      'Comparison Value': 1,
      Operator: 'Equal To',
    };
    expect(translateConditions([off], { edidByFormId: new Map() }).conditions).toEqual([
      { kind: 'powerAttack', value: false },
    ]);
    expect(translateConditions([on], { edidByFormId: new Map() }).conditions).toEqual([
      { kind: 'powerAttack', value: true },
    ]);
  });

  it('translates GetIsInVATS Equal To 0/1 to vatsOnly', () => {
    const off: RawCondition = {
      Function: 'GetIsInVATS',
      'Comparison Value': 0,
      Operator: 'Equal To',
    };
    const on: RawCondition = {
      Function: 'GetIsInVATS',
      'Comparison Value': 1,
      Operator: 'Equal To',
    };
    expect(translateConditions([off], { edidByFormId: new Map() }).conditions).toEqual([
      { kind: 'vatsOnly', value: false },
    ]);
    expect(translateConditions([on], { edidByFormId: new Map() }).conditions).toEqual([
      { kind: 'vatsOnly', value: true },
    ]);
  });

  it('translates HasCompletedChallenge Equal To 1 to lifetimeChallengeCompleted', () => {
    const row: RawCondition = {
      Function: 'HasCompletedChallenge',
      'Parameter 1': '0xCHAL',
      'Comparison Value': 1,
      Operator: 'Equal To',
    };
    const edidMap = new Map([
      ['0xCHAL', 'Challenge_Lifetime_CraftScrap_Weapon_Tiers_Ranged_Pistols_Pipe'],
    ]);
    const { conditions, unresolved } = translateConditions([row], { edidByFormId: edidMap });
    expect(conditions).toEqual([
      {
        kind: 'lifetimeChallengeCompleted',
        challengeId: 'Challenge_Lifetime_CraftScrap_Weapon_Tiers_Ranged_Pistols_Pipe',
      },
    ]);
    expect(unresolved).toEqual([]);
  });
});

describe('translate (AV pass-through — Barbarian/Mind Over Matter, 2026-08-03)', () => {
  // AbPerkFortifyStrength/AbPerkFortifyIntelligence shape: Peak Value
  // Modifier, magnitude 0, no curve table, effect-level Actor Value =
  // killStreak (0x00000399).
  const strengthEdids = new Map<string, string>([['0xSTR', 'Strength']]);
  const intelligenceEdids = new Map<string, string>([['0xINT', 'Intelligence']]);

  it('a zero-magnitude SPECIAL-fortify effect on the killStreak AV becomes an identity killStreak curve', () => {
    const r = translate(
      mgef({ actorValue: '0xSTR', archetype: 'Peak Value Modifier' }),
      effect({ magnitude: 0, curveInputAv: '0x00000399' }),
      noRoutes,
      strengthEdids,
    );
    expect(r.notes).toEqual([]);
    expect(r.modifiers).toEqual([
      {
        bucket: 'specialStrength',
        op: 'ADD',
        curve: {
          input: 'killStreak',
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 10, y: 10 },
          ],
        },
        curveScale: 1,
        conditions: [],
      },
    ]);
  });

  it('applies the same pass-through to Intelligence (Mind Over Matter)', () => {
    const r = translate(
      mgef({ actorValue: '0xINT', archetype: 'Peak Value Modifier' }),
      effect({ magnitude: 0, curveInputAv: '0x00000399' }),
      noRoutes,
      intelligenceEdids,
    );
    expect(r.modifiers).toEqual([
      {
        bucket: 'specialIntelligence',
        op: 'ADD',
        curve: {
          input: 'killStreak',
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 10, y: 10 },
          ],
        },
        curveScale: 1,
        conditions: [],
      },
    ]);
  });

  it('a zero-magnitude NON-SPECIAL effect on the killStreak AV keeps the "needs override" note (no blanket rule)', () => {
    // Same magnitude/curve/AV shape as Barbarian, but routed to a non-SPECIAL
    // bucket — mirrors Legendary_Armor_OvereaterAddValue (hungerThirstTier
    // AV), where an identity pass-through would be wrong.
    const hungerEdids = new Map<string, string>([['0xHUNGER', 'HungerThirstTier']]);
    const r = translate(
      mgef({ actorValue: '0xHUNGER', archetype: 'Peak Value Modifier' }),
      effect({ magnitude: 0, curveInputAv: '0x00000399' }),
      noRoutes,
      hungerEdids,
    );
    expect(r.modifiers).toHaveLength(0);
    expect(
      r.notes.some((n) => n.includes('zero magnitude, no curve — script/scaled, needs override')),
    ).toBe(true);
  });

  it('a zero-magnitude SPECIAL-fortify effect whose input AV is not in AV_PASSTHROUGH_DOMAINS keeps the note (ench_IntFromHacking)', () => {
    const r = translate(
      mgef({ actorValue: '0xINT', archetype: 'Peak Value Modifier' }),
      effect({ magnitude: 0, curveInputAv: '0x00356A14' }),
      noRoutes,
      intelligenceEdids,
    );
    expect(r.modifiers).toHaveLength(0);
    expect(
      r.notes.some((n) => n.includes('zero magnitude, no curve — script/scaled, needs override')),
    ).toBe(true);
  });

  it('EnableKillStreak is a documented no-op skip, not a "no route for AV" note', () => {
    const enableKillStreakEdids = new Map<string, string>([['0xEKS', 'EnableKillStreak']]);
    const r = translate(
      mgef({ actorValue: '0xEKS' }),
      effect({ magnitude: 1 }),
      noRoutes,
      enableKillStreakEdids,
      { noteUnroutedAvs: true },
    );
    expect(r.modifiers).toHaveLength(0);
    expect(r.notes.some((n) => n.includes('no route for AV'))).toBe(false);
  });
});

describe('translateConditions (Stage C4, gender-twin paired family — Action Boy/Girl)', () => {
  const ownFamily = ['0xAB01', '0xAB02', '0xAB03']; // simulated family (e.g. Action Boy)
  const pairedFamily = ['0xAG01', '0xAG02', '0xAG03']; // paired family (e.g. Action Girl)

  it('a single-row HasPerk on the paired family is consumed when the mirrored rank matches', () => {
    // Rank-1 simulation: mirrored paired rank is also 1, so paired rank-2
    // (index 1) is NOT owned — HasPerk(...)=0 wants "not owned" → satisfied.
    const row: RawCondition = {
      Function: 'HasPerk',
      'Parameter 1': '0xAG02',
      'Comparison Value': 0,
      Operator: 'Equal To',
    };
    const { conditions, unresolved } = translateConditions([row], {
      edidByFormId: new Map(),
      familyFormIds: ownFamily,
      pairedFamilyFormIds: pairedFamily,
      ownedRanks: 1,
    });
    expect(conditions).toEqual([]);
    expect(unresolved).toEqual([]);
  });

  it('a single-row HasPerk on the paired family kills the effect when the mirrored rank mismatches', () => {
    // Rank-2 simulation: mirrored paired rank-2 IS owned, but the row wants
    // "not owned" (=0) → mismatch → the whole effect is inactive.
    const row: RawCondition = {
      Function: 'HasPerk',
      'Parameter 1': '0xAG02',
      'Comparison Value': 0,
      Operator: 'Equal To',
    };
    const { conditions } = translateConditions([row], {
      edidByFormId: new Map(),
      familyFormIds: ownFamily,
      pairedFamilyFormIds: pairedFamily,
      ownedRanks: 2,
    });
    expect(conditions).toBeNull();
  });

  it('an OR-group of own+paired HasPerk rows is consumed when ANY member is satisfied', () => {
    const rows: RawCondition[] = [
      {
        Function: 'HasPerk',
        'Parameter 1': '0xAB02',
        'Comparison Value': 1,
        Operator: 'Equal To',
        'AND/OR': 'OR',
      },
      { Function: 'HasPerk', 'Parameter 1': '0xAG02', 'Comparison Value': 1, Operator: 'Equal To' },
    ];
    // Rank-2 simulation: own rank-2 (index 1) IS owned → wants=1 → satisfied.
    const { conditions, unresolved } = translateConditions(rows, {
      edidByFormId: new Map(),
      familyFormIds: ownFamily,
      pairedFamilyFormIds: pairedFamily,
      ownedRanks: 2,
    });
    expect(conditions).toEqual([]);
    expect(unresolved).toEqual([]);
  });

  it('an OR-group of own+paired HasPerk rows kills the effect when NEITHER member is satisfied', () => {
    const rows: RawCondition[] = [
      {
        Function: 'HasPerk',
        'Parameter 1': '0xAB02',
        'Comparison Value': 1,
        Operator: 'Equal To',
        'AND/OR': 'OR',
      },
      { Function: 'HasPerk', 'Parameter 1': '0xAG02', 'Comparison Value': 1, Operator: 'Equal To' },
    ];
    // Rank-1 simulation: neither own nor paired rank-2 is owned → both fail.
    const { conditions } = translateConditions(rows, {
      edidByFormId: new Map(),
      familyFormIds: ownFamily,
      pairedFamilyFormIds: pairedFamily,
      ownedRanks: 1,
    });
    expect(conditions).toBeNull();
  });

  it('an all-HasPerk OR-group with NO pairedFamilyFormIds falls through to unresolved (pre-Stage-C4 behavior preserved)', () => {
    const rows: RawCondition[] = [
      {
        Function: 'HasPerk',
        'Parameter 1': '0xAB02',
        'Comparison Value': 1,
        Operator: 'Equal To',
        'AND/OR': 'OR',
      },
      { Function: 'HasPerk', 'Parameter 1': '0xAG02', 'Comparison Value': 1, Operator: 'Equal To' },
    ];
    const { conditions, unresolved } = translateConditions(rows, {
      edidByFormId: new Map(),
      familyFormIds: ownFamily,
      ownedRanks: 1,
    });
    expect(unresolved).toHaveLength(1);
    expect(conditions).toEqual([{ kind: 'unresolved', raw: expect.stringContaining('OR-group') }]);
  });
});

describe('translateConditions (cross-family HasPerk → perkFamilyRank, 2026-07-15)', () => {
  const ownFamily = ['0xBS01', '0xBS02', '0xBS03']; // simulated family (Bullet Storm shape)
  const crossFamilyRank = new Map([
    ['0xLNL01', { family: 'LockAndLoad', rank: 1 }],
    ['0xLNL02', { family: 'LockAndLoad', rank: 2 }],
    ['0xBS01', { family: 'BulletStorm', rank: 1 }], // own formids may also be in the global map
  ]);

  it('a HasPerk row on ANOTHER family translates to a typed perkFamilyRank condition', () => {
    const row: RawCondition = {
      Function: 'HasPerk',
      'Parameter 1': '0xLNL01',
      'Comparison Value': 1,
      Operator: 'Equal To',
    };
    const { conditions, unresolved } = translateConditions([row], {
      edidByFormId: new Map(),
      familyFormIds: ownFamily,
      ownedRanks: 1,
      crossFamilyRank,
    });
    expect(conditions).toEqual([
      { kind: 'perkFamilyRank', family: 'LockAndLoad', minRank: 1, present: true },
    ]);
    expect(unresolved).toEqual([]);
  });

  it('=0 rows carry present:false; higher ranks carry their own minRank', () => {
    const row: RawCondition = {
      Function: 'HasPerk',
      'Parameter 1': '0xLNL02',
      'Comparison Value': 0,
      Operator: 'Equal To',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map(), crossFamilyRank });
    expect(conditions).toEqual([
      { kind: 'perkFamilyRank', family: 'LockAndLoad', minRank: 2, present: false },
    ]);
  });

  it('the SELF-family rank gate wins over the global map (simulation-consumed, never a runtime condition)', () => {
    const row: RawCondition = {
      Function: 'HasPerk',
      'Parameter 1': '0xBS01',
      'Comparison Value': 1,
      Operator: 'Equal To',
    };
    const { conditions, unresolved } = translateConditions([row], {
      edidByFormId: new Map(),
      familyFormIds: ownFamily,
      ownedRanks: 1,
      crossFamilyRank,
    });
    expect(conditions).toEqual([]); // consumed by the rank-1 simulation
    expect(unresolved).toEqual([]);
  });

  it('a formid outside the map (cut content, e.g. CUT_Radicool) still falls through to unresolved', () => {
    const row: RawCondition = {
      Function: 'HasPerk',
      'Parameter 1': '0xCUT01',
      'Comparison Value': 1,
      Operator: 'Equal To',
    };
    const { conditions, unresolved } = translateConditions([row], {
      edidByFormId: new Map(),
      crossFamilyRank,
    });
    expect(conditions).toEqual([{ kind: 'unresolved', raw: 'HasPerk(0xCUT01)=1' }]);
    expect(unresolved).toHaveLength(1);
  });
});

describe('flattenPerkConditionRows', () => {
  it('flattens tabbed perk conditions and forces Run On=Target for tab index 2', () => {
    const rows = flattenPerkConditionRows([
      {
        'Perk Condition': {
          'Run On (Tab Index)': 2,
          Conditions: [
            {
              Condition: {
                'Condition Data': {
                  Function: 'HasKeyword',
                  'Parameter 1': '0xKW',
                  'Comparison Value': 1,
                },
              },
            },
          ],
        },
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      Function: 'HasKeyword',
      'Parameter 1': '0xKW',
      'Run On': 'Target',
    });
  });

  it('returns [] for a non-array node', () => {
    expect(flattenPerkConditionRows(undefined)).toEqual([]);
  });
});

describe('translateConditions (2026-07-14 anim-type gate + CNDF expansion)', () => {
  it('translates GetWeaponAnimType() ≤ 6 to weaponAnimTypeMax (Martial Artist melee gate)', () => {
    const row: RawCondition = {
      Function: 'GetWeaponAnimType',
      'Comparison Value': 6,
      Operator: 'Less Than Or Equal To',
      'Run On': 'Subject',
    };
    const { conditions, unresolved } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'weaponAnimTypeMax', max: 6 }]);
    expect(unresolved).toEqual([]);
  });

  it('leaves non-≤ GetWeaponAnimType comparisons unresolved (no real use in data)', () => {
    const row: RawCondition = {
      Function: 'GetWeaponAnimType',
      'Comparison Value': 9,
      Operator: 'Equal To',
      'Run On': 'Subject',
    };
    const { conditions, unresolved } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'unresolved', raw: 'GetWeaponAnimType() Equal To 9' }]);
    expect(unresolved).toHaveLength(1);
  });

  // Ground Pounder's SmallGun_Actor_Condition CNDF, verbatim shape:
  // (Rifle OR Shotgun OR Pistol) AND NOT HeavyGun.
  const smallGunRows: RawCondition[] = [
    {
      Function: 'WornHasKeyword',
      'Parameter 1': '0xRIFLE',
      'Comparison Value': 1,
      Operator: 'Equal To',
      'AND/OR': 'OR',
      'Run On': 'Subject',
    },
    {
      Function: 'WornHasKeyword',
      'Parameter 1': '0xSHOTGUN',
      'Comparison Value': 1,
      Operator: 'Equal To',
      'AND/OR': 'OR',
      'Run On': 'Subject',
    },
    {
      Function: 'WornHasKeyword',
      'Parameter 1': '0xPISTOL',
      'Comparison Value': 1,
      Operator: 'Equal To',
      'AND/OR': 'AND',
      'Run On': 'Subject',
    },
    {
      Function: 'WornHasKeyword',
      'Parameter 1': '0xHEAVY',
      'Comparison Value': 0,
      Operator: 'Equal To',
      'AND/OR': 'AND',
      'Run On': 'Subject',
    },
  ];
  const smallGunEdids = new Map([
    ['0xCNDF', 'SmallGun_Actor_Condition'],
    ['0xRIFLE', 'WeaponTypeRifle'],
    ['0xSHOTGUN', 'WeaponTypeShotgun'],
    ['0xPISTOL', 'WeaponTypePistol'],
    ['0xHEAVY', 'WeaponTypeHeavyGun'],
  ]);
  const isTrueRow: RawCondition = {
    Function: 'IsTrueForConditionForm',
    'Parameter 1': '0xCNDF',
    'Comparison Value': 1,
    Operator: 'Equal To',
    'Run On': 'Subject',
  };

  it("expands IsTrueForConditionForm into the CNDF's translated rows (Ground Pounder's small-gun gate)", () => {
    const { conditions, unresolved } = translateConditions([isTrueRow], {
      edidByFormId: smallGunEdids,
      conditionForms: new Map([['0xCNDF', smallGunRows]]),
    });
    expect(conditions).toEqual([
      {
        kind: 'weaponKeywordAny',
        keywords: ['WeaponTypeRifle', 'WeaponTypeShotgun', 'WeaponTypePistol'],
      },
      { kind: 'weaponKeyword', keyword: 'WeaponTypeHeavyGun', present: false },
    ]);
    expect(unresolved).toEqual([]);
  });

  it('falls back to the unresolved row when the CNDF contents do not FULLY translate (Perk_Day_Condition shape)', () => {
    const dayRows: RawCondition[] = [
      {
        Function: 'GetCurrentTime',
        'Comparison Value': 6,
        Operator: 'Greater Than Or Equal To',
        'Run On': 'Subject',
      },
    ];
    const { conditions, unresolved } = translateConditions([isTrueRow], {
      edidByFormId: new Map([['0xCNDF', 'Perk_Day_Condition']]),
      conditionForms: new Map([['0xCNDF', dayRows]]),
    });
    expect(conditions).toEqual([
      { kind: 'unresolved', raw: 'IsTrueForConditionForm(Perk_Day_Condition)=1' },
    ]);
    expect(unresolved).toHaveLength(1);
  });

  it('never expands inside an OR-group (GHL feral-rage shape) or without a pre-fetched form', () => {
    const orGroup: RawCondition[] = [
      { ...isTrueRow, 'AND/OR': 'OR' },
      {
        Function: 'GetValue',
        'Parameter 1': '0xRADS',
        'Comparison Value': 5,
        Operator: 'Greater Than Or Equal To',
        'Run On': 'Subject',
      },
    ];
    const withForm = translateConditions(orGroup, {
      edidByFormId: smallGunEdids,
      conditionForms: new Map([['0xCNDF', smallGunRows]]),
    });
    expect(withForm.conditions?.[0]?.kind).toBe('unresolved');

    const noForm = translateConditions([isTrueRow], { edidByFormId: smallGunEdids });
    expect(noForm.conditions).toEqual([
      { kind: 'unresolved', raw: 'IsTrueForConditionForm(SmallGun_Actor_Condition)=1' },
    ]);
  });
});

describe('getMgefInfo (Detrimental flag, 2026-07-14)', () => {
  // Inline records (bareClient pattern from the "consumables overhaul" describe
  // above) rather than a checked-in fixture — only the Flags shape matters here.
  function flagRecord(flags: string[]): EsmRecord {
    return {
      header: { signature: 'MGEF', form_id: '0xFLAGS' },
      editor_id: 'FlagsMgef',
      fields: {
        'Magic Effect Data': {
          Data: { Archetype: { name: 'Peak Value Modifier' }, Flags: { value: '0x0', flags } },
        },
      },
    } as unknown as EsmRecord;
  }

  it('is true for a Detrimental-flagged MGEF (Mutation_ReduceStrength-style)', async () => {
    const client = {
      async get() {
        return flagRecord(['Recover', 'Detrimental', 'No Duration', 'No Area']);
      },
    } as unknown as EsmClient;
    const info = await getMgefInfo(client, '0xFLAGS');
    expect(info.detrimental).toBe(true);
  });

  it('is false when the flag is absent (FortifyStrengthChemEffect-style)', async () => {
    const client = {
      async get() {
        return flagRecord(['Recover', 'Dispel with Keywords', 'No Area']);
      },
    } as unknown as EsmClient;
    const info = await getMgefInfo(client, '0xFLAGS');
    expect(info.detrimental).toBe(false);
  });
});

describe('translate (Detrimental sign handling, 2026-07-14)', () => {
  // AV routed via FALLBACK_AVIF_ROUTES['Strength'] (scale 1) so the sign of
  // the pushed value is a direct read of translate()'s negation logic.
  const strEdids = new Map<string, string>([['0xAV', 'Strength']]);

  it('negates a flat Peak Value Modifier magnitude when detrimental (Mutation_ReduceStrength-style: mag 3 → −3)', () => {
    const r = translate(
      mgef({ archetype: 'Peak Value Modifier', detrimental: true }),
      effect({ magnitude: 3 }),
      noRoutes,
      strEdids,
    );
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0]).toEqual({
      bucket: 'specialStrength',
      op: 'ADD',
      value: -3,
      conditions: [],
    });
  });

  it('does NOT negate when detrimental is false (guard against over-negation)', () => {
    const r = translate(
      mgef({ archetype: 'Peak Value Modifier', detrimental: false }),
      effect({ magnitude: 3 }),
      noRoutes,
      strEdids,
    );
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0]).toEqual({
      bucket: 'specialStrength',
      op: 'ADD',
      value: 3,
      conditions: [],
    });
  });

  it('leaves a Damage-archetype DoT magnitude positive despite detrimental (DoT magnitude is damage, not a stat delta)', () => {
    const r = translate(
      mgef({ archetype: 'Damage', detrimental: true }),
      effect({ magnitude: 10, duration: 5 }),
      noRoutes,
      edids,
    );
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0]).toEqual({
      bucket: 'dotDamage',
      op: 'ADD',
      value: 10,
      durationSec: 5,
      conditions: [],
    });
  });

  it('drops a Detrimental multi-point curve and notes the sign ambiguity instead of guessing', () => {
    const curved = effect({
      curvePoints: [
        { x: 0.05, y: 130 },
        { x: 1.0, y: 0 },
      ],
      curveInputAv: '0x00000392',
    });
    const r = translate(
      mgef({ archetype: 'Peak Value Modifier', detrimental: true }),
      curved,
      noRoutes,
      edids,
    );
    expect(r.modifiers).toHaveLength(0);
    expect(r.notes.some((n) => /Detrimental.*curve/.test(n))).toBe(true);
  });
});

describe('translate (Health-route archetype scoping, 2026-07-14)', () => {
  const healthEdids = new Map<string, string>([['0xAV', 'Health']]);

  it("routes a Peak Value Modifier on AV Health to maxHealth (Adrenal Reaction's permanent max-HP cut)", () => {
    const r = translate(
      mgef({ archetype: 'Peak Value Modifier' }),
      effect({ magnitude: 25 }),
      noRoutes,
      healthEdids,
    );
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0]).toEqual({ bucket: 'maxHealth', op: 'ADD', value: 25, conditions: [] });
  });

  it('does NOT route a Value Modifier on the same AV Health (instant heals like RestoreHealthFood must stay unrouted)', () => {
    const r = translate(
      mgef({ archetype: 'Value Modifier' }),
      effect({ magnitude: 25 }),
      noRoutes,
      healthEdids,
      { noteUnroutedAvs: true },
    );
    expect(r.modifiers).toHaveLength(0);
    // Documented out-of-scope skip (2026-07-15): instant restores no longer
    // pollute the unresolved report with "no route" notes — silence IS the
    // assertion now, alongside the empty modifier list.
    expect(r.notes).toHaveLength(0);
  });
});

describe('translate (AP actor-value routes, 2026-07-15)', () => {
  const apEdids = new Map<string, string>([['0xAV', 'ActionPoints']]);
  const apRateEdids = new Map<string, string>([['0xAV', 'ActionPointsRate']]);
  const dmgApEdids = new Map<string, string>([['0xAV', 'STAT_DmgAP']]);

  it("routes a Peak Value Modifier on AV ActionPoints to apMax (FortifyActionPointsFood's +AP)", () => {
    const r = translate(
      mgef({ archetype: 'Peak Value Modifier' }),
      effect({ magnitude: 30 }),
      noRoutes,
      apEdids,
    );
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0]).toEqual({ bucket: 'apMax', op: 'ADD', value: 30, conditions: [] });
  });

  it("negates Scaly Skin's Detrimental Mutation_ReduceActionPoints (mag 50 → apMax −50)", () => {
    const r = translate(
      mgef({ archetype: 'Peak Value Modifier', detrimental: true }),
      effect({ magnitude: 50 }),
      noRoutes,
      apEdids,
    );
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0]).toEqual({ bucket: 'apMax', op: 'ADD', value: -50, conditions: [] });
  });

  it('skips a Value Modifier on AV ActionPoints silently (instant restores — RestoreActionPointsFood, Brain Bombs)', () => {
    const r = translate(
      mgef({ archetype: 'Value Modifier' }),
      effect({ magnitude: 45 }),
      noRoutes,
      apEdids,
      {
        noteUnroutedAvs: true,
      },
    );
    expect(r.modifiers).toHaveLength(0);
    expect(r.notes).toHaveLength(0);
  });

  it("routes AV ActionPointsRate to apRegenFlat at scale 1 (Company Tea's FortifyActionPointRegenFood +10)", () => {
    const r = translate(
      mgef({ archetype: 'Peak Value Modifier' }),
      effect({ magnitude: 10 }),
      noRoutes,
      apRateEdids,
    );
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0]).toEqual({ bucket: 'apRegenFlat', op: 'ADD', value: 10, conditions: [] });
  });

  it("routes STAT_DmgAP to a scaledByWeaponApCost dbm (Number Cruncher's abPerkFortifyDmgAP, mag 2 → 0.02/AP)", () => {
    const r = translate(
      mgef({ archetype: 'Peak Value Modifier' }),
      effect({ magnitude: 2 }),
      noRoutes,
      dmgApEdids,
    );
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0]).toEqual({
      bucket: 'dbm',
      op: 'ADD',
      value: 0.02,
      conditions: [{ kind: 'scaledByWeaponApCost' }],
    });
  });
});

describe('translateConditions (Class Freak rank tiers, 2026-07-14)', () => {
  // Real Grounded perk formids: ClassFreak01/02/03 = 0x00391F0E/11/12.
  const rank = (formId: string, cmp: number): RawCondition => ({
    Function: 'HasPerk',
    'Parameter 1': formId,
    'Comparison Value': cmp,
    Operator: 'Equal To',
  });

  it('tier 0 (below ClassFreak01): [HasPerk(01)=0] → [{min:0,max:0}]', () => {
    const { conditions } = translateConditions([rank('0x00391F0E', 0)], {
      edidByFormId: new Map(),
    });
    expect(conditions).toEqual([{ kind: 'classFreakRank', min: 0, max: 0 }]);
  });

  it('tier 1 (ClassFreak01 only): [HasPerk(02)=0, HasPerk(01)=1] → [{0,1},{1,3}]', () => {
    const rows = [rank('0x00391F11', 0), rank('0x00391F0E', 1)];
    const { conditions } = translateConditions(rows, { edidByFormId: new Map() });
    expect(conditions).toEqual([
      { kind: 'classFreakRank', min: 0, max: 1 },
      { kind: 'classFreakRank', min: 1, max: 3 },
    ]);
  });

  it('tier 2 (ClassFreak02): [HasPerk(02)=1, HasPerk(03)=0] → [{2,3},{0,2}]', () => {
    const rows = [rank('0x00391F11', 1), rank('0x00391F12', 0)];
    const { conditions } = translateConditions(rows, { edidByFormId: new Map() });
    expect(conditions).toEqual([
      { kind: 'classFreakRank', min: 2, max: 3 },
      { kind: 'classFreakRank', min: 0, max: 2 },
    ]);
  });

  it('tier 3 (ClassFreak03): [HasPerk(03)=1] → [{3,3}]', () => {
    const { conditions } = translateConditions([rank('0x00391F12', 1)], {
      edidByFormId: new Map(),
    });
    expect(conditions).toEqual([{ kind: 'classFreakRank', min: 3, max: 3 }]);
  });
});

describe('translateConditions (IsSpellTarget RadX/Serum suppression, 2026-07-14)', () => {
  const suppressionEdids = new Map([
    ['0x00024057', 'RadX'],
    ['0x0050A5CB', 'Serum_EggHead'],
  ]);

  it('consumes both RadX=0 and Serum_EggHead=0 (effect active while unsuppressed)', () => {
    const rows: RawCondition[] = [
      {
        Function: 'IsSpellTarget',
        'Parameter 1': '0x00024057',
        'Comparison Value': 0,
        Operator: 'Equal To',
      },
      {
        Function: 'IsSpellTarget',
        'Parameter 1': '0x0050A5CB',
        'Comparison Value': 0,
        Operator: 'Equal To',
      },
    ];
    const { conditions, unresolved } = translateConditions(rows, {
      edidByFormId: suppressionEdids,
    });
    expect(conditions).toEqual([]);
    expect(unresolved).toEqual([]);
  });

  it('kills the effect for RadX=1 (the treated/suppressed variant we never model)', () => {
    const row: RawCondition = {
      Function: 'IsSpellTarget',
      'Parameter 1': '0x00024057',
      'Comparison Value': 1,
      Operator: 'Equal To',
    };
    const { conditions } = translateConditions([row], { edidByFormId: suppressionEdids });
    expect(conditions).toBeNull();
  });
});

describe('translateConditions (IsMemberOfAPlayerTeam, 2026-07-14)', () => {
  it('=1 → teammateCount ≥1 (Herd Mentality team bonus)', () => {
    const row: RawCondition = {
      Function: 'IsMemberOfAPlayerTeam',
      'Comparison Value': 1,
      Operator: 'Equal To',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'teammateCount', count: 1, orMore: true }]);
  });

  it('=0 → teammateCount 0 (Herd Mentality solo penalty)', () => {
    const row: RawCondition = {
      Function: 'IsMemberOfAPlayerTeam',
      'Comparison Value': 0,
      Operator: 'Equal To',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'teammateCount', count: 0 }]);
  });
});

describe('ENTRY_POINT_BUCKETS (Mod Weapon Attack Damage, 2026-07-21)', () => {
  it("maps 'Mod Weapon Attack Damage' to the wholeDamage bucket (Grounded's Charged Penalty, USER-RESOLVED)", () => {
    expect(ENTRY_POINT_BUCKETS['Mod Weapon Attack Damage']).toBe('wholeDamage');
  });

  it("maps 'Mod Player Explosion Damage' to the baseDamage bucket (component-scoped standalone multiplier, currently inert)", () => {
    expect(ENTRY_POINT_BUCKETS['Mod Player Explosion Damage']).toBe('baseDamage');
  });
});

describe('ENTRY_POINT_BUCKETS (Grenadier / explosion radius, 2026-07-29)', () => {
  it("maps 'Mod Player Explosion Scale' to explosionRadiusBonus (STAT_DamagePerk Effects[30] → STAT_ExplosionRadius ×0.01)", () => {
    expect(ENTRY_POINT_BUCKETS['Mod Player Explosion Scale']).toBe('explosionRadiusBonus');
  });
});

describe('translate (Grenadier / AbPerkFortifyExplosionRadius, 2026-07-29)', () => {
  it('routes a Peak Value Modifier on STAT_ExplosionRadius to explosionRadiusBonus (magnitude 50 → 0.5 via plumbing ×0.01)', () => {
    const routedAv = new Map<string, AvifRoute[]>([
      ['0x00066997', [{ bucket: 'explosionRadiusBonus', scale: 0.01, rawConditions: [] }]],
    ]);
    const grenadierEdids = new Map<string, string>([['0x00066997', 'STAT_ExplosionRadius']]);
    const r = translate(
      mgef({ archetype: 'Peak Value Modifier', actorValue: '0x00066997' }),
      effect({ magnitude: 50 }),
      routedAv,
      grenadierEdids,
    );
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0]).toEqual({
      bucket: 'explosionRadiusBonus',
      op: 'ADD',
      value: 0.5,
      conditions: [],
    });
  });

  it('routes rank-2 magnitude 100 to explosionRadiusBonus value 1.0', () => {
    const routedAv = new Map<string, AvifRoute[]>([
      ['0x00066997', [{ bucket: 'explosionRadiusBonus', scale: 0.01, rawConditions: [] }]],
    ]);
    const grenadierEdids = new Map<string, string>([['0x00066997', 'STAT_ExplosionRadius']]);
    const r = translate(
      mgef({ archetype: 'Peak Value Modifier', actorValue: '0x00066997' }),
      effect({ magnitude: 100 }),
      routedAv,
      grenadierEdids,
    );
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0]).toEqual({
      bucket: 'explosionRadiusBonus',
      op: 'ADD',
      value: 1.0,
      conditions: [],
    });
  });
});

describe('ENTRY_POINT_BUCKETS (Bullet Storm, 2026-07-16)', () => {
  it("maps 'Mod Ammo Spender Max Reload Stack Mult' to bulletStormRetention (Lock and Load r1's EP210)", () => {
    expect(ENTRY_POINT_BUCKETS['Mod Ammo Spender Max Reload Stack Mult']).toBe(
      'bulletStormRetention',
    );
  });
});

describe('translateEnchantment (Contact-delivery weapon/OMOD on-hit procs, 2026-07-14)', () => {
  // Synthetic records mirroring Cremator's real ESM shape (CrematorFXEnchFireHit,
  // 0x00729BCD): Effect Data.Target Type "Contact", two Damage-archetype effects
  // gated by GetIsPlayer(Run On: Subject) — NPC branch (=0, curve, the one this
  // calculator must keep) and a PVP-only branch (=1, flat, must be dropped).
  const damageMgef = (formId: string, resistValue: string): EsmRecord =>
    ({
      header: { signature: 'MGEF', form_id: formId },
      editor_id: `Mgef${formId}`,
      fields: {
        'Magic Effect Data': {
          Data: {
            Archetype: { name: 'Damage' },
            'Resist Value': resistValue,
            Flags: { value: '0x0', flags: [] },
          },
        },
      },
    }) as unknown as EsmRecord;

  const enchFormId = '0xENCH1';
  const mgefFormId = '0xMGEF1';
  const get = async (formId: string): Promise<EsmRecord> => {
    if (formId === enchFormId) {
      return {
        header: { signature: 'ENCH', form_id: enchFormId },
        editor_id: 'TestFireHitEnch',
        fields: {
          'Effect Data': {
            'Target Type': { name: 'Contact' },
            'Cast Type': { name: 'Fire and Forget' },
          },
          Effects: [
            {
              Effect: {
                'Base Effect': mgefFormId,
                'Effect Item Data': { Magnitude: 10, Duration: 6 },
                Conditions: {
                  Conditions: [
                    {
                      Condition: {
                        'Condition Data': {
                          Function: 'GetIsPlayer',
                          'Comparison Value': 0,
                          Operator: 'Equal To',
                          'Run On': 'Subject',
                        },
                      },
                    },
                  ],
                },
              },
            },
            {
              Effect: {
                'Base Effect': mgefFormId,
                'Effect Item Data': { Magnitude: 3, Duration: 6 },
                Conditions: {
                  Conditions: [
                    {
                      Condition: {
                        'Condition Data': {
                          Function: 'GetIsPlayer',
                          'Comparison Value': 1,
                          Operator: 'Equal To',
                          'Run On': 'Subject',
                        },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      } as unknown as EsmRecord;
    }
    if (formId === mgefFormId) return damageMgef(mgefFormId, '0xRESIST_FIRE');
    if (formId === '0xRESIST_FIRE')
      return {
        header: { signature: 'AVIF', form_id: '0xRESIST_FIRE' },
        editor_id: 'FireResist',
        fields: {},
      } as unknown as EsmRecord;
    throw new Error(`unexpected get(${formId})`);
  };
  const stubClient = {
    get,
    resolveEdid: async (formId: string) => (await get(formId)).editor_id,
  } as unknown as EsmClient;

  const deps = {
    client: stubClient,
    routes: new Map<string, AvifRoute[]>(),
    edidByFormId: new Map<string, string>(),
  };

  it('keeps the NPC branch (=0) as a fire-scoped dotDamage modifier and drops the PVP-only branch (=1)', async () => {
    const result = await translateEnchantment(deps, enchFormId);
    expect(result.targetType).toBe('Contact');
    expect(result.modifiers).toEqual([
      {
        bucket: 'dotDamage',
        op: 'ADD',
        value: 10,
        conditions: [{ kind: 'damageTypeScope', types: ['fire'] }],
        durationSec: 6,
      },
    ]);
  });

  it('reports targetType null and a not-found note when the record is missing', async () => {
    const result = await translateEnchantment(deps, '0xMISSING');
    expect(result.targetType).toBeNull();
    expect(result.modifiers).toEqual([]);
    expect(result.notes.some((n) => n.includes('not found'))).toBe(true);
  });

  it('does NOT invert GetIsPlayer for a Self-delivery record (ordinary granted effect)', async () => {
    const selfEnchFormId = '0xENCH2';
    const getSelf = async (formId: string): Promise<EsmRecord> => {
      if (formId === selfEnchFormId) {
        return {
          header: { signature: 'ENCH', form_id: selfEnchFormId },
          editor_id: 'TestSelfEnch',
          fields: {
            'Effect Data': {
              'Target Type': { name: 'Self' },
              'Cast Type': { name: 'Constant Effect' },
            },
            Effects: [
              {
                Effect: {
                  'Base Effect': '0xMGEF2',
                  'Effect Item Data': { Magnitude: 0, Duration: 0 },
                },
              },
            ],
          },
        } as unknown as EsmRecord;
      }
      if (formId === '0xMGEF2') {
        return {
          header: { signature: 'MGEF', form_id: '0xMGEF2' },
          editor_id: 'TestSelfMgef',
          fields: {
            'Magic Effect Data': {
              Data: { Archetype: { name: 'Script' }, Flags: { value: '0x0', flags: [] } },
            },
          },
        } as unknown as EsmRecord;
      }
      throw new Error(`unexpected get(${formId})`);
    };
    const selfClient = {
      get: getSelf,
      resolveEdid: async (formId: string) => (await getSelf(formId)).editor_id,
    } as unknown as EsmClient;
    const result = await translateEnchantment(
      {
        client: selfClient,
        routes: new Map<string, AvifRoute[]>(),
        edidByFormId: new Map<string, string>(),
      },
      selfEnchFormId,
    );
    expect(result.targetType).toBe('Self');
    // Script archetype with no Perk to Apply and zero magnitude: no note, no modifier.
    expect(result.modifiers).toEqual([]);
  });
});

describe('translate (Phase 4 — VATS hit-chance aggregate, display-only, 2026-07-18)', () => {
  const vatsAccuracyEdids = new Map<string, string>([['0xAV', 'STAT_VATSAccuracy']]);

  it('routes a flat Peak Value Modifier on STAT_VATSAccuracy to vatsHitChance (V.A.T.S. Enhanced-style: magnitude 50 → 0.50)', () => {
    const r = translate(
      mgef({ archetype: 'Peak Value Modifier' }),
      effect({ magnitude: 50 }),
      noRoutes,
      vatsAccuracyEdids,
    );
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0]).toEqual({
      bucket: 'vatsHitChance',
      op: 'ADD',
      value: 0.5,
      conditions: [],
    });
  });

  it("carries curve.input 'perception' for a Peak Value Modifier on STAT_VATSAccuracy (Awareness perk)", () => {
    const curved = effect({
      curvePoints: [
        { x: 1, y: 5 },
        { x: 15, y: 18 },
        { x: 30, y: 30 },
        { x: 60, y: 45 },
        { x: 100, y: 50 },
      ],
      curveInputAv: '0x000002C3',
    });
    const r = translate(
      mgef({ archetype: 'Peak Value Modifier' }),
      curved,
      noRoutes,
      vatsAccuracyEdids,
    );
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0].bucket).toBe('vatsHitChance');
    expect(r.modifiers[0].curve?.input).toBe('perception');
    expect(r.modifiers[0].curve ? r.modifiers[0].curveScale : null).toBeCloseTo(0.01, 10);
  });

  it("routes the 'Mod VATS Hit Chance' entry point through ENTRY_POINT_BUCKETS (armor/chem/mutation Multiply-Value sources)", () => {
    expect(ENTRY_POINT_BUCKETS['Mod VATS Hit Chance']).toBe('vatsHitChance');
  });
});

describe('translateConditions (Phase 4 — GetDistanceToClosestHostileActor, 2026-07-18)', () => {
  it("translates GetDistanceToClosestHostileActor() >= N to targetDistance 'far' (Eye of the Hunter's 10/20/30-by-rank gates)", () => {
    for (const cmp of [10, 20, 30]) {
      const row: RawCondition = {
        Function: 'GetDistanceToClosestHostileActor',
        'Comparison Value': cmp,
        Operator: 'Greater Than Or Equal To',
        'Run On': 'Subject',
      };
      const { conditions, unresolved } = translateConditions([row], { edidByFormId: new Map() });
      expect(conditions).toEqual([{ kind: 'targetDistance', range: 'far' }]);
      expect(unresolved).toEqual([]);
    }
  });

  it('leaves other operators unresolved (no other shape observed in data)', () => {
    const row: RawCondition = {
      Function: 'GetDistanceToClosestHostileActor',
      'Comparison Value': 10,
      Operator: 'Less Than',
      'Run On': 'Subject',
    };
    const { conditions, unresolved } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([
      { kind: 'unresolved', raw: 'GetDistanceToClosestHostileActor Less Than 10' },
    ]);
    expect(unresolved).toEqual(['GetDistanceToClosestHostileActor Less Than 10']);
  });
});

describe('translateGrantedPerk (unique weapons, 2026-08-04)', () => {
  const cryptidEdids = new Map<string, string>([['0x00331AC2', 'ActorTypeCryptid']]);

  function entryPointPerk(
    perkEdid: string,
    effect: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      editor_id: perkEdid,
      fields: {
        Effects: [{ Effect: effect }],
      },
    };
  }

  function grantedPerkClient(perkFormId: string, perk: Record<string, unknown>): EsmClient {
    return {
      async get(formId: string): Promise<EsmRecord> {
        if (formId === perkFormId) return perk as unknown as EsmRecord;
        throw new Error(`unexpected get(${formId})`);
      },
      resolveEdid: async (formId: string) => cryptidEdids.get(formId) ?? formId,
    } as unknown as EsmClient;
  }

  it("routes Cultist Piercer's Mod Target Damage Resistance ×0.5 to armorPen ADD 0.5 vs Cryptids", async () => {
    const perkFormId = '0x0077B581';
    const perk = entryPointPerk('CultistPiercer_Perk', {
      'Effect Header': { 'Effect Type': { name: 'Entry Point' } },
      'Entry Point': {
        'Entry Point': { name: 'Mod Target Damage Resistance' },
        Function: { name: 'Multiply Value' },
      },
      Float: 0.5,
      'Perk Conditions': [
        {
          'Perk Condition': {
            'Run On (Tab Index)': 2,
            Conditions: [
              {
                Condition: {
                  'Condition Data': {
                    Function: 'HasKeyword',
                    'Parameter 1': '0x00331AC2',
                    'Comparison Value': 1,
                    Operator: 'Equal To',
                    'Run On': 'Subject',
                  },
                },
              },
            ],
          },
        },
      ],
    });
    const result = await translateGrantedPerk(
      {
        client: grantedPerkClient(perkFormId, perk),
        routes: new Map(),
        edidByFormId: cryptidEdids,
      },
      'mod_custom_CultistPiercer_Effect',
      perkFormId,
    );
    expect(result.modifiers).toEqual([
      {
        bucket: 'armorPen',
        op: 'ADD',
        value: 0.5,
        conditions: [{ kind: 'enemyType', keywordOrRace: 'ActorTypeCryptid' }],
      },
    ]);
  });

  it("routes Elder's Mark Add Actor Value Mult on shared ConsecutiveHitCount to critDmgBonus ADD per Onslaught stack", async () => {
    const perkFormId = '0x00913B5E';
    const perk = entryPointPerk('EldersMark_Perk', {
      'Effect Header': { 'Effect Type': { name: 'Entry Point' } },
      'Entry Point': {
        'Entry Point': { name: 'Mod My Critical Hit Damage Mult' },
        Function: { name: 'Add Actor Value Mult' },
      },
      Float: 0.02,
      'Function Parameter 3 (Actor Value)': SHARED_ONSLAUGHT_COUNTER_AV,
    });
    const result = await translateGrantedPerk(
      {
        client: grantedPerkClient(perkFormId, perk),
        routes: new Map(),
        edidByFormId: new Map(),
      },
      'mod_custom_EldersMark_Effect',
      perkFormId,
    );
    expect(result.modifiers).toEqual([
      {
        bucket: 'critDmgBonus',
        op: 'ADD',
        value: 0.02,
        conditions: [{ kind: 'stacks', counter: 'onslaught', max: 99 }],
      },
    ]);
  });

  it('routes Ticket to Revenge Multiply 1 + Actor Value Mult on shared ConsecutiveHitCount to armorPen ADD 0.03 per Onslaught stack', async () => {
    const perkFormId = '0x00913B5F';
    const perk = entryPointPerk('custom_TickettoRevenge_Perk', {
      'Effect Header': { 'Effect Type': { name: 'Entry Point' } },
      'Entry Point': {
        'Entry Point': { name: 'Mod Target Damage Resistance' },
        Function: { name: 'Multiply 1 + Actor Value Mult' },
      },
      Float: -0.03,
      'Function Parameter 3 (Actor Value)': {
        formid: SHARED_ONSLAUGHT_COUNTER_AV,
        editor_id: 'ConsecutiveHitCount',
      },
    });
    const result = await translateGrantedPerk(
      {
        client: grantedPerkClient(perkFormId, perk),
        routes: new Map(),
        edidByFormId: new Map(),
      },
      'mod_custom_TickettoRevenge',
      perkFormId,
    );
    expect(result.modifiers).toEqual([
      {
        bucket: 'armorPen',
        op: 'ADD',
        value: 0.03,
        conditions: [{ kind: 'stacks', counter: 'onslaught', max: 99 }],
      },
    ]);
  });

  it('registers Mod Target Damage Resistance in ENTRY_POINT_BUCKETS as armorPen', () => {
    expect(ENTRY_POINT_BUCKETS['Mod Target Damage Resistance']).toBe('armorPen');
  });
});

describe('stimpak-heal entry-point routing (Field Surgeon / Doctor / Healing Factor, 2026-08-06)', () => {
  const KW = {
    STIM: '0xKW001',
    RAD: '0xKW002',
    HEALING: '0xKW003',
    RADX: '0xKW004',
    CHEM: '0xKW005',
    MEDIC: '0xKW006',
    LEGENDARY_HEAL: '0xKW007',
    CF1: '0x00391F0E',
    CF2: '0x00391F11',
    CF3: '0x00391F12',
    RADX_ALCH: '0x00024057',
    SERUM_HF: '0x0050A5CB',
  } as const;

  const stimpakEdids = new Map<string, string>([
    [KW.STIM, 'ChemTypeStimpack'],
    [KW.RAD, 'ChemTypeRadaway'],
    [KW.HEALING, 'ChemTypeHealing'],
    [KW.RADX, 'ChemDispelRadX'],
    [KW.CHEM, 'ChemEffect'],
    [KW.MEDIC, 'PerkMedic'],
    [KW.LEGENDARY_HEAL, 'HasLegendary_Armor_IncreaseHealing'],
    [KW.CF1, 'ClassFreak01'],
    [KW.CF2, 'ClassFreak02'],
    [KW.CF3, 'ClassFreak03'],
    [KW.RADX_ALCH, 'RadX'],
    [KW.SERUM_HF, 'Serum_HealingFactor'],
  ]);

  function wrapPerkConditions(...tabs: RawCondition[][]): unknown {
    return tabs.map((rows) => ({
      'Perk Condition': {
        Conditions: rows.map((data) => ({ Condition: { 'Condition Data': data } })),
      },
    }));
  }

  function stimpakKeywordOrGroup(formIds: string[]): RawCondition[] {
    return formIds.map((fid, i) => ({
      Function: 'EPAlchemyEffectHasKeyword',
      'Parameter 1': fid,
      'Comparison Value': 1,
      Operator: 'Equal To',
      ...(i < formIds.length - 1 ? { 'AND/OR': 'OR' } : {}),
    }));
  }

  function entryPointEffect(
    epName: string,
    float: number,
    perkConditions: unknown,
  ): Record<string, unknown> {
    return {
      'Effect Header': { 'Effect Type': { name: 'Entry Point' } },
      'Entry Point': {
        'Entry Point': { name: epName },
        Function: { name: 'Multiply Value' },
      },
      Float: float,
      'Perk Conditions': perkConditions,
    };
  }

  function grantedPerkClient(
    perkFormId: string,
    perk: Record<string, unknown>,
    edidMap: Map<string, string> = stimpakEdids,
  ): EsmClient {
    return {
      async get(formId: string): Promise<EsmRecord> {
        if (formId === perkFormId) return perk as unknown as EsmRecord;
        throw new Error(`unexpected get(${formId})`);
      },
      resolveEdid: async (formId: string) => edidMap.get(formId) ?? formId,
    } as unknown as EsmClient;
  }

  it('Field Surgeon shape: Subject mag/dur route; Potential-Players heal-others do not', async () => {
    const formId = '0x000814FE';
    const fieldSurgeon = {
      header: { signature: 'PERK', form_id: formId },
      editor_id: 'FieldSurgeon01',
      fields: {
        Name: 'Field Surgeon',
        Description: 'Stimpaks and RadAway heal 60% faster.',
        Effects: [
          {
            Effect: entryPointEffect(
              'Mod Spell Magnitude',
              1.67,
              wrapPerkConditions(stimpakKeywordOrGroup([KW.RAD, KW.STIM])),
            ),
          },
          {
            Effect: entryPointEffect(
              'Mod Spell Duration',
              0.6,
              wrapPerkConditions(stimpakKeywordOrGroup([KW.RAD, KW.STIM])),
            ),
          },
          {
            Effect: entryPointEffect(
              'Mod Spell Magnitude',
              1.67,
              wrapPerkConditions([
                {
                  Function: 'EPAlchemyEffectHasKeyword',
                  'Parameter 1': KW.MEDIC,
                  'Comparison Value': 1,
                  Operator: 'Equal To',
                  'Run On': 'Potential Players',
                },
              ]),
            ),
          },
          {
            Effect: entryPointEffect(
              'Mod Spell Duration',
              0.6,
              wrapPerkConditions([
                {
                  Function: 'EPAlchemyEffectHasKeyword',
                  'Parameter 1': KW.MEDIC,
                  'Comparison Value': 1,
                  Operator: 'Equal To',
                  'Run On': 'Potential Players',
                },
              ]),
            ),
          },
        ],
      },
    } as unknown as EsmRecord;

    const client = {
      async list(type: string): Promise<EsmListRow[]> {
        if (type === 'PERK') {
          return [
            {
              form_id: formId,
              record_type: 'PERK',
              editor_id: 'FieldSurgeon01',
              name: 'Field Surgeon',
            },
          ];
        }
        return [];
      },
      async get(id: string): Promise<EsmRecord> {
        if (id === formId) return fieldSurgeon;
        return {
          header: { signature: 'PERK', form_id: id },
          editor_id: id,
          fields: {},
        } as unknown as EsmRecord;
      },
      resolveEdid: async (id: string) => stimpakEdids.get(id) ?? id,
      refs: async () => [],
    } as unknown as EsmClient;

    const result = await extractPerks(client);
    const family = result.perks.find((p) => p.family === 'FieldSurgeon');
    expect(family).toBeDefined();
    expect(family!.ranks[0].modifiers).toHaveLength(2);
    expect(family!.ranks[0].modifiers[0]).toMatchObject({
      bucket: 'stimpakHealMagMult',
      op: 'MUL_ADD',
      conditions: [],
    });
    expect((family!.ranks[0].modifiers[0] as { value: number }).value).toBeCloseTo(0.67, 10);
    expect(family!.ranks[0].modifiers[1]).toMatchObject({
      bucket: 'stimpakHealDurationMult',
      op: 'MUL_ADD',
      value: -0.4,
      conditions: [],
    });
  });

  it("Doctor's shape: 5 granted tiers with wornPieceCount gates, no unresolved rows", async () => {
    const perkFormId = '0x00609C49';
    const floats = [1.05, 1.1, 1.15, 1.2, 1.25];
    const wornCounts: Array<{ count: number; orMore?: true }> = [
      { count: 1 },
      { count: 2 },
      { count: 3 },
      { count: 4 },
      { count: 5, orMore: true },
    ];
    const effects = floats.map((float, i) => {
      const worn = wornCounts[i];
      const wornRow: RawCondition = {
        Function: 'WornApparelHasKeywordCount',
        'Parameter 1': KW.LEGENDARY_HEAL,
        'Comparison Value': worn.count,
        Operator: worn.orMore ? 'Greater Than Or Equal To' : 'Equal To',
      };
      return {
        Effect: entryPointEffect(
          'Mod Spell Magnitude',
          float,
          wrapPerkConditions([wornRow], stimpakKeywordOrGroup([KW.RADX, KW.RAD, KW.STIM])),
        ),
      };
    });
    const perk = {
      editor_id: 'LegendaryIncreaseHealingPerk',
      fields: { Effects: effects },
    };
    const result = await translateGrantedPerk(
      {
        client: grantedPerkClient(perkFormId, perk),
        routes: new Map(),
        edidByFormId: stimpakEdids,
      },
      'Legendary_IncreaseHealingEffect',
      perkFormId,
    );
    expect(result.modifiers).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(result.modifiers[i]).toEqual({
        bucket: 'stimpakHealMagMult',
        op: 'MUL_ADD',
        value: floats[i] - 1,
        conditions: [
          {
            kind: 'wornPieceCount',
            keyword: 'HasLegendary_Armor_IncreaseHealing',
            count: wornCounts[i].count,
            ...(wornCounts[i].orMore ? { orMore: true } : {}),
          },
        ],
      });
    }
    expect(result.modifiers.every((m) => !m.conditions.some((c) => c.kind === 'unresolved'))).toBe(
      true,
    );
    expect(result.notes.some((n) => n.includes('not modeled'))).toBe(false);
  });

  it('Healing Factor penalty shape: 4 tiers with classFreakRank; IsSpellTarget RadX/Serum rows consumed', async () => {
    const perkFormId = '0x004DF1DF';
    const floats = [0.45, 0.58, 0.72, 0.86];
    const classFreakTabs: RawCondition[][] = [
      [{ Function: 'HasPerk', 'Parameter 1': KW.CF1, 'Comparison Value': 0, Operator: 'Equal To' }],
      [
        { Function: 'HasPerk', 'Parameter 1': KW.CF2, 'Comparison Value': 0, Operator: 'Equal To' },
        { Function: 'HasPerk', 'Parameter 1': KW.CF1, 'Comparison Value': 1, Operator: 'Equal To' },
      ],
      [
        { Function: 'HasPerk', 'Parameter 1': KW.CF2, 'Comparison Value': 1, Operator: 'Equal To' },
        { Function: 'HasPerk', 'Parameter 1': KW.CF3, 'Comparison Value': 0, Operator: 'Equal To' },
      ],
      [{ Function: 'HasPerk', 'Parameter 1': KW.CF3, 'Comparison Value': 1, Operator: 'Equal To' }],
    ];
    const suppressionRows: RawCondition[] = [
      {
        Function: 'IsSpellTarget',
        'Parameter 1': KW.RADX_ALCH,
        'Comparison Value': 0,
        Operator: 'Equal To',
      },
      {
        Function: 'IsSpellTarget',
        'Parameter 1': KW.SERUM_HF,
        'Comparison Value': 0,
        Operator: 'Equal To',
      },
    ];
    const keywordTab = stimpakKeywordOrGroup([KW.STIM, KW.RAD, KW.HEALING, KW.CHEM, KW.MEDIC]);
    const effects = floats.map((float, i) => ({
      Effect: entryPointEffect(
        'Mod Spell Magnitude',
        float,
        wrapPerkConditions(classFreakTabs[i], suppressionRows, keywordTab),
      ),
    }));
    const perk = { editor_id: 'Mutation_ReduceChemEffect_Perk', fields: { Effects: effects } };
    const result = await translateGrantedPerk(
      {
        client: grantedPerkClient(perkFormId, perk),
        routes: new Map(),
        edidByFormId: stimpakEdids,
      },
      'Mutation_HealingFactor',
      perkFormId,
    );
    expect(result.modifiers).toHaveLength(4);
    const expectedValues = [-0.55, -0.42, -0.28, -0.14];
    const expectedConditions = [
      [{ kind: 'classFreakRank', min: 0, max: 0 }],
      [
        { kind: 'classFreakRank', min: 0, max: 1 },
        { kind: 'classFreakRank', min: 1, max: 3 },
      ],
      [
        { kind: 'classFreakRank', min: 2, max: 3 },
        { kind: 'classFreakRank', min: 0, max: 2 },
      ],
      [{ kind: 'classFreakRank', min: 3, max: 3 }],
    ];
    for (let i = 0; i < 4; i++) {
      expect(result.modifiers[i]).toMatchObject({
        bucket: 'stimpakHealMagMult',
        op: 'MUL_ADD',
        conditions: expectedConditions[i],
      });
      expect((result.modifiers[i] as { value: number }).value).toBeCloseTo(expectedValues[i], 10);
    }
    expect(result.modifiers.every((m) => !m.conditions.some((c) => c.kind === 'unresolved'))).toBe(
      true,
    );
  });

  it('does not capture Carnivore food-scaling Mod Spell Magnitude (no stimpak keywords)', async () => {
    const perkFormId = '0xCARNIVORE';
    const perk = {
      editor_id: 'Mutation_EatAllTheMeat_Perk',
      fields: {
        Effects: [
          {
            Effect: entryPointEffect(
              'Mod Spell Magnitude',
              2,
              wrapPerkConditions(
                [
                  {
                    Function: 'EPMagic_SpellHasKeyword',
                    'Parameter 1': '0xMEAT',
                    'Comparison Value': 1,
                    Operator: 'Equal To',
                  },
                ],
                [
                  {
                    Function: 'EPAlchemyEffectHasKeyword',
                    'Parameter 1': '0xFOOD',
                    'Comparison Value': 1,
                    Operator: 'Equal To',
                    'AND/OR': 'OR',
                  },
                  {
                    Function: 'EPAlchemyEffectHasKeyword',
                    'Parameter 1': '0xHUNGER',
                    'Comparison Value': 1,
                    Operator: 'Equal To',
                    'AND/OR': 'OR',
                  },
                  {
                    Function: 'EPAlchemyEffectHasKeyword',
                    'Parameter 1': '0xHEALFOOD',
                    'Comparison Value': 1,
                    Operator: 'Equal To',
                  },
                ],
              ),
            ),
          },
        ],
      },
    };
    const carnivoreEdids = new Map([
      ['0xMEAT', 'IngredientTypeMeat'],
      ['0xFOOD', 'SURV_EffectTypeFoodBuff'],
      ['0xHUNGER', 'SURV_EffectTypeFoodHunger'],
      ['0xHEALFOOD', 'SURV_EffectTypeFoodHealing'],
    ]);
    const result = await translateGrantedPerk(
      {
        client: grantedPerkClient(perkFormId, perk, carnivoreEdids),
        routes: new Map(),
        edidByFormId: carnivoreEdids,
      },
      'Mutation_Carnivore',
      perkFormId,
    );
    expect(result.modifiers).toEqual([]);
    expect(result.notes).toContain(
      'perk Mutation_EatAllTheMeat_Perk: entry point Mod Spell Magnitude — not modeled',
    );
    expect(
      resolveStimpakHealEntryPoint('Mod Spell Magnitude', perkFormId, [], carnivoreEdids),
    ).toBe(null);
  });

  it('excludes Code Blue stimpak buff perk by FormID despite matching keywords', async () => {
    const perkFormId = '0x006446B8';
    const perk = {
      editor_id: 'XPD_Fuel_CodeBlue_StimpakBuffPerk',
      fields: {
        Effects: [
          {
            Effect: entryPointEffect(
              'Mod Spell Magnitude',
              1.25,
              wrapPerkConditions(stimpakKeywordOrGroup([KW.STIM])),
            ),
          },
        ],
      },
    };
    const result = await translateGrantedPerk(
      {
        client: grantedPerkClient(perkFormId, perk),
        routes: new Map(),
        edidByFormId: stimpakEdids,
      },
      'XPD_Fuel_CodeBlue',
      perkFormId,
    );
    expect(result.modifiers).toEqual([]);
    expect(result.notes).toContain(
      'perk XPD_Fuel_CodeBlue_StimpakBuffPerk: entry point Mod Spell Magnitude — not modeled',
    );
  });

  function safeFoodKeywordOrGroup(
    ingredientFormId: string,
    edidMap: Map<string, string>,
  ): RawCondition[] {
    const MEAT = '0xMEAT';
    const RAD = '0xRAD';
    const DISEASE = '0xDISEASE';
    const CHEM = '0xCHEM';
    edidMap.set(MEAT, 'IngredientTypeMeat');
    edidMap.set('0xVEG', 'IngredientTypeVegetable');
    edidMap.set(RAD, 'RadiationInjestion');
    edidMap.set(DISEASE, 'SURV_EffectTypeDiseaseVector');
    edidMap.set(CHEM, 'ChemEffect');
    return [
      {
        Function: 'EPMagic_SpellHasKeyword',
        'Parameter 1': ingredientFormId,
        'Comparison Value': 1,
        Operator: 'Equal To',
        'AND/OR': 'OR',
      },
      {
        Function: 'EPAlchemyEffectHasKeyword',
        'Parameter 1': RAD,
        'Comparison Value': 1,
        Operator: 'Equal To',
        'AND/OR': 'OR',
      },
      {
        Function: 'EPAlchemyEffectHasKeyword',
        'Parameter 1': DISEASE,
        'Comparison Value': 1,
        Operator: 'Equal To',
        'AND/OR': 'OR',
      },
      {
        Function: 'EPAlchemyEffectHasKeyword',
        'Parameter 1': CHEM,
        'Comparison Value': 1,
        Operator: 'Equal To',
      },
    ];
  }

  it('does not route Carnivore Safe Meat perk (ChemEffect-only overlap, 0x003C4054)', async () => {
    const perkFormId = '0x003C4054';
    const edids = new Map<string, string>();
    const keywordTab = safeFoodKeywordOrGroup('0xMEAT', edids);
    const perk = {
      editor_id: 'Mutation_EatSafeMeat_Perk',
      fields: {
        Effects: [
          {
            Effect: entryPointEffect('Mod Spell Magnitude', 1, wrapPerkConditions(keywordTab)),
          },
        ],
      },
    };
    expect(
      resolveStimpakHealEntryPoint('Mod Spell Magnitude', perkFormId, keywordTab, edids),
    ).toBeNull();
    const result = await translateGrantedPerk(
      {
        client: grantedPerkClient(perkFormId, perk, edids),
        routes: new Map(),
        edidByFormId: edids,
      },
      'Mutation_Carnivore',
      perkFormId,
    );
    expect(result.modifiers).toEqual([]);
    expect(result.notes).toContain(
      'perk Mutation_EatSafeMeat_Perk: entry point Mod Spell Magnitude — not modeled',
    );
  });

  it('does not route Herbivore Safe Veggies perk (ChemEffect-only overlap, 0x003C4059)', async () => {
    const perkFormId = '0x003C4059';
    const edids = new Map<string, string>();
    const keywordTab = safeFoodKeywordOrGroup('0xVEG', edids);
    const perk = {
      editor_id: 'Mutation_EatSafeVeggies_Perk',
      fields: {
        Effects: [
          {
            Effect: entryPointEffect('Mod Spell Magnitude', 1, wrapPerkConditions(keywordTab)),
          },
        ],
      },
    };
    expect(
      resolveStimpakHealEntryPoint('Mod Spell Magnitude', perkFormId, keywordTab, edids),
    ).toBeNull();
    const result = await translateGrantedPerk(
      {
        client: grantedPerkClient(perkFormId, perk, edids),
        routes: new Map(),
        edidByFormId: edids,
      },
      'Mutation_Herbivore',
      perkFormId,
    );
    expect(result.modifiers).toEqual([]);
    expect(result.notes).toContain(
      'perk Mutation_EatSafeVeggies_Perk: entry point Mod Spell Magnitude — not modeled',
    );
  });

  it('excludes WorldPets pet healing perk by FormID despite ChemTypeStimpack (0x008DC2CB)', async () => {
    const perkFormId = '0x008DC2CB';
    const perk = {
      editor_id: 'WorldPets_Healing_SpeedHealing',
      fields: {
        Effects: [
          {
            Effect: entryPointEffect(
              'Mod Spell Magnitude',
              1.5,
              wrapPerkConditions(stimpakKeywordOrGroup([KW.STIM])),
            ),
          },
        ],
      },
    };
    expect(
      resolveStimpakHealEntryPoint(
        'Mod Spell Magnitude',
        perkFormId,
        stimpakKeywordOrGroup([KW.STIM]),
        stimpakEdids,
      ),
    ).toBeNull();
    const result = await translateGrantedPerk(
      {
        client: grantedPerkClient(perkFormId, perk),
        routes: new Map(),
        edidByFormId: stimpakEdids,
      },
      'WorldPets_Healing',
      perkFormId,
    );
    expect(result.modifiers).toEqual([]);
    expect(result.notes).toContain(
      'perk WorldPets_Healing_SpeedHealing: entry point Mod Spell Magnitude — not modeled',
    );
  });
});
