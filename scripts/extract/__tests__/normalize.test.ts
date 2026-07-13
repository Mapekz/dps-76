import { describe, it, expect } from 'vitest';
import {
  translate,
  parseMagicEffects,
  repairMisattributedPerkEntryFields,
  getMgefInfo,
  type MgefInfo,
  type SpellEffect,
  type AvifRoute,
} from '../normalize/mgef';
import { flattenPerkConditionRows, translateConditions, type RawCondition } from '../normalize/conditions';
import type { EsmClient, EsmRecord } from '../esm-client';
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
    const curved = effect({ curvePoints: [{ x: 0.05, y: 130 }, { x: 1.0, y: 0 }], curveInputAv: '0x00000392' });
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
    expect(r.notes.some(n => n.includes('needs override'))).toBe(true);
  });

  it("carries curve.input 'healthCurrent' for a Peak Value Modifier effect on a routed AV (Juggernaut's-style)", () => {
    const routedAv = new Map<string, AvifRoute[]>([['0xAV', [{ bucket: 'dbm', scale: 0.01, rawConditions: [] }]]]);
    const curved = effect({ curvePoints: [{ x: 0, y: 0 }, { x: 1000, y: 100 }], curveInputAv: '0x000002D4' });
    const r = translate(mgef({ archetype: 'Peak Value Modifier' }), curved, routedAv, edids);
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0].curve?.input).toBe('healthCurrent');
  });

  it("carries curve.input 'intelligence' for a Peak Value Modifier effect on STAT_DmgMultEnergy (Science!-style)", () => {
    const scienceEdids = new Map<string, string>([['0xAV', 'STAT_DmgMultEnergy']]);
    const curved = effect({ curvePoints: [{ x: 0, y: 0 }, { x: 15, y: 0.3 }], curveInputAv: '0x000002C6' });
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
    expect(r.modifiers[0]).toEqual({ bucket: 'specialStrength', op: 'ADD', value: 3, conditions: [] });
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
          { Effect: { 'Base Effect': '0x007954D1', 'Effect Item Data': { 'Effect ID': 0, Magnitude: 50.0, Area: 0, Duration: 0 } } },
        ],
      },
    } as unknown as EsmRecord;
    const [parsed] = parseMagicEffects(record);
    expect(parsed.magnitude).toBe(50);
    expect(parsed.magnitudeGlobal).toBeNull();
  });

  it("carries curve.input 'weaponCondition' for Polished via its edid-keyed null-curve-input override", () => {
    const routedAv = new Map<string, AvifRoute[]>([['0xAV', [{ bucket: 'dbm', scale: 0.01, rawConditions: [] }]]]);
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
      edids
    );
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0].curve?.input).toBe('weaponCondition');
    expect(r.modifiers[0].curve ? r.modifiers[0].curveScale : null).toBeCloseTo(0.01, 10);
  });

  it('leaves an UNMATCHED null curve input at a different edid unresolved (not a blanket rule)', () => {
    const routedAv = new Map<string, AvifRoute[]>([['0xAV', [{ bucket: 'dbm', scale: 0.01, rawConditions: [] }]]]);
    const curved = effect({
      curvePoints: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      curveInputAv: null,
    });
    const r = translate(mgef({ edid: 'SomeOtherLegendaryEffect', archetype: 'Peak Value Modifier' }), curved, routedAv, edids);
    expect(r.modifiers).toHaveLength(0);
    expect(r.notes.some(n => n.includes('unmapped input AV null'))).toBe(true);
  });
});

describe('translate (Onslaught, 2026-07-12)', () => {
  it("carries curve.input 'onslaughtStacks' for a Peak Value Modifier on a routed AV (Whacker Smacker-style)", () => {
    const routedAv = new Map<string, AvifRoute[]>([['0xAV', [{ bucket: 'powerAttackBonus', scale: 0.01, rawConditions: [] }]]]);
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

describe('getMgefInfo (consumables overhaul, 2026-07-13)', () => {
  // Fixture is verbatim `esm -p get FortifyStrengthChemEffect --json` output
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
            'Magic Effect Data': { Data: { Archetype: { name: 'Value Modifier' }, Flags: { value: '0x0', flags: [] } } },
          },
        } as unknown as EsmRecord;
      },
    } as unknown as EsmClient;
    const info = await getMgefInfo(bareClient, '0xBARE');
    expect(info.keywords).toEqual([]);
    expect(info.dispelWithKeywords).toBe(false);
  });
});

describe('repairMisattributedPerkEntryFields (esm CLI quirk, 2026-07-12)', () => {
  // Verified via `esm get --raw` byte inspection: an Ability entry is always
  // a bare PRKE+DATA+PRKF triple with no scalar param of its own, so a
  // trailing Float/Perk-Conditions group can only belong to the FOLLOWING
  // Entry Point — but the esm tool's JSON serializer attaches it to the
  // PRECEDING Ability instead (GuerrillaExpert01/GunslingerExpert01 pattern).
  const abilityFirst = () => [
    {
      'Effect Header': { 'Effect Type': { name: 'Ability' } },
      Ability: '0xSPEL',
      'Perk Conditions': ['HasKeyword ranged'],
      Float: 3.0,
    },
    {
      'Effect Header': { 'Effect Type': { name: 'Entry Point' } },
      'Entry Point': { 'Entry Point': { name: 'Mod Max Consecutive Hits Allowed' }, Function: { name: 'Add Value' } },
    },
  ];

  it('moves Float and copies Perk Conditions from a preceding Ability entry onto the following Entry Point', () => {
    const effects = abilityFirst();
    repairMisattributedPerkEntryFields(effects);
    expect(effects[1].Float).toBe(3.0);
    expect(effects[1]['Perk Conditions']).toEqual(['HasKeyword ranged']);
    // The Ability keeps its own (correct) Perk Conditions — it still needs
    // them to gate its own grant — but loses the borrowed Float, which it
    // never consumed anyway.
    expect(effects[0]['Perk Conditions']).toEqual(['HasKeyword ranged']);
    expect('Float' in effects[0]).toBe(false);
  });

  it('is a no-op when the Entry Point already owns its Float (GuerrillaMaster01/GunslingerMaster01 pattern)', () => {
    const effects = [
      {
        'Effect Header': { 'Effect Type': { name: 'Entry Point' } },
        'Entry Point': { 'Entry Point': { name: 'Mod Max Consecutive Hits Allowed' }, Function: { name: 'Add Value' } },
        'Perk Conditions': ['HasKeyword ranged'],
        Float: 5.0,
      },
      { 'Effect Header': { 'Effect Type': { name: 'Ability' } }, Ability: '0xSPEL' },
    ];
    const before = JSON.parse(JSON.stringify(effects));
    repairMisattributedPerkEntryFields(effects);
    expect(effects).toEqual(before);
  });

  it('is a no-op for a single-effect record (GunslingerMaster01 pattern, no Ability to misattribute from)', () => {
    const effects = [
      {
        'Effect Header': { 'Effect Type': { name: 'Entry Point' } },
        'Entry Point': { 'Entry Point': { name: 'Mod Max Consecutive Hits Allowed' }, Function: { name: 'Add Value' } },
        'Perk Conditions': ['HasKeyword ranged'],
        Float: 10.0,
      },
    ];
    const before = JSON.parse(JSON.stringify(effects));
    repairMisattributedPerkEntryFields(effects);
    expect(effects).toEqual(before);
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
    const edidMap = new Map([['0xFERAL', 'ActorTypeFeralGhoul'], ['0xGHOUL', 'ActorTypeGhoul']]);
    const { conditions } = translateConditions([kw('0xFERAL', 'OR'), kw('0xGHOUL')], { edidByFormId: edidMap });
    expect(conditions).toEqual([{ kind: 'enemyTypeAny', keywordsOrRaces: ['ActorTypeFeralGhoul', 'ActorTypeGhoul'] }]);
  });

  it('consumes GetIsPlayer()=1 (granted-perk self-gate) instead of leaving it unresolved', () => {
    const row: RawCondition = { Function: 'GetIsPlayer', 'Comparison Value': 1, Operator: 'Equal To' };
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
});

describe('translateConditions (2026-07-11 condition kinds)', () => {
  it("dedupes Last Shot's GetLoadedAmmoCount()=0 + IsNextClipLastShot pair into ONE lastRound gate", () => {
    const rows: RawCondition[] = [
      { Function: 'GetLoadedAmmoCount', 'Comparison Value': 0, Operator: 'Equal To', 'Run On': 'Subject' },
      { Function: 'IsNextClipLastShot', 'Comparison Value': 0, Operator: 'Greater Than', 'Run On': 'Subject' },
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
    const { conditions } = translateConditions([row], { edidByFormId: new Map([['0xFIRE', 'DamageTypeFire']]) });
    expect(conditions).toEqual([{ kind: 'enemyHasActiveEffect', keyword: 'DamageTypeFire' }]);
  });

  it("translates GetGroupTargetCount == N and ≥ N to enemyGroupCount tiers (Encircler's)", () => {
    const eq: RawCondition = { Function: 'GetGroupTargetCount', 'Comparison Value': 3, Operator: 'Equal To', 'Run On': 'Subject' };
    const ge: RawCondition = { Function: 'GetGroupTargetCount', 'Comparison Value': 5, Operator: 'Greater Than Or Equal To', 'Run On': 'Subject' };
    expect(translateConditions([eq], { edidByFormId: new Map() }).conditions)
      .toEqual([{ kind: 'enemyGroupCount', count: 3 }]);
    expect(translateConditions([ge], { edidByFormId: new Map() }).conditions)
      .toEqual([{ kind: 'enemyGroupCount', count: 5, orMore: true }]);
  });

  it("translates GetPlayerTeammateCount == N to teammateCount and consumes the teammate GetDistance row (Fencer's)", () => {
    const rows: RawCondition[] = [
      { Function: 'GetPlayerTeammateCount', 'Comparison Value': 2, Operator: 'Equal To', 'Run On': 'Subject' },
      { Function: 'GetDistance', 'Parameter 1': null, 'Comparison Value': 2500, Operator: 'Less Than', 'Run On': 'Potential Players' },
    ];
    const { conditions, unresolved } = translateConditions(rows, { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'teammateCount', count: 2 }]);
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
    const { conditions, unresolved } = translateConditions([row], { edidByFormId: new Map([['0xIMMUNE', 'ImmuneToPoison']]) });
    expect(conditions).toEqual([]);
    expect(unresolved).toEqual([]);
  });

  it("translates GetIsPlayerGhoul to a playerIsGhoul gate (Gourmand's =0, Glowing Criticals =1)", () => {
    const human: RawCondition = { Function: 'GetIsPlayerGhoul', 'Comparison Value': 0, Operator: 'Equal To' };
    const ghoul: RawCondition = { Function: 'GetIsPlayerGhoul', 'Comparison Value': 1, Operator: 'Equal To' };
    expect(translateConditions([human], { edidByFormId: new Map() }).conditions)
      .toEqual([{ kind: 'playerIsGhoul', value: false }]);
    expect(translateConditions([ghoul], { edidByFormId: new Map() }).conditions)
      .toEqual([{ kind: 'playerIsGhoul', value: true }]);
  });

  it('leaves an off-pattern GetDistance row unresolved instead of silently consuming it', () => {
    const row: RawCondition = { Function: 'GetDistance', 'Comparison Value': 500, Operator: 'Less Than', 'Run On': 'Target' };
    const { conditions } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'unresolved', raw: 'GetDistance Less Than 500 on Target' }]);
  });
});

describe('translate (Damage-archetype DoT effects)', () => {
  it('emits a dotDamage modifier scoped to the resolved Resist Value element', () => {
    const dotEdids = new Map<string, string>([['0xResist', 'FireResist']]);
    const r = translate(
      mgef({ archetype: 'Damage', resistValue: '0xResist' }),
      effect({ magnitude: 12, duration: 5 }),
      noRoutes,
      dotEdids
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
      dotEdids
    );
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0]).toEqual({ bucket: 'dotDamage', op: 'ADD', value: 12, durationSec: 5, conditions: [] });
    expect(r.notes.some(n => n.includes('unmapped Resist Value'))).toBe(true);
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
      { noteUnroutedAvs: true }
    );
    expect(r.modifiers).toHaveLength(0);
    expect(r.notes.some(n => n.includes('no route for AV'))).toBe(true);
  });

  it('without noteUnroutedAvs: emits zero modifiers and NO such note (perk path unchanged)', () => {
    const r = translate(mgef({ actorValue: '0xLAC' }), effect({ magnitude: 10 }), noRoutes, leftAttackEdids);
    expect(r.modifiers).toHaveLength(0);
    expect(r.notes.some(n => n.includes('no route for AV'))).toBe(false);
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
    expect(conditions).toEqual([{ kind: 'unresolved', raw: 'GetValue(0x00000399) Greater Than Or Equal To 3' }]);
  });
});

describe('translateConditions (Stage C4, gender-twin paired family — Action Boy/Girl)', () => {
  const ownFamily = ['0xAB01', '0xAB02', '0xAB03']; // simulated family (e.g. Action Boy)
  const pairedFamily = ['0xAG01', '0xAG02', '0xAG03']; // paired family (e.g. Action Girl)

  it('a single-row HasPerk on the paired family is consumed when the mirrored rank matches', () => {
    // Rank-1 simulation: mirrored paired rank is also 1, so paired rank-2
    // (index 1) is NOT owned — HasPerk(...)=0 wants "not owned" → satisfied.
    const row: RawCondition = { Function: 'HasPerk', 'Parameter 1': '0xAG02', 'Comparison Value': 0, Operator: 'Equal To' };
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
    const row: RawCondition = { Function: 'HasPerk', 'Parameter 1': '0xAG02', 'Comparison Value': 0, Operator: 'Equal To' };
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
      { Function: 'HasPerk', 'Parameter 1': '0xAB02', 'Comparison Value': 1, Operator: 'Equal To', 'AND/OR': 'OR' },
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
      { Function: 'HasPerk', 'Parameter 1': '0xAB02', 'Comparison Value': 1, Operator: 'Equal To', 'AND/OR': 'OR' },
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
      { Function: 'HasPerk', 'Parameter 1': '0xAB02', 'Comparison Value': 1, Operator: 'Equal To', 'AND/OR': 'OR' },
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

describe('flattenPerkConditionRows', () => {
  it('flattens tabbed perk conditions and forces Run On=Target for tab index 2', () => {
    const rows = flattenPerkConditionRows([
      {
        'Perk Condition': {
          'Run On (Tab Index)': 2,
          Conditions: [
            { Condition: { 'Condition Data': { Function: 'HasKeyword', 'Parameter 1': '0xKW', 'Comparison Value': 1 } } },
          ],
        },
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ Function: 'HasKeyword', 'Parameter 1': '0xKW', 'Run On': 'Target' });
  });

  it('returns [] for a non-array node', () => {
    expect(flattenPerkConditionRows(undefined)).toEqual([]);
  });
});
