import { describe, it, expect } from 'bun:test';
import {
  translate,
  translateEnchantment,
  translateGrantedPerk,
  parseMagicEffects,
  getMgefInfo,
  dedupeReloadStateFanout,
  ENTRY_POINT_BUCKETS,
  resolveStimpakHealEntryPoint,
  SHARED_ONSLAUGHT_COUNTER_AV,
  ARMOR_PENETRATION_AV,
  type MgefInfo,
  type MgefTranslationDeps,
  type SpellEffect,
  type AvifRoute,
  type TranslateOptions,
} from '../normalize/mgef';
import {
  flattenPerkConditionRows,
  translateConditions,
  type ConditionTranslationContext,
  type RawCondition,
} from '../normalize/conditions';
import type { EsmRecord, EsmSource } from '../esm-client';
import type { Bucket, Condition, CurveInput, ModifierFragment } from '@/types/modifiers';
import { createInMemoryEsmSource } from '../esm-source-fake';
import { extractPerks } from '../extract-perks';
import { effect, esmEffectConditions, fixtureClient, mgef } from './normalize-fixture';
import fortifyStrengthChemEffect from './fixtures/mgef-fortifystrengthchemeffect.json';
import quickHands01 from './fixtures/perk-quickhands01.json';
import bandito01 from './fixtures/perk-bandito01.json';
import crackshot01 from './fixtures/perk-crackshot01.json';
import fourLeafClover01 from './fixtures/perk-fourleafclover01.json';
import abPerkFourLeafClover from './fixtures/spel-abperkfourleafclover.json';
import abPerkFortifyCritFillOnMiss from './fixtures/mgef-abperkfortifyvatscritfillonmiss.json';
import abPerkBombScientist from './fixtures/spel-ghl-abperkbombscientist.json';
import abPerkFortifyDmgGrenades from './fixtures/mgef-abperkfortifydmggrenades.json';
import enchPowerArmorUnarmedDamage from './fixtures/ench-powerarmor-unarmeddamage.json';
import modArmorBrawlerPerk from './fixtures/perk-mod-armor-brawler.json';
import momVoiceofSetPerk from './fixtures/perk-mom-voiceofset.json';
import momVoiceofSetShockRobots from './fixtures/spel-mom-voiceofset-shockrobots.json';
import momVoiceofSetShockStunRobots from './fixtures/spel-mom-voiceofset-shockstunrobots.json';
import lgnLegendaryStrength01 from './fixtures/perk-lgn-legendarystrength01.json';
import abLgnPerkStrength from './fixtures/spel-ablgnperkstrength.json';
import lgnRetribution01 from './fixtures/perk-lgn-retribution01.json';
import modWeaponPenetrating from './fixtures/perk-mod-weapon-penetrating.json';
import gunFu01 from './fixtures/perk-gunfu01.json';
import gunFu02 from './fixtures/perk-gunfu02.json';
import gunFu03 from './fixtures/perk-gunfu03.json';
import enchSteady from './fixtures/ench-steady.json';
import mgefSteadyMeleeDamage from './fixtures/mgef-steady-melee-damage.json';
import paCommonArmPerk from './fixtures/perk-pa-common-arm.json';
import spellPaCommonArm from './fixtures/spell-pa-common-arm.json';
import enchPaCommonArm from './fixtures/ench-pa-common-arm.json';
import modKineticLiningPerk from './fixtures/perk-mod-kinetic-lining.json';

// Pins the PURE (sync) MGEF → IR translation with plain fixtures — no esm CLI
// client, no shell-out. The async gather lives in translateMagicEffect.

const noRoutes = new Map<string, AvifRoute[]>();
// AV resolves to a fallback route (STAT_SneakAttackBonus → sneakBonus, ×0.01).
const edids = new Map<string, string>([['0xAV', 'STAT_SneakAttackBonus']]);

const addMod = (bucket: Bucket, value: number, conditions: Condition[] = []): ModifierFragment => ({
  bucket,
  op: 'ADD',
  value,
  conditions,
});

interface ConditionCase {
  name: string;
  rows: RawCondition[];
  ctx?: Partial<ConditionTranslationContext>;
  conditions: Condition[] | null;
  unresolved?: string[];
}

function itTranslatesConditions(cases: ConditionCase[]): void {
  for (const row of cases) {
    it(row.name, () => {
      const { conditions, unresolved } = translateConditions(row.rows, {
        edidByFormId: new Map(),
        ...row.ctx,
      });
      expect(conditions).toEqual(row.conditions);
      expect(unresolved).toEqual(row.unresolved ?? []);
    });
  }
}

const eq = (fn: string, cmp: number, extra: Partial<RawCondition> = {}): RawCondition => ({
  Function: fn,
  'Comparison Value': cmp,
  Operator: 'Equal To',
  ...extra,
});

/** Raw `Perk Conditions` node; a bare row array is a tab with no `Run On (Tab Index)`. */
function perkConditions(...tabs: Array<RawCondition[] | { tab: number; rows: RawCondition[] }>) {
  return tabs.map((t) =>
    Array.isArray(t)
      ? { 'Perk Condition': esmEffectConditions(t) }
      : { 'Perk Condition': { 'Run On (Tab Index)': t.tab, ...esmEffectConditions(t.rows) } },
  );
}

function entryPointEffect(
  epName: string,
  functionName: string,
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    'Effect Header': { 'Effect Type': { name: 'Entry Point' } },
    'Entry Point': { 'Entry Point': { name: epName }, Function: { name: functionName } },
    ...fields,
  };
}

function perkRecord(editorId: string, ...effects: Record<string, unknown>[]) {
  return { editor_id: editorId, fields: { Effects: effects.map((e) => ({ Effect: e })) } };
}

function runGrantedPerk(
  client: EsmSource,
  contextEdid: string,
  perkFormId: string,
  deps: Partial<Omit<MgefTranslationDeps, 'client'>> = {},
) {
  return translateGrantedPerk(
    { client, routes: new Map(), edidByFormId: new Map(), ...deps },
    contextEdid,
    perkFormId,
  );
}

function runEnchantment(
  client: EsmSource,
  enchFormId: string,
  deps: Partial<Omit<MgefTranslationDeps, 'client'>> = {},
) {
  return translateEnchantment(
    { client, routes: new Map(), edidByFormId: new Map(), ...deps },
    enchFormId,
  );
}

describe('translate (pure MGEF → IR)', () => {
  it('skips non-value archetypes and reports an override note', () => {
    const r = translate(mgef({ archetype: 'Script' }), effect({ magnitude: 5 }), noRoutes, edids);
    expect(r.modifiers).toHaveLength(0);
    expect(r.notes.some((n) => n.includes('needs override'))).toBe(true);
  });
});

describe('translate (flat AV routes → one modifier)', () => {
  const flatRouteRows: Array<{
    name: string;
    avEdid: string;
    mgef?: Partial<MgefInfo>;
    effect: Partial<SpellEffect>;
    opts?: TranslateOptions;
    modifiers: ModifierFragment[];
  }> = [
    {
      name: 'emits a plain value modifier via a fallback route: value = magnitude × scale',
      avEdid: 'STAT_SneakAttackBonus',
      effect: { magnitude: 50 },
      modifiers: [addMod('sneakBonus', 0.5)],
    },
    {
      name: 'routes SPECIAL AVs at scale 1 (legendary +STR stars, chem SPECIAL buffs, 2026-07-10)',
      avEdid: 'Strength',
      effect: { magnitude: 3 },
      modifiers: [addMod('specialStrength', 3)],
    },
    {
      name: "routes STAT_DmgPerCrippled to dbm with a perCrippledLimb condition (Bully's, 2026-07-10)",
      avEdid: 'STAT_DmgPerCrippled',
      effect: { magnitude: 20 },
      modifiers: [addMod('dbm', 0.2, [{ kind: 'perCrippledLimb', max: 6 }])],
    },
    {
      name: "routes STAT_DmgVsClose to dbm with a targetDistance 'close' condition (Guerrilla, 2026-07-11)",
      avEdid: 'STAT_DmgVsClose',
      effect: { magnitude: 10 },
      modifiers: [addMod('dbm', 0.1, [{ kind: 'targetDistance', range: 'close' }])],
    },
    {
      name: "routes STAT_DmgVsFar to dbm with a targetDistance 'far' condition (Down Ranger, Sniper's, 2026-07-11)",
      avEdid: 'STAT_DmgVsFar',
      effect: { magnitude: 100 },
      modifiers: [addMod('dbm', 1.0, [{ kind: 'targetDistance', range: 'far' }])],
    },
    {
      name: "routes a flat Peak Value Modifier on STAT_LockpickingTier to the lockpickSkill bucket via the FALLBACK_AVIF_ROUTES fallback (Picklock/Master Infiltrator/Safecracker's-style grant, scale 1 not 0.01 — integer skill points)",
      avEdid: 'STAT_LockpickingTier',
      mgef: { archetype: 'Peak Value Modifier' },
      effect: { magnitude: 1 },
      modifiers: [addMod('lockpickSkill', 1)],
    },
    {
      name: 'routes a flat Peak Value Modifier on STAT_HackingTier to the hackingSkill bucket via FALLBACK_AVIF_ROUTES (scale 1 — integer skill points)',
      avEdid: 'STAT_HackingTier',
      mgef: { archetype: 'Peak Value Modifier' },
      effect: { magnitude: 1 },
      modifiers: [addMod('hackingSkill', 1)],
    },
    {
      name: 'routes a flat Peak Value Modifier on STAT_HealMultStimpak to the stimpakHealMult bucket via FALLBACK_AVIF_ROUTES (scale 1 — percent points)',
      avEdid: 'STAT_HealMultStimpak',
      mgef: { archetype: 'Peak Value Modifier' },
      effect: { magnitude: 30 },
      modifiers: [addMod('stimpakHealMult', 30)],
    },
    {
      name: 'routes STAT_DmgGrenade to thrown-grenade-scoped dbm (GHL_BombScientist shape, scale 0.01)',
      avEdid: 'STAT_DmgGrenade',
      mgef: { archetype: 'Peak Value Modifier' },
      effect: { magnitude: 50 },
      modifiers: [
        addMod('dbm', 0.5, [
          { kind: 'weaponKeyword', keyword: 'WeaponTypeThrown', present: true },
          { kind: 'weaponKeyword', keyword: 'WeaponTypeGrenade', present: true },
          { kind: 'weaponKeyword', keyword: 'WeaponTypeThrowingKnife', present: false },
        ]),
      ],
    },
    {
      name: "routes a Peak Value Modifier on AmmoSpenderMaxStacks to bulletStormMaxStacks (Heavy Gunner's abAmmoSpenderFortifyStacks-style flat magnitude, Bullet Storm 2026-07-16)",
      avEdid: 'AmmoSpenderMaxStacks',
      mgef: { archetype: 'Peak Value Modifier' },
      effect: { magnitude: 10 },
      modifiers: [addMod('bulletStormMaxStacks', 10)],
    },
    // AV routed via FALLBACK_AVIF_ROUTES['Strength'] (scale 1) so the sign of
    // the pushed value is a direct read of translate()'s negation logic.
    {
      name: 'negates a flat Peak Value Modifier magnitude when detrimental (Mutation_ReduceStrength-style: mag 3 → −3)',
      avEdid: 'Strength',
      mgef: { archetype: 'Peak Value Modifier', detrimental: true },
      effect: { magnitude: 3 },
      modifiers: [addMod('specialStrength', -3)],
    },
    {
      name: 'does NOT negate when detrimental is false (guard against over-negation)',
      avEdid: 'Strength',
      mgef: { archetype: 'Peak Value Modifier', detrimental: false },
      effect: { magnitude: 3 },
      modifiers: [addMod('specialStrength', 3)],
    },
    {
      name: 'routes a Contact-delivered Detrimental Peak Value Modifier on AV DamageResist to armorPenFlat with a positive value (Cosmic Knife Super-Heated-style: mag 25 → +25, 2026-08-06)',
      avEdid: 'DamageResist',
      mgef: { archetype: 'Peak Value Modifier', detrimental: true },
      effect: { magnitude: 25 },
      opts: { conditionCtx: { subjectIsTarget: true } },
      modifiers: [addMod('armorPenFlat', 25)],
    },
    {
      name: 'still routes the same MGEF shape Self-delivered to damageResistGain with negated magnitude (Barbarian/Rooted-style self-buff regression: mag 25 → −25)',
      avEdid: 'DamageResist',
      mgef: { archetype: 'Peak Value Modifier', detrimental: true },
      effect: { magnitude: 25 },
      modifiers: [addMod('damageResistGain', -25)],
    },
    {
      name: 'DamageDamageResistEffect Value Modifier Contact → armorPenFlat 0.5 (Sheepsquatch Shard, 2026-08-28)',
      avEdid: 'DamageResist',
      mgef: {
        edid: 'DamageDamageResistEffect',
        archetype: 'Value Modifier',
        actorValue: '0x000002E3',
        detrimental: true,
      },
      effect: { magnitude: 0.5, duration: 5 },
      opts: { conditionCtx: { subjectIsTarget: true } },
      modifiers: [addMod('armorPenFlat', 0.5)],
    },
    {
      name: "routes a Peak Value Modifier on AV Health to maxHealth (Adrenal Reaction's permanent max-HP cut, 2026-07-14)",
      avEdid: 'Health',
      mgef: { archetype: 'Peak Value Modifier' },
      effect: { magnitude: 25 },
      modifiers: [addMod('maxHealth', 25)],
    },
    {
      name: "routes a Peak Value Modifier on AV ActionPoints to apMax (FortifyActionPointsFood's +AP, 2026-07-15)",
      avEdid: 'ActionPoints',
      mgef: { archetype: 'Peak Value Modifier' },
      effect: { magnitude: 30 },
      modifiers: [addMod('apMax', 30)],
    },
    {
      name: "negates Scaly Skin's Detrimental Mutation_ReduceActionPoints (mag 50 → apMax −50)",
      avEdid: 'ActionPoints',
      mgef: { archetype: 'Peak Value Modifier', detrimental: true },
      effect: { magnitude: 50 },
      modifiers: [addMod('apMax', -50)],
    },
    {
      name: "routes AV ActionPointsRate to apRegenFlat at scale 1 (Company Tea's FortifyActionPointRegenFood +10)",
      avEdid: 'ActionPointsRate',
      mgef: { archetype: 'Peak Value Modifier' },
      effect: { magnitude: 10 },
      modifiers: [addMod('apRegenFlat', 10)],
    },
    {
      name: "routes STAT_DmgAP to a scaledByWeaponApCost dbm (Number Cruncher's abPerkFortifyDmgAP, mag 2 → 0.02/AP)",
      avEdid: 'STAT_DmgAP',
      mgef: { archetype: 'Peak Value Modifier' },
      effect: { magnitude: 2 },
      modifiers: [addMod('dbm', 0.02, [{ kind: 'scaledByWeaponApCost' }])],
    },
    {
      name: 'routes a flat Peak Value Modifier on STAT_VATSAccuracy to vatsHitChance (V.A.T.S. Enhanced-style: magnitude 50 → 0.50, Phase 4 2026-07-18)',
      avEdid: 'STAT_VATSAccuracy',
      mgef: { archetype: 'Peak Value Modifier' },
      effect: { magnitude: 50 },
      modifiers: [addMod('vatsHitChance', 0.5)],
    },
  ];

  for (const row of flatRouteRows) {
    it(row.name, () => {
      const av = row.mgef?.actorValue ?? '0xAV';
      const r = translate(
        mgef(row.mgef),
        effect(row.effect),
        noRoutes,
        new Map([[av, row.avEdid]]),
        row.opts,
      );
      expect(r.modifiers).toEqual(row.modifiers);
      expect(r.modifiers.some((m) => 'curve' in m)).toBe(false);
    });
  }
});

describe('translate (curve inputs)', () => {
  const curveInputRows: Array<{
    name: string;
    mgef?: Partial<MgefInfo>;
    route?: AvifRoute['bucket'];
    avEdid?: string;
    curvePoints: Array<{ x: number; y: number }>;
    curveInputAv: string;
    bucket: Bucket;
    conditions?: Condition[];
    input: CurveInput;
    curveScale?: number;
  }> = [
    {
      name: 'emits a curve modifier carrying curveScale (not value) when the effect has a curve',
      curvePoints: [
        { x: 0.05, y: 130 },
        { x: 1.0, y: 0 },
      ],
      curveInputAv: '0x00000392',
      bucket: 'sneakBonus',
      input: 'healthFraction',
    },
    {
      name: "carries curve.input 'healthCurrent' for a Peak Value Modifier effect on a routed AV (Juggernaut's-style)",
      mgef: { archetype: 'Peak Value Modifier' },
      route: 'dbm',
      curvePoints: [
        { x: 0, y: 0 },
        { x: 1000, y: 100 },
      ],
      curveInputAv: '0x000002D4',
      bucket: 'dbm',
      input: 'healthCurrent',
    },
    {
      name: "carries curve.input 'intelligence' for a Peak Value Modifier effect on STAT_DmgMultEnergy (Science!-style)",
      mgef: { archetype: 'Peak Value Modifier' },
      avEdid: 'STAT_DmgMultEnergy',
      curvePoints: [
        { x: 0, y: 0 },
        { x: 15, y: 0.3 },
      ],
      curveInputAv: '0x000002C6',
      bucket: 'dbm',
      conditions: [{ kind: 'damageTypeScope', types: ['energy'] }],
      input: 'intelligence',
      curveScale: 1,
    },
    {
      name: "carries curve.input 'weaponCondition' for Polished via the 0x0000039F engine-AV mapping (20260717 wired a real input AV; the old edid-keyed null-input override is retired)",
      mgef: { edid: 'Legendary_Weapon_PolishedPerkApplyEffect', archetype: 'Peak Value Modifier' },
      route: 'dbm',
      curvePoints: [
        { x: 1.0, y: 0 },
        { x: 2.0, y: 60 },
      ],
      curveInputAv: '0x0000039F',
      bucket: 'dbm',
      input: 'weaponCondition',
    },
    {
      name: "carries curve.input 'onslaughtStacks' for a Peak Value Modifier on a routed AV (Whacker Smacker-style, Onslaught 2026-07-12)",
      mgef: { archetype: 'Peak Value Modifier' },
      route: 'powerAttackBonus',
      curvePoints: [
        { x: 0, y: 0 },
        { x: 1, y: 5 },
        { x: 100, y: 500 },
      ],
      curveInputAv: '0x00000395',
      bucket: 'powerAttackBonus',
      input: 'onslaughtStacks',
    },
    {
      name: "carries curve.input 'lockpickSkill' for a curve keyed off STAT_LockpickingTier (0x0032CB37, Pirate Punch's unique-mod curve, 2026-08-04)",
      mgef: { archetype: 'Peak Value Modifier' },
      route: 'dbm',
      curvePoints: [
        { x: 0, y: 0 },
        { x: 1, y: 5 },
        { x: 20, y: 100 },
      ],
      curveInputAv: '0x0032CB37',
      bucket: 'dbm',
      input: 'lockpickSkill',
    },
    {
      name: "carries curve.input 'perception' for a Peak Value Modifier on STAT_VATSAccuracy (Awareness perk, Phase 4 2026-07-18)",
      mgef: { archetype: 'Peak Value Modifier' },
      avEdid: 'STAT_VATSAccuracy',
      curvePoints: [
        { x: 1, y: 5 },
        { x: 15, y: 18 },
        { x: 30, y: 30 },
        { x: 60, y: 45 },
        { x: 100, y: 50 },
      ],
      curveInputAv: '0x000002C3',
      bucket: 'vatsHitChance',
      input: 'perception',
    },
  ];

  for (const row of curveInputRows) {
    it(row.name, () => {
      const routes = row.route
        ? new Map([['0xAV', [{ bucket: row.route, scale: 0.01, rawConditions: [] }]]])
        : noRoutes;
      const r = translate(
        mgef(row.mgef),
        effect({ curvePoints: row.curvePoints, curveInputAv: row.curveInputAv }),
        routes,
        new Map([['0xAV', row.avEdid ?? 'STAT_SneakAttackBonus']]),
      );
      expect(r.modifiers).toHaveLength(1);
      const m = r.modifiers[0];
      expect(m.bucket).toBe(row.bucket);
      expect(m.conditions).toEqual(row.conditions ?? []);
      expect(m.curve?.input).toBe(row.input);
      // The scale becomes curveScale; there is no `value` on the curve variant.
      expect(m.curve ? m.curveScale : null).toBeCloseTo(row.curveScale ?? 0.01, 10);
      expect('value' in m).toBe(false);
    });
  }

  const nullInputRows = [
    {
      name: 'drops a Polished-shaped effect whose input AV went back to null (no blanket edid fallback anymore)',
      edid: 'Legendary_Weapon_PolishedPerkApplyEffect',
      curvePoints: [
        { x: 1.0, y: 0 },
        { x: 2.0, y: 60 },
      ],
    },
    {
      name: 'leaves an UNMATCHED null curve input at a different edid unresolved (not a blanket rule)',
      edid: 'SomeOtherLegendaryEffect',
      curvePoints: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    },
  ];

  for (const row of nullInputRows) {
    it(row.name, () => {
      const routedAv = new Map<string, AvifRoute[]>([
        ['0xAV', [{ bucket: 'dbm', scale: 0.01, rawConditions: [] }]],
      ]);
      const r = translate(
        mgef({ edid: row.edid, archetype: 'Peak Value Modifier' }),
        effect({ curvePoints: row.curvePoints, curveInputAv: null }),
        routedAv,
        edids,
      );
      expect(r.modifiers).toHaveLength(0);
      expect(r.notes.some((n) => n.includes('unmapped input AV null'))).toBe(true);
    });
  }
});

describe('parseMagicEffects (2026-07-11 A3/A4 routes)', () => {
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
});

describe('translateGrantedPerk (Medical Malpractice, 2026-08-05)', () => {
  it("routes Medical Malpractice's Add Actor Value Mult on Mod Weapon DMG Bonus Mult to dbm ADD with scaledBy stimpakHealMult", async () => {
    const perkFormId = '0x0050D7FD';
    const perk = perkRecord(
      'MedicalMalpractice_Perk',
      entryPointEffect('Mod Weapon DMG Bonus Mult', 'Add Actor Value Mult', {
        Float: 0.01,
        'Function Parameter 3 (Actor Value)': '0x00206F31',
      }),
    );
    const result = await runGrantedPerk(
      fixtureClient({ [perkFormId]: perk }),
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

describe('getMgefInfo (consumables overhaul, 2026-07-13)', () => {
  // Fixture is verbatim `esm get FortifyStrengthChemEffect --json` output
  // (20260710 ESM), formid 0x002466E6 — the "Chem: Fortify Strength" MGEF
  // Buffout's Effects list applies. Proof point from the plan: this MGEF
  // carries the "Dispel with Keywords" flag plus 3 keywords (ChemEffect,
  // StackBuffStrength, ChemDispelEffects) — StackBuffStrength is the
  // discriminating keyword that keeps chem STR buffs from colliding with
  // food STR buffs (which key off FoodDispelEffect_Strength instead).
  const stubClient = createInMemoryEsmSource({
    records: { '0x002466E6': fortifyStrengthChemEffect as unknown as EsmRecord },
  });

  it('parses keywords and dispelWithKeywords from the raw record shape', async () => {
    const info = await getMgefInfo(stubClient, '0x002466E6');
    expect(info.edid).toBe('FortifyStrengthChemEffect');
    expect(info.archetype).toBe('Peak Value Modifier');
    expect(info.keywords).toEqual(['0x0004D897', '0x00246704', '0x0037E0BB']);
    expect(info.dispelWithKeywords).toBe(true);
  });

  it('defaults keywords to [] and dispelWithKeywords to false when absent', async () => {
    const bareClient = createInMemoryEsmSource({
      records: {
        '0xBARE': {
          header: { signature: 'MGEF', form_id: '0xBARE' },
          editor_id: 'BareMgef',
          fields: {
            'Magic Effect Data': {
              Data: { Archetype: { name: 'Value Modifier' }, Flags: { value: '0x0', flags: [] } },
            },
          },
        } as unknown as EsmRecord,
      },
    });
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

  const healthPct = (
    fn: string,
    operator: string,
    cmp: number | string,
    extra: Partial<RawCondition> = {},
  ): RawCondition => ({ Function: fn, 'Comparison Value': cmp, Operator: operator, ...extra });

  itTranslatesConditions([
    {
      name: "resolves a GLOB-valued target GetHealthPercentage to enemyHealthBelowPct (Executioner's ≤ LGND_ExecuteHealthThreshold)",
      rows: [
        healthPct('GetHealthPercentage', 'Less Than Or Equal To', '0xGLOB', { 'Run On': 'Target' }),
      ],
      ctx: { globalValues: new Map([['0xGLOB', 0.4]]) },
      conditions: [{ kind: 'enemyHealthBelowPct', pct: 40 }],
    },
    {
      name: 'translates target GetHealthPercentage ≥ to enemyHealthAbovePct (Instigating ≥60%)',
      rows: [
        healthPct('GetHealthPercentage', 'Greater Than Or Equal To', 0.6, { 'Run On': 'Target' }),
      ],
      conditions: [{ kind: 'enemyHealthAbovePct', pct: 60 }],
    },
    {
      name: "translates player GetHealthPercentage ≤ to healthBelowPct with no inclusive flag (Foundation's Vengeance ≤0.25)",
      rows: [healthPct('GetHealthPercentage', 'Less Than Or Equal To', 0.25)],
      conditions: [{ kind: 'healthBelowPct', pct: 25 }],
    },
    {
      name: 'translates player GetHealthPercentage strict < to healthBelowPct with inclusive: false',
      rows: [healthPct('GetHealthPercentage', 'Less Than', 0.25)],
      conditions: [{ kind: 'healthBelowPct', pct: 25, inclusive: false }],
    },
    {
      name: 'translates target GetHealthPercentage strict < to enemyHealthBelowPct with inclusive: false',
      rows: [healthPct('GetHealthPercentage', 'Less Than', 0.4, { 'Run On': 'Target' })],
      conditions: [{ kind: 'enemyHealthBelowPct', pct: 40, inclusive: false }],
    },
    {
      name: 'translates target GetHealthPercentage strict > to enemyHealthAbovePct with inclusive: false',
      rows: [healthPct('GetHealthPercentage', 'Greater Than', 0.6, { 'Run On': 'Target' })],
      conditions: [{ kind: 'enemyHealthAbovePct', pct: 60, inclusive: false }],
    },
    {
      name: 'translates GetValuePercent(Health) strict < to healthBelowPct with inclusive: false (Emergency Protocols)',
      rows: [healthPct('GetValuePercent', 'Less Than', 0.2, { 'Parameter 1': '0x000002D4' })],
      conditions: [{ kind: 'healthBelowPct', pct: 20, inclusive: false }],
    },
    {
      name: 'translates GetValuePercent(Health) ≤ to healthBelowPct with no inclusive flag',
      rows: [
        healthPct('GetValuePercent', 'Less Than Or Equal To', 0.25, {
          'Parameter 1': '0x000002D4',
        }),
      ],
      conditions: [{ kind: 'healthBelowPct', pct: 25 }],
    },
    {
      name: 'translates GetValuePercent with non-Health param to unresolved (operator preserved)',
      rows: [healthPct('GetValuePercent', 'Equal To', 0, { 'Parameter 1': '0x000002EA' })],
      conditions: [
        expect.objectContaining({
          kind: 'unresolved',
          raw: expect.stringMatching(/GetValuePercent.*Equal To/),
        }),
      ],
      unresolved: ['GetValuePercent(0x000002EA) Equal To 0'],
    },
  ]);
});

describe('translateConditions (WornHasKeyword unique self-gate allowlist — Bullet Storm, 2026-07-16)', () => {
  const worn = (formId: string): RawCondition =>
    eq('WornHasKeyword', 1, { 'Parameter 1': formId, 'Run On': 'Subject' });

  itTranslatesConditions([
    {
      name: "translates WornHasKeyword(CustomItemName_FoundationsVengeance) to a weaponKeyword condition instead of unresolved (Foundation's Vengeance +5 max-stack tier)",
      rows: [worn('0xFV')],
      ctx: { edidByFormId: new Map([['0xFV', 'CustomItemName_FoundationsVengeance']]) },
      conditions: [
        { kind: 'weaponKeyword', keyword: 'CustomItemName_FoundationsVengeance', present: true },
      ],
    },
    {
      name: "translates WornHasKeyword(RD01_CustomItemName_Valkyrie) to a weaponKeyword condition (Valkyrie's spin-up curve gate)",
      rows: [worn('0xVLK')],
      ctx: { edidByFormId: new Map([['0xVLK', 'RD01_CustomItemName_Valkyrie']]) },
      conditions: [
        { kind: 'weaponKeyword', keyword: 'RD01_CustomItemName_Valkyrie', present: true },
      ],
    },
    {
      name: 'leaves an off-allowlist CustomItemName_* keyword (dn_TheActionHero) unresolved — deliberately not added, its gated effect is data-broken either way',
      rows: [worn('0xTAH')],
      ctx: { edidByFormId: new Map([['0xTAH', 'dn_TheActionHero']]) },
      conditions: [{ kind: 'unresolved', raw: 'WornHasKeyword(dn_TheActionHero)=1' }],
      unresolved: ['WornHasKeyword(dn_TheActionHero)=1'],
    },
  ]);
});

describe('translateConditions (tautologicalKeywords — Tone Death Well Tuned keyword-hook, 2026-08-20)', () => {
  const row: RawCondition = {
    Function: 'WornHasKeyword',
    'Parameter 1': '0x0064D000',
    'Comparison Value': 1,
    Operator: 'Equal To',
    'Run On': 'Subject',
  };
  const edidMap = new Map([['0x0064D000', 'CustomItemName_ToneDeath']]);

  it('leaves WornHasKeyword(CustomItemName_ToneDeath) unresolved off the unique self-gate allowlist', () => {
    const { conditions, unresolved } = translateConditions([row], { edidByFormId: edidMap });
    expect(conditions).toEqual([
      { kind: 'unresolved', raw: 'WornHasKeyword(CustomItemName_ToneDeath)=1' },
    ]);
    expect(unresolved).toEqual(['WornHasKeyword(CustomItemName_ToneDeath)=1']);
  });

  it('consumes WornHasKeyword(CustomItemName_ToneDeath) when listed as tautological (OMOD self-gate)', () => {
    const { conditions, unresolved } = translateConditions([row], {
      edidByFormId: edidMap,
      tautologicalKeywords: new Set(['CustomItemName_ToneDeath']),
    });
    expect(conditions).toEqual([]);
    expect(unresolved).toEqual([]);
  });
});

describe('translateConditions (GetIsPlayer — granted self-gate, subjectIsTarget Contact inversion 2026-07-14, Run On: Target 2026-07-18)', () => {
  itTranslatesConditions([
    {
      name: 'consumes GetIsPlayer()=1 (granted-perk self-gate) instead of leaving it unresolved',
      rows: [eq('GetIsPlayer', 1)],
      conditions: [],
    },
    {
      name: 'marks GetIsPlayer()=0 inactive in the default (granted-to-player) reading when subjectIsTarget is unset',
      rows: [eq('GetIsPlayer', 0)],
      conditions: null,
    },
    {
      name: 'consumes GetIsPlayer()=0 (the NPC branch) instead of marking it inactive, when subjectIsTarget is set',
      rows: [eq('GetIsPlayer', 0, { 'Run On': 'Subject' })],
      ctx: { subjectIsTarget: true },
      conditions: [],
    },
    {
      name: 'marks GetIsPlayer()=1 (the PVP-only branch) inactive when subjectIsTarget is set',
      rows: [eq('GetIsPlayer', 1, { 'Run On': 'Subject' })],
      ctx: { subjectIsTarget: true },
      conditions: null,
    },
    // flattenPerkConditionRows (normalize/conditions.ts) forces tab-index-2 rows'
    // Run On to 'Target' regardless of the raw ESM field — verified on
    // Legendary_Armor_BattleLoadersPerk 0x0079B522, whose tab 2 carries
    // "GetIsPlayer Equal To 0.0" meaning "the bashed target isn't a player"
    // (always true in PvE). Without this fix the row read as the SELF-gate
    // shape (wants=false → 'inactive'), silently killing the whole effect —
    // this is the same inversion `subjectIsTarget` already applies for
    // Contact-delivery ENCH/SPEL walks, driven here by the row's own Run On
    // field instead of a walk-scoped context flag.
    {
      name: "consumes GetIsPlayer(Target)=0 (the NPC-bashed-target branch, Battle-Loader's) instead of marking it inactive",
      rows: [eq('GetIsPlayer', 0, { 'Run On': 'Target' })],
      conditions: [],
    },
    {
      name: "marks GetIsPlayer(Target)=1 (the PVP-only branch, Battle-Loader's) inactive",
      rows: [eq('GetIsPlayer', 1, { 'Run On': 'Target' })],
      conditions: null,
    },
  ]);
});

describe('translateConditions (single-row gates)', () => {
  itTranslatesConditions([
    {
      name: 'consumes IsSprinting()=0 (not sprinting) instead of leaving it unresolved (non-sprint combat model, 2026-07-15)',
      rows: [eq('IsSprinting', 0)],
      conditions: [],
    },
    {
      name: 'marks IsSprinting()=1 (sprint-only) inactive',
      rows: [eq('IsSprinting', 1)],
      conditions: null,
    },
    {
      name: 'consumes IsSwimming()=0 (not swimming) instead of leaving it unresolved',
      rows: [eq('IsSwimming', 0)],
      conditions: [],
    },
    {
      name: 'marks IsSwimming()=1 (swim-only) inactive',
      rows: [eq('IsSwimming', 1)],
      conditions: null,
    },
    {
      name: 'maps WornHasKeyword(ArmorTypePower)=1 to inPowerArmor',
      rows: [eq('WornHasKeyword', 1, { 'Parameter 1': '0xPA', 'Run On': 'Subject' })],
      ctx: { edidByFormId: new Map([['0xPA', 'ArmorTypePower']]) },
      conditions: [{ kind: 'inPowerArmor', value: true }],
    },
    {
      name: "translates GetIsPlayerGhoul()=0 to a playerIsGhoul false gate (Gourmand's, 2026-07-11)",
      rows: [eq('GetIsPlayerGhoul', 0)],
      conditions: [{ kind: 'playerIsGhoul', value: false }],
    },
    {
      name: 'translates GetIsPlayerGhoul()=1 to a playerIsGhoul true gate (Glowing Criticals)',
      rows: [eq('GetIsPlayerGhoul', 1)],
      conditions: [{ kind: 'playerIsGhoul', value: true }],
    },
    {
      name: 'translates GetInIronSights Equal To 1 to aimingDownSights',
      rows: [eq('GetInIronSights', 1)],
      conditions: [{ kind: 'aimingDownSights', value: true }],
    },
    {
      name: 'translates IsPowerAttacking Equal To 0 to powerAttack false',
      rows: [eq('IsPowerAttacking', 0)],
      conditions: [{ kind: 'powerAttack', value: false }],
    },
    {
      name: 'translates IsPowerAttacking Equal To 1 to powerAttack true',
      rows: [eq('IsPowerAttacking', 1)],
      conditions: [{ kind: 'powerAttack', value: true }],
    },
    {
      name: 'translates GetIsInVATS Equal To 0 to vatsOnly false',
      rows: [eq('GetIsInVATS', 0)],
      conditions: [{ kind: 'vatsOnly', value: false }],
    },
    {
      name: 'translates GetIsInVATS Equal To 1 to vatsOnly true',
      rows: [eq('GetIsInVATS', 1)],
      conditions: [{ kind: 'vatsOnly', value: true }],
    },
    {
      name: 'translates IsMoving Equal To 0 to standingStill true (Steady, Rooted, Chameleon)',
      rows: [eq('IsMoving', 0)],
      conditions: [{ kind: 'standingStill', value: true }],
    },
    {
      name: 'translates IsMoving Equal To 1 to standingStill false',
      rows: [eq('IsMoving', 1)],
      conditions: [{ kind: 'standingStill', value: false }],
    },
    {
      name: 'translates HasCompletedChallenge Equal To 1 to lifetimeChallengeCompleted',
      rows: [eq('HasCompletedChallenge', 1, { 'Parameter 1': '0xCHAL' })],
      ctx: {
        edidByFormId: new Map([
          ['0xCHAL', 'Challenge_Lifetime_CraftScrap_Weapon_Tiers_Ranged_Pistols_Pipe'],
        ]),
      },
      conditions: [
        {
          kind: 'lifetimeChallengeCompleted',
          challengeId: 'Challenge_Lifetime_CraftScrap_Weapon_Tiers_Ranged_Pistols_Pipe',
        },
      ],
    },
    {
      name: 'IsMemberOfAPlayerTeam=1 → teammateCount ≥1 (Herd Mentality team bonus, 2026-07-14)',
      rows: [eq('IsMemberOfAPlayerTeam', 1)],
      conditions: [{ kind: 'teammateCount', count: 1, orMore: true }],
    },
    {
      name: 'IsMemberOfAPlayerTeam=0 → teammateCount 0 (Herd Mentality solo penalty)',
      rows: [eq('IsMemberOfAPlayerTeam', 0)],
      conditions: [{ kind: 'teammateCount', count: 0 }],
    },
    {
      name: 'maps IsMeleeAttacking()=0 to consumed (condition-whitelist round K, 2026-08-28)',
      rows: [eq('IsMeleeAttacking', 0)],
      conditions: [],
    },
    {
      name: 'maps IsMeleeAttacking()=1 to weaponAnimTypeMax ≤6',
      rows: [eq('IsMeleeAttacking', 1)],
      conditions: [{ kind: 'weaponAnimTypeMax', max: 6 }],
    },
  ]);
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

describe('translateGrantedPerk (Last Shot EP-198 Is Next Clip Last Shot, 2026-08-17)', () => {
  const globFormId = '0x006C20BB';
  const perkFormId = '0x0077176B';

  function lastShotClient(withGetRandomPercent: boolean): EsmSource {
    const rollConditions = withGetRandomPercent
      ? perkConditions([
          {
            Function: 'GetRandomPercent',
            'Comparison Value': globFormId,
            Operator: 'Less Than Or Equal To',
            'Run On': 'Subject',
          },
        ])
      : [];
    return fixtureClient({
      [perkFormId]: perkRecord(
        'Legendary_LastShot_Roll_Perk',
        entryPointEffect('Is Next Clip Last Shot', 'Add Value', {
          Float: 1,
          'Perk Conditions': rollConditions,
        }),
      ),
      [globFormId]: {
        header: { signature: 'GLOB', form_id: globFormId },
        editor_id: 'LGND_LastShotChance',
        fields: { Value: 25 },
      },
    });
  }

  it('maps GetRandomPercent-gated Add Value 1.0 to lastShotChance ADD 0.25 via LGND_LastShotChance', async () => {
    const result = await runGrantedPerk(
      lastShotClient(true),
      'mod_Legendary_Weapon2_Guns_LastShot',
      perkFormId,
    );
    expect(result.modifiers).toHaveLength(1);
    expect(result.modifiers[0]).toMatchObject({
      bucket: 'lastShotChance',
      op: 'ADD',
      value: 0.25,
    });
    // The GetRandomPercent roll IS the value, so it must NOT also survive as an
    // `unresolved` condition — that gate always fails in resolve.ts, which
    // would leave this modifier inert (`bun run audit:inert`).
    expect(result.modifiers[0]!.conditions).toEqual([]);
    expect(result.notes.some((n) => n.includes('Is Next Clip Last Shot — not modeled'))).toBe(
      false,
    );
  });

  it('without GetRandomPercent falls through to the generic not-modeled note (no lastShotChance modifier)', async () => {
    const result = await runGrantedPerk(
      lastShotClient(false),
      'mod_Legendary_Weapon2_Guns_LastShot',
      perkFormId,
    );
    expect(result.modifiers.filter((m) => m.bucket === 'lastShotChance')).toEqual([]);
    expect(result.notes).toContain(
      'perk Legendary_LastShot_Roll_Perk: entry point Is Next Clip Last Shot — not modeled',
    );
  });
});

describe('translateGrantedPerk (Tesla Science 5 EP-172 Mod Ammo Used Count, 2026-08-17)', () => {
  const teslaPerkFormId = '0x001F1BAA';
  const thirstZapperPerkFormId = '0xTHIRSTZAPPER';
  const thirstZapperKwFormId = '0xKWThirstZapper';

  function teslaScience05Perk(): Record<string, unknown> {
    // Tab 0 (the perk owner) carries the whole gate. Tab 1 — the weapon tab,
    // where ThirstZapper_WaterInfiniteAmmoPerk puts its keyword check below —
    // is declared by the real record but empty, which is why the emitted
    // modifier is ungated despite the perk's "Heavy guns" description.
    return perkRecord(
      'Magazine_TeslaScience05Perk',
      entryPointEffect('Mod Ammo Used Count', 'Multiply Value', {
        Float: 0,
        'Perk Conditions': perkConditions({
          tab: 0,
          rows: [
            {
              Function: 'GetRandomPercent',
              Operator: 'Less Than Or Equal To',
              'Comparison Value': 20,
              'Run On': 'Subject',
            },
          ],
        }),
      }),
    );
  }

  function thirstZapperAmmoPerk(): Record<string, unknown> {
    return perkRecord(
      'ThirstZapper_WaterInfiniteAmmoPerk',
      entryPointEffect('Mod Ammo Used Count', 'Set Value', {
        Float: 0,
        'Perk Conditions': perkConditions({
          tab: 1,
          rows: [eq('HasKeyword', 1, { 'Parameter 1': thirstZapperKwFormId, 'Run On': 'Subject' })],
        }),
      }),
    );
  }

  it('maps GetRandomPercent-gated Multiply Value 0.0 to ammoFreeChance ADD 0.2', async () => {
    const result = await runGrantedPerk(
      fixtureClient({ [teslaPerkFormId]: teslaScience05Perk() }),
      'Magazine_TeslaScience05Perk',
      teslaPerkFormId,
    );
    expect(result.modifiers).toHaveLength(1);
    expect(result.modifiers[0]).toMatchObject({
      bucket: 'ammoFreeChance',
      op: 'ADD',
      value: 0.2,
    });
    // The GetRandomPercent roll IS the value, so it must NOT also survive as an
    // `unresolved` condition — that gate always fails in resolve.ts, which
    // would leave this modifier inert (`bun run audit:inert`).
    expect(result.modifiers[0]!.conditions).toEqual([]);
    expect(result.notes.some((n) => n.includes('Mod Ammo Used Count — not modeled'))).toBe(false);
  });

  it('the Thirst Zapper shape falls through to the generic not-modeled note (no ammoFreeChance modifier)', async () => {
    const result = await runGrantedPerk(
      fixtureClient({ [thirstZapperPerkFormId]: thirstZapperAmmoPerk() }, (formId) =>
        formId === thirstZapperKwFormId ? 'WeaponTypeThirstZapper' : formId,
      ),
      'ThirstZapper_WaterInfiniteAmmoPerk',
      thirstZapperPerkFormId,
    );
    expect(result.modifiers.filter((m) => m.bucket === 'ammoFreeChance')).toEqual([]);
    expect(result.notes).toContain(
      'perk ThirstZapper_WaterInfiniteAmmoPerk: entry point Mod Ammo Used Count — not modeled',
    );
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

  it("flags `unresisted: true` and emits no damageTypeScope condition when the MGEF carries NO Resist Value AV at all (user-decided 2026-08-20: mechanically unresisted, expected to capture bleeds naturally — docs/assumptions.md 'DoT/proc resist provenance')", () => {
    const r = translate(
      mgef({ archetype: 'Damage', resistValue: null }),
      effect({ magnitude: 12, duration: 5 }),
      noRoutes,
      new Map(),
    );
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0]).toEqual({
      bucket: 'dotDamage',
      op: 'ADD',
      value: 12,
      durationSec: 5,
      conditions: [],
      unresisted: true,
    });
    // NOT the same as the unmapped-Resist-Value case below — no note, since
    // this isn't an extraction gap.
    expect(r.notes).toEqual([]);
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
  const unroutedRows = [
    {
      name: 'with noteUnroutedAvs: emits zero modifiers and a "no route for AV" note for a non-STAT_* unrouted AV',
      opts: { noteUnroutedAvs: true },
      noted: true,
    },
    {
      name: 'without noteUnroutedAvs: emits zero modifiers and NO such note (perk path unchanged)',
      opts: undefined,
      noted: false,
    },
  ];

  for (const row of unroutedRows) {
    it(row.name, () => {
      const r = translate(
        mgef({ actorValue: '0xLAC' }),
        effect({ magnitude: 10 }),
        noRoutes,
        new Map([['0xLAC', 'LeftAttackCondition']]),
        row.opts,
      );
      expect(r.modifiers).toHaveLength(0);
      expect(r.notes.some((n) => n.includes('no route for AV'))).toBe(row.noted);
    });
  }
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

describe('translate (AV pass-through — Barbarian/Mind Over Matter, 2026-08-03)', () => {
  // AbPerkFortifyStrength/AbPerkFortifyIntelligence shape: Peak Value
  // Modifier, magnitude 0, no curve table, effect-level Actor Value =
  // killStreak (0x00000399).
  const passThroughRows: Array<{ name: string; av: string; avEdid: string; bucket: Bucket }> = [
    {
      name: 'a zero-magnitude SPECIAL-fortify effect on the killStreak AV becomes an identity killStreak curve',
      av: '0xSTR',
      avEdid: 'Strength',
      bucket: 'specialStrength',
    },
    {
      name: 'applies the same pass-through to Intelligence (Mind Over Matter)',
      av: '0xINT',
      avEdid: 'Intelligence',
      bucket: 'specialIntelligence',
    },
  ];

  for (const row of passThroughRows) {
    it(row.name, () => {
      const r = translate(
        mgef({ actorValue: row.av, archetype: 'Peak Value Modifier' }),
        effect({ magnitude: 0, curveInputAv: '0x00000399' }),
        noRoutes,
        new Map([[row.av, row.avEdid]]),
      );
      expect(r.notes).toEqual([]);
      expect(r.modifiers).toEqual([
        {
          bucket: row.bucket,
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
  }

  const keepsNoteRows = [
    // Same magnitude/curve/AV shape as Barbarian, but routed to a non-SPECIAL
    // bucket — mirrors Legendary_Armor_OvereaterAddValue (hungerThirstTier
    // AV), where an identity pass-through would be wrong.
    {
      name: 'a zero-magnitude NON-SPECIAL effect on the killStreak AV keeps the "needs override" note (no blanket rule)',
      av: '0xHUNGER',
      avEdid: 'HungerThirstTier',
      curveInputAv: '0x00000399',
    },
    {
      name: 'a zero-magnitude SPECIAL-fortify effect whose input AV is not in AV_PASSTHROUGH_DOMAINS keeps the note (ench_IntFromHacking)',
      av: '0xINT',
      avEdid: 'Intelligence',
      curveInputAv: '0x00356A14',
    },
  ];

  for (const row of keepsNoteRows) {
    it(row.name, () => {
      const r = translate(
        mgef({ actorValue: row.av, archetype: 'Peak Value Modifier' }),
        effect({ magnitude: 0, curveInputAv: row.curveInputAv }),
        noRoutes,
        new Map([[row.av, row.avEdid]]),
      );
      expect(r.modifiers).toHaveLength(0);
      expect(
        r.notes.some((n) => n.includes('zero magnitude, no curve — script/scaled, needs override')),
      ).toBe(true);
    });
  }

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

  const detrimentalRows = [
    {
      name: 'is true for a Detrimental-flagged MGEF (Mutation_ReduceStrength-style)',
      flags: ['Recover', 'Detrimental', 'No Duration', 'No Area'],
      detrimental: true,
    },
    {
      name: 'is false when the flag is absent (FortifyStrengthChemEffect-style)',
      flags: ['Recover', 'Dispel with Keywords', 'No Area'],
      detrimental: false,
    },
  ];

  for (const row of detrimentalRows) {
    it(row.name, async () => {
      const client = createInMemoryEsmSource({ getFallback: () => flagRecord(row.flags) });
      const info = await getMgefInfo(client, '0xFLAGS');
      expect(info.detrimental).toBe(row.detrimental);
    });
  }
});

describe('translate (Detrimental sign handling, 2026-07-14)', () => {
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
      unresisted: true,
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

describe('translate (instant-restore Value Modifier skips — Health 2026-07-14, AP 2026-07-15)', () => {
  // Documented out-of-scope skip (2026-07-15): instant restores no longer
  // pollute the unresolved report with "no route" notes — silence IS the
  // assertion now, alongside the empty modifier list.
  const instantRestoreRows = [
    {
      name: 'does NOT route a Value Modifier on AV Health (instant heals like RestoreHealthFood must stay unrouted)',
      avEdid: 'Health',
      magnitude: 25,
    },
    {
      name: 'skips a Value Modifier on AV ActionPoints silently (instant restores — RestoreActionPointsFood, Brain Bombs)',
      avEdid: 'ActionPoints',
      magnitude: 45,
    },
  ];

  for (const row of instantRestoreRows) {
    it(row.name, () => {
      const r = translate(
        mgef({ archetype: 'Value Modifier' }),
        effect({ magnitude: row.magnitude }),
        noRoutes,
        new Map([['0xAV', row.avEdid]]),
        { noteUnroutedAvs: true },
      );
      expect(r.modifiers).toHaveLength(0);
      expect(r.notes).toHaveLength(0);
    });
  }
});

describe('translateConditions (Class Freak rank tiers, 2026-07-14)', () => {
  // Real Grounded perk formids: ClassFreak01/02/03 = 0x00391F0E/11/12.
  const rank = (formId: string, cmp: number): RawCondition =>
    eq('HasPerk', cmp, { 'Parameter 1': formId });

  itTranslatesConditions([
    {
      name: 'tier 0 (below ClassFreak01): [HasPerk(01)=0] → [{min:0,max:0}]',
      rows: [rank('0x00391F0E', 0)],
      conditions: [{ kind: 'classFreakRank', min: 0, max: 0 }],
    },
    {
      name: 'tier 1 (ClassFreak01 only): [HasPerk(02)=0, HasPerk(01)=1] → [{0,1},{1,3}]',
      rows: [rank('0x00391F11', 0), rank('0x00391F0E', 1)],
      conditions: [
        { kind: 'classFreakRank', min: 0, max: 1 },
        { kind: 'classFreakRank', min: 1, max: 3 },
      ],
    },
    {
      name: 'tier 2 (ClassFreak02): [HasPerk(02)=1, HasPerk(03)=0] → [{2,3},{0,2}]',
      rows: [rank('0x00391F11', 1), rank('0x00391F12', 0)],
      conditions: [
        { kind: 'classFreakRank', min: 2, max: 3 },
        { kind: 'classFreakRank', min: 0, max: 2 },
      ],
    },
    {
      name: 'tier 3 (ClassFreak03): [HasPerk(03)=1] → [{3,3}]',
      rows: [rank('0x00391F12', 1)],
      conditions: [{ kind: 'classFreakRank', min: 3, max: 3 }],
    },
  ]);
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

describe('ENTRY_POINT_BUCKETS', () => {
  const entryPointBucketRows: Array<{ name: string; ep: string; bucket: Bucket | undefined }> = [
    {
      name: "maps 'Mod Weapon Attack Damage' to the wholeDamage bucket (Grounded's Charged Penalty, USER-RESOLVED, 2026-07-21)",
      ep: 'Mod Weapon Attack Damage',
      bucket: 'wholeDamage',
    },
    {
      name: "maps 'Mod Player Explosion Damage' to the baseDamage bucket (component-scoped standalone multiplier, currently inert)",
      ep: 'Mod Player Explosion Damage',
      bucket: 'baseDamage',
    },
    {
      name: "maps 'Mod Player Explosion Scale' to explosionRadiusBonus (STAT_DamagePerk Effects[30] → STAT_ExplosionRadius ×0.01, Grenadier 2026-07-29)",
      ep: 'Mod Player Explosion Scale',
      bucket: 'explosionRadiusBonus',
    },
    {
      name: "maps 'Mod Ammo Spender Max Reload Stack Mult' to bulletStormRetention (Lock and Load r1's EP210, Bullet Storm 2026-07-16)",
      ep: 'Mod Ammo Spender Max Reload Stack Mult',
      bucket: 'bulletStormRetention',
    },
    {
      name: "routes the 'Mod VATS Hit Chance' entry point to vatsHitChance (armor/chem/mutation Multiply-Value sources, Phase 4 2026-07-18)",
      ep: 'Mod VATS Hit Chance',
      bucket: 'vatsHitChance',
    },
    {
      name: 'registers Mod Target Damage Resistance as armorPen (unique weapons, 2026-08-04)',
      ep: 'Mod Target Damage Resistance',
      bucket: 'armorPen',
    },
    {
      name: 'leaves Is Next Clip Last Shot (EP-198) unregistered — only the GetRandomPercent roll routes (Last Shot, 2026-08-17)',
      ep: 'Is Next Clip Last Shot',
      bucket: undefined,
    },
    // Deliberate scope pin: EP-172 is NOT in ENTRY_POINT_BUCKETS so keyword/timed
    // variants reach the not-modeled note instead of a silent 100% free-ammo SET.
    {
      name: 'leaves Mod Ammo Used Count (EP-172) unregistered (Tesla Science 5, 2026-08-17)',
      ep: 'Mod Ammo Used Count',
      bucket: undefined,
    },
  ];

  for (const row of entryPointBucketRows) {
    it(row.name, () => {
      expect(ENTRY_POINT_BUCKETS[row.ep] as Bucket | undefined).toBe(row.bucket);
    });
  }
});

describe('translate (Grenadier / AbPerkFortifyExplosionRadius, 2026-07-29)', () => {
  const grenadierRows = [
    {
      name: 'routes a Peak Value Modifier on STAT_ExplosionRadius to explosionRadiusBonus (magnitude 50 → 0.5 via plumbing ×0.01)',
      magnitude: 50,
      value: 0.5,
    },
    {
      name: 'routes rank-2 magnitude 100 to explosionRadiusBonus value 1.0',
      magnitude: 100,
      value: 1.0,
    },
  ];

  for (const row of grenadierRows) {
    it(row.name, () => {
      const routedAv = new Map<string, AvifRoute[]>([
        ['0x00066997', [{ bucket: 'explosionRadiusBonus', scale: 0.01, rawConditions: [] }]],
      ]);
      const r = translate(
        mgef({ archetype: 'Peak Value Modifier', actorValue: '0x00066997' }),
        effect({ magnitude: row.magnitude }),
        routedAv,
        new Map([['0x00066997', 'STAT_ExplosionRadius']]),
      );
      expect(r.modifiers).toEqual([addMod('explosionRadiusBonus', row.value)]);
    });
  }
});

describe('translateGrantedPerk (GHL_BombScientist / AbPerkFortifyDmgGrenades, 2026-08-28)', () => {
  it('routes the granted ability SPEL through FALLBACK_AVIF_ROUTES STAT_DmgGrenade → thrown-grenade dbm', async () => {
    const perkFormId = '0x007A18EB';
    const spellFormId = '0x0084BF8A';
    const mgefFormId = '0x00854902';
    const grenadeAv = '0x008548FF';
    const client = fixtureClient(
      {
        [perkFormId]: {
          header: { signature: 'PERK', form_id: perkFormId },
          editor_id: 'GHL_BombScientist01',
          fields: {
            Effects: [
              {
                Effect: {
                  'Effect Header': { 'Effect Type': { name: 'Ability' } },
                  Ability: spellFormId,
                },
              },
            ],
          },
        } as unknown as EsmRecord,
        [spellFormId]: abPerkBombScientist as unknown as EsmRecord,
        [mgefFormId]: abPerkFortifyDmgGrenades as unknown as EsmRecord,
        [grenadeAv]: {
          header: { signature: 'AVIF', form_id: grenadeAv },
          editor_id: 'STAT_DmgGrenade',
          fields: {},
        },
      },
      (id) =>
        ({
          [grenadeAv]: 'STAT_DmgGrenade',
          '0x007A159A': 'GHL_BombScientist02',
          '0x007A159B': 'GHL_BombScientist03',
          '0x007F68BB': 'GHL_PowerGlowUseBasic',
        })[id] ?? id,
    );
    const result = await runGrantedPerk(client, 'GHL_BombScientist01', perkFormId, {
      edidByFormId: new Map([[grenadeAv, 'STAT_DmgGrenade']]),
    });
    expect(result.modifiers).toContainEqual(
      expect.objectContaining({
        bucket: 'dbm',
        op: 'ADD',
        value: 0.2,
        conditions: expect.arrayContaining([
          { kind: 'playerIsGhoul', value: true },
          { kind: 'weaponKeyword', keyword: 'WeaponTypeThrown', present: true },
          { kind: 'weaponKeyword', keyword: 'WeaponTypeGrenade', present: true },
          { kind: 'weaponKeyword', keyword: 'WeaponTypeThrowingKnife', present: false },
        ]),
      }),
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
  const recordFor = (formId: string): EsmRecord => {
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
                Conditions: esmEffectConditions([eq('GetIsPlayer', 0, { 'Run On': 'Subject' })]),
              },
            },
            {
              Effect: {
                'Base Effect': mgefFormId,
                'Effect Item Data': { Magnitude: 3, Duration: 6 },
                Conditions: esmEffectConditions([eq('GetIsPlayer', 1, { 'Run On': 'Subject' })]),
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
  const stubClient = createInMemoryEsmSource({ getFallback: recordFor });

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
    const recordForSelf = (formId: string): EsmRecord => {
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
    const selfClient = createInMemoryEsmSource({
      getFallback: recordForSelf,
    });
    const result = await runEnchantment(selfClient, selfEnchFormId);
    expect(result.targetType).toBe('Self');
    // Script archetype with no Perk to Apply and zero magnitude: no note, no modifier.
    expect(result.modifiers).toEqual([]);
  });
});

describe("dedupeReloadStateFanout (issue #42 — Electrician's reload-animation-state fan-out)", () => {
  const gunState = (value: number, wornHasNoReload: 1 | -1): SpellEffect =>
    effect({
      mgefFormId: '0xFANOUT',
      conditionRows: [
        {
          Function: 'WornHasKeyword',
          'Parameter 1': '0x007C2878',
          'Comparison Value': 1,
          Operator: wornHasNoReload === 1 ? 'Equal To' : 'Not Equal To',
        },
        { Function: 'GetActorGunState', 'Comparison Value': value, Operator: 'Equal To' },
      ],
    });

  it('collapses a 5-way GetActorGunState + WornHasKeyword(WeaponNoReload) fan-out to the first entry, classified reloadCycle', () => {
    const effects = [
      gunState(4, -1),
      gunState(7, 1),
      gunState(8, 1),
      gunState(9, 1),
      gunState(10, 1),
    ];
    const { effects: deduped, reloadCycleMgefFormIds } = dedupeReloadStateFanout(effects);
    expect(deduped).toEqual([effects[0]]);
    expect(reloadCycleMgefFormIds).toEqual(new Set(['0xFANOUT']));
  });

  it('leaves a lone GetActorGunState-gated effect alone (nothing to collapse, not classified)', () => {
    const effects = [gunState(4, -1)];
    const { effects: deduped, reloadCycleMgefFormIds } = dedupeReloadStateFanout(effects);
    expect(deduped).toEqual(effects);
    expect(reloadCycleMgefFormIds.size).toBe(0);
  });

  it('does not collapse effects sharing an mgefFormId when a condition row is NOT GetActorGunState/WornHasKeyword-shaped', () => {
    const other = effect({
      mgefFormId: '0xFANOUT',
      conditionRows: [{ Function: 'GetIsPlayer', 'Comparison Value': 1, Operator: 'Equal To' }],
    });
    const effects = [gunState(4, -1), other];
    const { effects: deduped, reloadCycleMgefFormIds } = dedupeReloadStateFanout(effects);
    expect(deduped).toEqual(effects);
    expect(reloadCycleMgefFormIds.size).toBe(0);
  });

  it('leaves unrelated effects (different mgefFormId) untouched and in original order', () => {
    const fanout = [gunState(4, -1), gunState(7, 1)];
    const unrelated = effect({ mgefFormId: '0xOTHER' });
    const effects = [fanout[0], unrelated, fanout[1]];
    const { effects: deduped, reloadCycleMgefFormIds } = dedupeReloadStateFanout(effects);
    expect(deduped).toEqual([fanout[0], unrelated]);
    expect(reloadCycleMgefFormIds).toEqual(new Set(['0xFANOUT']));
  });
});

describe("translateEnchantment (Electrician's reload-cycle proc chase, issue #42, 2026-08-19)", () => {
  // Real ESM chain (20260814 dump, esm-walk-verified): ENCH 0x00799381 (5
  // duplicate Script-archetype effects, one per GetActorGunState value, each
  // ALSO gated by WornHasKeyword(WeaponNoReload) — Not-Equal-To-1 for the
  // reload-capable state, Equal-To-1 for each no-reload animation state) →
  // MGEF 0x007AC46C (Perk to Apply 0x007AC46A) → PERK 0x007AC46A (Ability →
  // SPEL 0x007AC46B) → SPEL's own effect → MGEF 0x00799384 (Script, Explosion
  // 0x00799382, no Perk to Apply) → EXPL 0x00799382 (typed energy Damage
  // Types entry, curve 11→25, plus a residual flat Damage 0.01).
  const ENCH_ID = '0x00799381';
  const FANOUT_MGEF_ID = '0x007AC46C';
  const PERK_ID = '0x007AC46A';
  const SPEL_ID = '0x007AC46B';
  const EXPLOSION_MGEF_ID = '0x00799384';
  const EXPL_ID = '0x00799382';
  const ENERGY_RESIST_AV = '0x00060A81';

  const gunStateEffect = (value: number, wornHasNoReload: boolean) => ({
    Effect: {
      'Base Effect': FANOUT_MGEF_ID,
      'Effect Item Data': { Magnitude: 0, Area: 0, Duration: 0 },
      Conditions: esmEffectConditions([
        {
          Function: 'WornHasKeyword',
          'Parameter 1': '0x007C2878',
          'Comparison Value': 1,
          Operator: wornHasNoReload ? 'Equal To' : 'Not Equal To',
          'AND/OR': 'AND',
        },
        {
          Function: 'GetActorGunState',
          'Comparison Value': value,
          Operator: 'Equal To',
          'AND/OR': 'AND',
        },
      ]),
    },
  });

  const recordFor = (formId: string): EsmRecord => {
    if (formId === ENCH_ID) {
      return {
        header: { signature: 'ENCH', form_id: ENCH_ID },
        editor_id: 'ench_LegendaryWeapon_Electricians_Explosion',
        fields: {
          'Effect Data': { 'Target Type': { name: 'Self' } },
          Effects: [
            gunStateEffect(4, false),
            gunStateEffect(7, true),
            gunStateEffect(8, true),
            gunStateEffect(9, true),
            gunStateEffect(10, true),
          ],
        },
      } as unknown as EsmRecord;
    }
    if (formId === FANOUT_MGEF_ID) {
      return {
        header: { signature: 'MGEF', form_id: FANOUT_MGEF_ID },
        editor_id: 'Legendary_Weapon_ElectriciansAddPerkEffect',
        fields: {
          'Magic Effect Data': {
            Data: {
              Archetype: { name: 'Script' },
              'Perk to Apply': PERK_ID,
              Flags: { value: '0x0', flags: [] },
            },
          },
        },
      } as unknown as EsmRecord;
    }
    if (formId === PERK_ID) {
      return {
        header: { signature: 'PERK', form_id: PERK_ID },
        editor_id: 'Legendary_Weapon_ElectriciansPerkSpell',
        fields: {
          Effects: [
            {
              Effect: {
                'Effect Header': { 'Effect Type': { name: 'Ability' } },
                Ability: SPEL_ID,
              },
            },
          ],
        },
      } as unknown as EsmRecord;
    }
    if (formId === SPEL_ID) {
      return {
        header: { signature: 'SPEL', form_id: SPEL_ID },
        editor_id: 'Legendary_Weapon_ElectriciansExplosionSpell',
        fields: {
          Effects: [
            {
              Effect: {
                'Base Effect': EXPLOSION_MGEF_ID,
                'Effect Item Data': { Magnitude: 0, Area: 50, Duration: 0 },
                'Cooldown Duration': 0,
              },
            },
          ],
        },
      } as unknown as EsmRecord;
    }
    if (formId === EXPLOSION_MGEF_ID) {
      return {
        header: { signature: 'MGEF', form_id: EXPLOSION_MGEF_ID },
        editor_id: 'Legendary_Weapon_ElectriciansApplyExplosionPerkEffect',
        fields: {
          'Magic Effect Data': {
            Data: {
              Archetype: { name: 'Script' },
              Explosion: EXPL_ID,
              Flags: { value: '0x1', flags: ['Hostile'] },
            },
          },
        },
      } as unknown as EsmRecord;
    }
    if (formId === EXPL_ID) {
      return {
        header: { signature: 'EXPL', form_id: EXPL_ID },
        editor_id: 'LegendaryEffect_Electricians_Explosion',
        fields: {
          Data: { Damage: 0.01, 'Base Weapon Damage Mult': 0 },
          'Damage Types': [
            {
              Type: ENERGY_RESIST_AV,
              Amount: 0,
              'Curve Table': {
                curve_path: 'LegendaryMods\\Weapon_ElectriciansEnergyDMG.json',
                curve: [
                  { x: 1, y: 11 },
                  { x: 50, y: 25 },
                ],
              },
            },
          ],
        },
      } as unknown as EsmRecord;
    }
    if (formId === '0x007C2878') {
      return {
        header: { signature: 'KYWD', form_id: '0x007C2878' },
        editor_id: 'WeaponNoReload',
        fields: {},
      } as unknown as EsmRecord;
    }
    throw new Error(`unexpected get(${formId})`);
  };

  const client = createInMemoryEsmSource({
    getFallback: recordFor,
    resolveEdidMap: { [ENERGY_RESIST_AV]: 'dtEnergy' },
  });
  const deps = {
    client,
    routes: new Map<string, AvifRoute[]>(),
    edidByFormId: new Map<string, string>(),
  };

  it('chases the deduped fan-out entry into exactly one reloadCycle proc, no ordinary modifiers', async () => {
    const result = await translateEnchantment(deps, ENCH_ID);
    expect(result.modifiers).toEqual([]);
    expect(result.notes).toEqual([
      'condition: WornHasKeyword(WeaponNoReload)=1',
      'condition: GetActorGunState()=4',
    ]);
    expect(result.procs).toEqual([
      {
        trigger: 'reloadCycle',
        components: [
          { damageType: 'explosive', damageTypeEdid: null, amount: 0.01, tier: null, curve: null },
          {
            damageType: 'energy',
            damageTypeEdid: 'dtEnergy',
            amount: 0,
            tier: null,
            curve: [
              { x: 1, y: 11 },
              { x: 50, y: 25 },
            ],
          },
        ],
      },
    ]);
  });
});

describe("translateGrantedPerk (Fracturer's Function-Type-5 onCripple proc, issue #42, 2026-08-19)", () => {
  // Real ESM chain (20260814 dump): PERK Legendary_Weapon_FracturersPerk
  // 0x00795778 — Entry Point 201 "Apply Spell On Actor When Limb Crippled",
  // Function Type 5 "Spell Item", Spell 0x00795779 → SPEL
  // Legendary_Weapon_FracturersExplosionSpell (Cooldown Duration 3) → MGEF
  // Legendary_Weapon_FracturersApplyPerkEffect 0x00795776 (Damage archetype,
  // Explosion 0x00795775, no Resist Value — the payload lives entirely on
  // the EXPL) → EXPL LegendaryEffect_Fracturers_Explosion (main curve 22→50,
  // flat Damage 150, no typed entries).
  const PERK_ID = '0x00795778';
  const SPEL_ID = '0x00795779';
  const MGEF_ID = '0x00795776';
  const EXPL_ID = '0x00795775';
  const KEYWORD_ID = '0x0079296B';

  const recordFor = (formId: string): EsmRecord => {
    if (formId === PERK_ID) {
      return {
        header: { signature: 'PERK', form_id: PERK_ID },
        editor_id: 'Legendary_Weapon_FracturersPerk',
        fields: {
          Effects: [
            {
              Effect: {
                'Effect Header': { 'Effect Type': { name: 'Entry Point' }, Rank: 1 },
                'Entry Point': {
                  'Entry Point': { name: 'Apply Spell On Actor When Limb Crippled' },
                  Function: { name: 'Select Spell' },
                },
                'Perk Conditions': perkConditions(
                  { tab: 0, rows: [eq('GetIsPlayer', 1, { 'Run On': 'Subject' })] },
                  {
                    tab: 1,
                    rows: [eq('HasKeyword', 1, { 'Parameter 1': KEYWORD_ID, 'Run On': 'Subject' })],
                  },
                  { tab: 2, rows: [eq('GetDead', 0, { 'Run On': 'Subject' })] },
                ),
                'Function Type': { value: 5, name: 'Spell Item' },
                Spell: SPEL_ID,
              },
            },
          ],
        },
      } as unknown as EsmRecord;
    }
    if (formId === SPEL_ID) {
      return {
        header: { signature: 'SPEL', form_id: SPEL_ID },
        editor_id: 'Legendary_Weapon_FracturersExplosionSpell',
        fields: {
          Data: { 'Target Type': { name: 'Contact' } },
          Effects: [
            {
              Effect: {
                'Base Effect': MGEF_ID,
                'Effect Item Data': { Magnitude: 1, Area: 100, Duration: 0 },
                'Cooldown Duration': 3,
              },
            },
          ],
        },
      } as unknown as EsmRecord;
    }
    if (formId === MGEF_ID) {
      return {
        header: { signature: 'MGEF', form_id: MGEF_ID },
        editor_id: 'Legendary_Weapon_FracturersApplyPerkEffect',
        fields: {
          'Magic Effect Data': {
            Data: {
              Archetype: { name: 'Damage' },
              Explosion: EXPL_ID,
              Flags: { value: '0x0', flags: [] },
            },
          },
        },
      } as unknown as EsmRecord;
    }
    if (formId === EXPL_ID) {
      return {
        header: { signature: 'EXPL', form_id: EXPL_ID },
        editor_id: 'LegendaryEffect_Fracturers_Explosion',
        fields: {
          Data: {
            'Damage Curve Table': {
              curve_path: 'LegendaryMods\\Weapon_FracturersExplosionDMG.json',
              curve: [
                { x: 1, y: 22 },
                { x: 50, y: 50 },
              ],
            },
            Damage: 150,
            'Base Weapon Damage Mult': 0,
          },
        },
      } as unknown as EsmRecord;
    }
    if (formId === KEYWORD_ID) {
      return {
        header: { signature: 'KYWD', form_id: KEYWORD_ID },
        editor_id: 'HasLegendary_Weapon_Fracturers',
        fields: {},
      } as unknown as EsmRecord;
    }
    throw new Error(`unexpected get(${formId})`);
  };

  const client = createInMemoryEsmSource({ getFallback: recordFor });
  const deps = {
    client,
    routes: new Map<string, AvifRoute[]>(),
    edidByFormId: new Map<string, string>(),
  };

  it("chases the Spell field into one onCripple proc, cooldownSec from the SPEL effect's own Cooldown Duration", async () => {
    const result = await translateGrantedPerk(
      deps,
      'mod_Legendary_Weapon4_Guns_Fracturers',
      PERK_ID,
    );
    expect(result.procs).toEqual([
      {
        trigger: 'onCripple',
        cooldownSec: 3,
        components: [
          {
            damageType: 'explosive',
            damageTypeEdid: null,
            amount: 150,
            tier: null,
            curve: [
              { x: 1, y: 22 },
              { x: 50, y: 50 },
            ],
          },
        ],
      },
    ]);
    expect(result.modifiers).toEqual([]);
  });
});

describe('translateGrantedPerk (Circuit Breaker Function-Type-5 lastRound proc, issue #42, 2026-08-19)', () => {
  // Real ESM chain (20260814 dump): PERK CircuitBreakerPerk 0x006EBCD6 — two
  // EP51 "Apply Combat Hit Spell" effects, both Function Type 5 "Spell Item"
  // gated GetLoadedAmmoCount < 1 (the lastRound Condition). Effect#0 → SPEL
  // 0x006EBCD8 → MGEF 0x006EBCD4 (Script, Explosion 0x006E20EB, VFX only —
  // no direct damage) → materializes nothing. Effect#1 → SPEL
  // CircuitbreakerImpactSpell 0x006EBCD7 → 3 effects: a Stunned-archetype
  // effect (skipped, no damage shape), CircuitBreaker_DamageHealthContact
  // 0x007452C3 (Damage, no Explosion, duration 0, curve 31→103, Resist
  // Value EnergyResist), and 0x006EBCD1 (same shape, curve 6→20, Area 50).
  const PERK_ID = '0x006EBCD6';
  const VFX_SPEL_ID = '0x006EBCD8';
  const VFX_MGEF_ID = '0x006EBCD4';
  const VFX_EXPL_ID = '0x006E20EB';
  const IMPACT_SPEL_ID = '0x006EBCD7';
  const STUN_MGEF_ID = '0x006EBCD3';
  const BIG_HIT_MGEF_ID = '0x007452C3';
  const SMALL_HIT_MGEF_ID = '0x006EBCD1';
  const ENERGY_RESIST_FORMID = '0x000002EB';

  const spellItemEffect = (spellFormId: string) => ({
    Effect: {
      'Effect Header': { 'Effect Type': { name: 'Entry Point' }, Rank: 0 },
      'Entry Point': {
        'Entry Point': { name: 'Apply Combat Hit Spell' },
        Function: { name: 'Select Spell' },
      },
      'Perk Conditions': perkConditions(
        {
          tab: 0,
          rows: [
            {
              Function: 'GetLoadedAmmoCount',
              'Comparison Value': 1,
              Operator: 'Less Than',
              'Run On': 'Subject',
            },
          ],
        },
        { tab: 2, rows: [eq('GetDead', 0, { 'Run On': 'Subject' })] },
      ),
      'Function Type': { value: 5, name: 'Spell Item' },
      Spell: spellFormId,
    },
  });

  const instantDamageMgef = (formId: string, name: string): EsmRecord =>
    ({
      header: { signature: 'MGEF', form_id: formId },
      editor_id: name,
      fields: {
        'Magic Effect Data': {
          Data: {
            Archetype: { name: 'Damage' },
            'Resist Value': ENERGY_RESIST_FORMID,
            Flags: { value: '0x0', flags: [] },
          },
        },
      },
    }) as unknown as EsmRecord;

  const recordFor = (formId: string): EsmRecord => {
    if (formId === PERK_ID) {
      return {
        header: { signature: 'PERK', form_id: PERK_ID },
        editor_id: 'CircuitBreakerPerk',
        fields: { Effects: [spellItemEffect(VFX_SPEL_ID), spellItemEffect(IMPACT_SPEL_ID)] },
      } as unknown as EsmRecord;
    }
    if (formId === VFX_SPEL_ID) {
      return {
        header: { signature: 'SPEL', form_id: VFX_SPEL_ID },
        editor_id: 'CircuitbreakerVFXSpell',
        fields: {
          Effects: [
            {
              Effect: {
                'Base Effect': VFX_MGEF_ID,
                'Effect Item Data': { Magnitude: 0, Area: 1, Duration: 0 },
                'Cooldown Duration': 0,
              },
            },
          ],
        },
      } as unknown as EsmRecord;
    }
    if (formId === VFX_MGEF_ID) {
      return {
        header: { signature: 'MGEF', form_id: VFX_MGEF_ID },
        editor_id: 'CircuitBreaker_ApplyExplosionEffect',
        fields: {
          'Magic Effect Data': {
            Data: {
              Archetype: { name: 'Script' },
              Explosion: VFX_EXPL_ID,
              Flags: { value: '0x0', flags: [] },
            },
          },
        },
      } as unknown as EsmRecord;
    }
    if (formId === VFX_EXPL_ID) {
      return {
        header: { signature: 'EXPL', form_id: VFX_EXPL_ID },
        editor_id: 'expl_circuitbreaker_vfx',
        fields: { Data: { Damage: 0, 'Base Weapon Damage Mult': 0 } },
      } as unknown as EsmRecord;
    }
    if (formId === IMPACT_SPEL_ID) {
      return {
        header: { signature: 'SPEL', form_id: IMPACT_SPEL_ID },
        editor_id: 'CircuitbreakerImpactSpell',
        fields: {
          Data: { 'Target Type': { name: 'Contact' } },
          Effects: [
            {
              Effect: {
                'Base Effect': STUN_MGEF_ID,
                'Effect Item Data': { Magnitude: 0, Area: 50, Duration: 5 },
                'Cooldown Duration': 10,
              },
            },
            {
              Effect: {
                'Base Effect': BIG_HIT_MGEF_ID,
                'Effect Item Data': { Magnitude: 31, Area: 0, Duration: 0 },
                'Curve Table': {
                  curve_path: 'Player\\Damage\\Damage_Universal_Tier24.json',
                  curve: [
                    { x: 1, y: 31 },
                    { x: 50, y: 103 },
                  ],
                },
                'Cooldown Duration': 0,
              },
            },
            {
              Effect: {
                'Base Effect': SMALL_HIT_MGEF_ID,
                'Effect Item Data': { Magnitude: 6, Area: 50, Duration: 0 },
                'Curve Table': {
                  curve_path: 'Player\\Damage\\Damage_Universal_Tier10.json',
                  curve: [
                    { x: 1, y: 6 },
                    { x: 50, y: 20 },
                  ],
                },
                'Cooldown Duration': 0,
              },
            },
          ],
        },
      } as unknown as EsmRecord;
    }
    if (formId === STUN_MGEF_ID) {
      return {
        header: { signature: 'MGEF', form_id: STUN_MGEF_ID },
        editor_id: 'CircuitBreakerEffect_Stun',
        fields: {
          'Magic Effect Data': {
            Data: { Archetype: { name: 'Stunned' }, Flags: { value: '0x0', flags: [] } },
          },
        },
      } as unknown as EsmRecord;
    }
    if (formId === BIG_HIT_MGEF_ID)
      return instantDamageMgef(BIG_HIT_MGEF_ID, 'CircuitBreaker_DamageHealthContact');
    if (formId === SMALL_HIT_MGEF_ID)
      return instantDamageMgef(SMALL_HIT_MGEF_ID, 'CircuitBreaker_SmallHit');
    if (formId === ENERGY_RESIST_FORMID) {
      return {
        header: { signature: 'AVIF', form_id: ENERGY_RESIST_FORMID },
        editor_id: 'EnergyResist',
        fields: {},
      } as unknown as EsmRecord;
    }
    throw new Error(`unexpected get(${formId})`);
  };

  const client = createInMemoryEsmSource({ getFallback: recordFor });
  const deps = {
    client,
    routes: new Map<string, AvifRoute[]>(),
    edidByFormId: new Map<string, string>(),
  };

  it('chases both Spell Item effects into one lastRound proc carrying both instant-damage components (the VFX-only cast contributes nothing)', async () => {
    const result = await translateGrantedPerk(deps, 'mod_Custom_CircuitBreaker_Effect', PERK_ID);
    expect(result.procs).toEqual([
      {
        trigger: 'lastRound',
        components: [
          {
            damageType: 'energy',
            damageTypeEdid: 'EnergyResist',
            amount: 31,
            tier: null,
            curve: [
              { x: 1, y: 31 },
              { x: 50, y: 103 },
            ],
            isAoe: false,
          },
          {
            damageType: 'energy',
            damageTypeEdid: 'EnergyResist',
            amount: 6,
            tier: null,
            curve: [
              { x: 1, y: 6 },
              { x: 50, y: 20 },
            ],
            isAoe: true,
          },
        ],
      },
    ]);
    expect(result.modifiers).toEqual([]);
  });
});

describe('translateGrantedPerk (Love Tap Function-Type-5 timed-buff gate, issue #80/#42, 2026-08-19)', () => {
  // Real ESM chain (20260814 dump): PERK LoveTapPerk 0x008F2AEB — EP173
  // "Apply Combat Melee Spell" ("Bashing Grants You and Teammates +30%
  // Damage for 30 Seconds"), Function Type 5 "Spell Item", Spell
  // 0x008F2AED → SPEL LoveTap → MGEF FortifyDamageAll 0x0018EEE0 (Peak Value
  // Modifier, Actor Value STAT_DmgAll 0x0018EEE1, Magnitude 30, Duration
  // 30). Before this fix, `chaseGrantedSpell`'s non-Ability call site (this
  // Function-Type-5 branch, `allowNestedGrant: false`) inherited whatever
  // `timedIsActive` the caller's `deps` carried — extract-omods.ts sets that
  // `true` as a blanket default for the OMOD pass, which suppressed
  // `translate()`'s `effect.duration > 0 && !opts.timedIsActive` timed-buff
  // gate and let the +30% fold as unconditional. `deps.timedIsActive: true`
  // below deliberately mirrors that blanket OMOD-pass default, to prove the
  // override inside `chaseGrantedSpell` — not just an absent default —
  // is what re-establishes the gate for this trigger-based grant.
  const PERK_ID = '0x008F2AEB';
  const SPEL_ID = '0x008F2AED';
  const MGEF_ID = '0x0018EEE0';
  const AV_ID = '0x0018EEE1';

  const recordFor = (formId: string): EsmRecord => {
    if (formId === PERK_ID) {
      return {
        header: { signature: 'PERK', form_id: PERK_ID },
        editor_id: 'LoveTapPerk',
        fields: {
          Effects: [
            {
              Effect: {
                'Effect Header': { 'Effect Type': { name: 'Entry Point' }, Rank: 0 },
                'Entry Point': {
                  'Entry Point': { name: 'Apply Combat Melee Spell' },
                  Function: { name: 'Select Spell' },
                },
                'Function Type': { value: 5, name: 'Spell Item' },
                Spell: SPEL_ID,
              },
            },
          ],
        },
      } as unknown as EsmRecord;
    }
    if (formId === SPEL_ID) {
      return {
        header: { signature: 'SPEL', form_id: SPEL_ID },
        editor_id: 'LoveTap',
        fields: {
          Data: { 'Target Type': { name: 'Self' } },
          Effects: [
            {
              Effect: {
                'Base Effect': MGEF_ID,
                'Effect Item Data': { Magnitude: 30, Area: 0, Duration: 30 },
                'Cooldown Duration': 0,
              },
            },
          ],
        },
      } as unknown as EsmRecord;
    }
    if (formId === MGEF_ID) {
      return {
        header: { signature: 'MGEF', form_id: MGEF_ID },
        editor_id: 'FortifyDamageAll',
        fields: {
          'Magic Effect Data': {
            Data: {
              Archetype: { name: 'Peak Value Modifier' },
              'Actor Value': AV_ID,
              Explosion: null,
              Flags: { value: '0x0', flags: [] },
            },
          },
        },
      } as unknown as EsmRecord;
    }
    throw new Error(`unexpected get(${formId})`);
  };

  const client = createInMemoryEsmSource({
    getFallback: recordFor,
    resolveEdidMap: { [AV_ID]: 'STAT_DmgAll' },
  });
  const routes = new Map<string, AvifRoute[]>([
    [AV_ID, [{ bucket: 'dbm', scale: 0.01, rawConditions: [] }]],
  ]);

  it('gates the +30% dbm behind a bashBuffUptime condition instead of folding it unconditionally', async () => {
    const result = await translateGrantedPerk(
      // timedIsActive: true mirrors extract-omods.ts's blanket OMOD-pass
      // default — see the describe-block comment above.
      { client, routes, edidByFormId: new Map(), timedIsActive: true },
      'E09C_mod_Custom_LoveTap',
      PERK_ID,
    );
    // Bash-triggered uptime scaling (user-directed 2026-08-20, issue #80/#42
    // follow-up) supersedes the generic `unresolved` timedBuff gate for this
    // EP173 "Apply Combat Melee Spell" trigger specifically — see
    // MgefTranslationDeps.bashTriggered and docs/assumptions.md
    // "Bash-triggered buff uptime".
    expect(result.modifiers).toEqual([
      {
        bucket: 'dbm',
        op: 'ADD',
        value: 0.3,
        conditions: [{ kind: 'bashBuffUptime', durationSec: 30 }],
      },
    ]);
    expect(result.notes).toContain(
      'perk LoveTapPerk: FortifyDamageAll: bash-triggered timedBuff(30s) — scaled by onBashBuffUptime',
    );
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

  it("routes Cultist Piercer's Mod Target Damage Resistance ×0.5 to armorPen ADD 0.5 vs Cryptids", async () => {
    const perkFormId = '0x0077B581';
    const perk = perkRecord(
      'CultistPiercer_Perk',
      entryPointEffect('Mod Target Damage Resistance', 'Multiply Value', {
        Float: 0.5,
        'Perk Conditions': perkConditions({
          tab: 2,
          rows: [eq('HasKeyword', 1, { 'Parameter 1': '0x00331AC2', 'Run On': 'Subject' })],
        }),
      }),
    );
    const result = await runGrantedPerk(
      fixtureClient({ [perkFormId]: perk }, cryptidEdids),
      'mod_custom_CultistPiercer_Effect',
      perkFormId,
      { edidByFormId: cryptidEdids },
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
    const perk = perkRecord(
      'EldersMark_Perk',
      entryPointEffect('Mod My Critical Hit Damage Mult', 'Add Actor Value Mult', {
        Float: 0.02,
        'Function Parameter 3 (Actor Value)': SHARED_ONSLAUGHT_COUNTER_AV,
      }),
    );
    const result = await runGrantedPerk(
      fixtureClient({ [perkFormId]: perk }, cryptidEdids),
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
    const perk = perkRecord(
      'custom_TickettoRevenge_Perk',
      entryPointEffect('Mod Target Damage Resistance', 'Multiply 1 + Actor Value Mult', {
        Float: -0.03,
        'Function Parameter 3 (Actor Value)': {
          formid: SHARED_ONSLAUGHT_COUNTER_AV,
          editor_id: 'ConsecutiveHitCount',
        },
      }),
    );
    const result = await runGrantedPerk(
      fixtureClient({ [perkFormId]: perk }, cryptidEdids),
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

  function stimpakKeywordOrGroup(formIds: string[]): RawCondition[] {
    return formIds.map((fid, i) => ({
      Function: 'EPAlchemyEffectHasKeyword',
      'Parameter 1': fid,
      'Comparison Value': 1,
      Operator: 'Equal To',
      ...(i < formIds.length - 1 ? { 'AND/OR': 'OR' } : {}),
    }));
  }

  const multiplyEp = (epName: string, float: number, conditions: unknown) =>
    entryPointEffect(epName, 'Multiply Value', { Float: float, 'Perk Conditions': conditions });

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
            Effect: multiplyEp(
              'Mod Spell Magnitude',
              1.67,
              perkConditions(stimpakKeywordOrGroup([KW.RAD, KW.STIM])),
            ),
          },
          {
            Effect: multiplyEp(
              'Mod Spell Duration',
              0.6,
              perkConditions(stimpakKeywordOrGroup([KW.RAD, KW.STIM])),
            ),
          },
          {
            Effect: multiplyEp(
              'Mod Spell Magnitude',
              1.67,
              perkConditions([
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
            Effect: multiplyEp(
              'Mod Spell Duration',
              0.6,
              perkConditions([
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

    const client = createInMemoryEsmSource({
      rows: [
        {
          form_id: formId,
          record_type: 'PERK',
          editor_id: 'FieldSurgeon01',
          name: 'Field Surgeon',
        },
      ],
      records: { [formId]: fieldSurgeon },
      getFallback: (id) =>
        ({
          header: { signature: 'PERK', form_id: id },
          editor_id: id,
          fields: {},
        }) as EsmRecord,
      resolveEdidMap: Object.fromEntries(stimpakEdids),
      resolveEdidFallback: (id) => id,
    });

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
        Effect: multiplyEp(
          'Mod Spell Magnitude',
          float,
          perkConditions([wornRow], stimpakKeywordOrGroup([KW.RADX, KW.RAD, KW.STIM])),
        ),
      };
    });
    const perk = {
      editor_id: 'LegendaryIncreaseHealingPerk',
      fields: { Effects: effects },
    };
    const result = await runGrantedPerk(
      fixtureClient({ [perkFormId]: perk }, stimpakEdids),
      'Legendary_IncreaseHealingEffect',
      perkFormId,
      { edidByFormId: stimpakEdids },
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
      Effect: multiplyEp(
        'Mod Spell Magnitude',
        float,
        perkConditions(classFreakTabs[i], suppressionRows, keywordTab),
      ),
    }));
    const perk = { editor_id: 'Mutation_ReduceChemEffect_Perk', fields: { Effects: effects } };
    const result = await runGrantedPerk(
      fixtureClient({ [perkFormId]: perk }, stimpakEdids),
      'Mutation_HealingFactor',
      perkFormId,
      { edidByFormId: stimpakEdids },
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

  function safeFoodTabs(ingredientFormId: string) {
    const edids = new Map<string, string>();
    return { edids, tabs: [safeFoodKeywordOrGroup(ingredientFormId, edids)] };
  }

  const unroutedRows: Array<{
    name: string;
    perkFormId: string;
    perkEdid: string;
    contextEdid: string;
    float: number;
    build: () => { edids: Map<string, string>; tabs: RawCondition[][] };
  }> = [
    {
      name: 'does not capture Carnivore food-scaling Mod Spell Magnitude (no stimpak keywords)',
      perkFormId: '0xCARNIVORE',
      perkEdid: 'Mutation_EatAllTheMeat_Perk',
      contextEdid: 'Mutation_Carnivore',
      float: 2,
      build: () => ({
        edids: new Map([
          ['0xMEAT', 'IngredientTypeMeat'],
          ['0xFOOD', 'SURV_EffectTypeFoodBuff'],
          ['0xHUNGER', 'SURV_EffectTypeFoodHunger'],
          ['0xHEALFOOD', 'SURV_EffectTypeFoodHealing'],
        ]),
        tabs: [
          [eq('EPMagic_SpellHasKeyword', 1, { 'Parameter 1': '0xMEAT' })],
          [
            eq('EPAlchemyEffectHasKeyword', 1, { 'Parameter 1': '0xFOOD', 'AND/OR': 'OR' }),
            eq('EPAlchemyEffectHasKeyword', 1, { 'Parameter 1': '0xHUNGER', 'AND/OR': 'OR' }),
            eq('EPAlchemyEffectHasKeyword', 1, { 'Parameter 1': '0xHEALFOOD' }),
          ],
        ],
      }),
    },
    {
      name: 'excludes Code Blue stimpak buff perk by FormID despite matching keywords',
      perkFormId: '0x006446B8',
      perkEdid: 'XPD_Fuel_CodeBlue_StimpakBuffPerk',
      contextEdid: 'XPD_Fuel_CodeBlue',
      float: 1.25,
      build: () => ({ edids: new Map(stimpakEdids), tabs: [stimpakKeywordOrGroup([KW.STIM])] }),
    },
    {
      name: 'does not route Carnivore Safe Meat perk (ChemEffect-only overlap, 0x003C4054)',
      perkFormId: '0x003C4054',
      perkEdid: 'Mutation_EatSafeMeat_Perk',
      contextEdid: 'Mutation_Carnivore',
      float: 1,
      build: () => safeFoodTabs('0xMEAT'),
    },
    {
      name: 'does not route Herbivore Safe Veggies perk (ChemEffect-only overlap, 0x003C4059)',
      perkFormId: '0x003C4059',
      perkEdid: 'Mutation_EatSafeVeggies_Perk',
      contextEdid: 'Mutation_Herbivore',
      float: 1,
      build: () => safeFoodTabs('0xVEG'),
    },
    {
      name: 'excludes WorldPets pet healing perk by FormID despite ChemTypeStimpack (0x008DC2CB)',
      perkFormId: '0x008DC2CB',
      perkEdid: 'WorldPets_Healing_SpeedHealing',
      contextEdid: 'WorldPets_Healing',
      float: 1.5,
      build: () => ({ edids: new Map(stimpakEdids), tabs: [stimpakKeywordOrGroup([KW.STIM])] }),
    },
  ];

  for (const row of unroutedRows) {
    it(row.name, async () => {
      const { edids, tabs } = row.build();
      expect(
        resolveStimpakHealEntryPoint('Mod Spell Magnitude', row.perkFormId, tabs.flat(), edids),
      ).toBeNull();
      const perk = perkRecord(
        row.perkEdid,
        multiplyEp('Mod Spell Magnitude', row.float, perkConditions(...tabs)),
      );
      const result = await runGrantedPerk(
        fixtureClient({ [row.perkFormId]: perk }, edids),
        row.contextEdid,
        row.perkFormId,
        { edidByFormId: edids },
      );
      expect(result.modifiers).toEqual([]);
      expect(result.notes).toContain(
        `perk ${row.perkEdid}: entry point Mod Spell Magnitude — not modeled`,
      );
    });
  }
});

describe('extraction pile-1 routes (2026-08-28)', () => {
  const LUCK_AV = '0x000002C8';
  const CRIT_FILL_AV = '0x007ACE6E';
  const STRENGTH_AV = '0x000002C2';
  const UNARMED_DAMAGE_AV = '0x000002DF';
  const SHOCK_MGEF = '0x000856FC';
  const PARALYZE_MGEF = '0x0005240C';
  const BRAWLER_AV = '0x00245B9C';
  const H2H_KW = '0x00226453';
  const UNARMED_KW = '0x0005240E';

  it('mod_weapon_NitroFortunate EP211 Mod Add Bullet To Clip Chance → ammoFreeChance ADD float/100', async () => {
    const perkFormId = '0x00844607';
    const nitroTab = (keyword: string) =>
      perkConditions({ tab: 0, rows: [eq('WornHasKeyword', 1, { 'Parameter 1': keyword })] });
    const nitroFortunatePerk = perkRecord(
      'mod_weapon_NitroFortunate',
      entryPointEffect('Mod Add Bullet To Clip Chance', 'Set Value', {
        'Perk Conditions': nitroTab('0x008445CC'),
        Float: 21,
      }),
      entryPointEffect('Mod Add Bullet To Clip Chance', 'Set Value', {
        'Perk Conditions': nitroTab('0x008445CB'),
        Float: 14,
      }),
    );
    const result = await runGrantedPerk(
      fixtureClient({ [perkFormId]: nitroFortunatePerk }),
      'mod_weapon_NitroFortunate',
      perkFormId,
      {
        edidByFormId: new Map([
          ['0x008445CC', 'Nitro_4Mod'],
          ['0x008445CB', 'Nitro_6Mod'],
        ]),
      },
    );
    expect(result.modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'ammoFreeChance', op: 'ADD', value: 0.21 }),
    );
    expect(result.modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'ammoFreeChance', op: 'ADD', value: 0.14 }),
    );
    expect(
      result.notes.some((n) => n.includes('Mod Add Bullet To Clip Chance — not modeled')),
    ).toBe(false);
  });

  it('QuickHands01 EP182 Auto Fill Weapon Clip → reloadSkipChance ADD 0.06', async () => {
    const perkFormId = '0x000221FC';
    const result = await runGrantedPerk(
      fixtureClient({ [perkFormId]: quickHands01 }),
      'QuickHands01',
      perkFormId,
      { edidByFormId: new Map([['0x001D2478', 'QuickHands02']]) },
    );
    const mod = result.modifiers.find((m) => m.bucket === 'reloadSkipChance');
    expect(mod).toEqual(
      expect.objectContaining({ bucket: 'reloadSkipChance', op: 'ADD', value: 0.06 }),
    );
    expect(
      mod!.conditions.some((c) => c.kind === 'unresolved' && c.raw.startsWith('GetRandomPercent')),
    ).toBe(false);
    expect(result.notes.some((n) => n.includes('GetRandomPercent'))).toBe(false);
  });

  it('Bandito01 EP141 Mod Gun Range Mult → weaponMinRange + weaponMaxRange MUL_ADD 0.25', async () => {
    const perkFormId = '0x002593D5';
    const result = await runGrantedPerk(
      fixtureClient({ [perkFormId]: bandito01 }),
      'Bandito01',
      perkFormId,
      {
        edidByFormId: new Map([
          ['0x002593D5', 'Bandito02'],
          ['0x0004A0A0', 'WeaponTypePistol'],
          ['0x0004A0A2', 'WeaponTypeShotgun'],
          ['0x0004A0A3', 'WeaponTypeRifle'],
        ]),
      },
    );
    expect(result.modifiers.filter((m) => m.bucket === 'weaponMinRange')).toEqual([
      expect.objectContaining({ op: 'MUL_ADD', value: 0.25 }),
    ]);
    expect(result.modifiers.filter((m) => m.bucket === 'weaponMaxRange')).toEqual([
      expect.objectContaining({ op: 'MUL_ADD', value: 0.25 }),
    ]);
  });

  it('ModArmorPenetrationPerk × ArmorPenetration AV → armorPen ADD carrier×|float|', async () => {
    const perkFormId = '0x001F4166';
    const perk = perkRecord(
      'ModArmorPenetrationPerk',
      entryPointEffect('Mod Target Damage Resistance', 'Multiply 1 + Actor Value Mult', {
        Float: -0.01,
        'Function Parameter 3 (Actor Value)': ARMOR_PENETRATION_AV,
      }),
    );
    const result = await runGrantedPerk(
      fixtureClient({ [perkFormId]: perk }),
      '_PARENT_mod_melee_weapon_Spikes',
      perkFormId,
      {
        edidByFormId: new Map([[ARMOR_PENETRATION_AV, 'ArmorPenetration']]),
        armorPenetrationAvMagnitude: 16,
      },
    );
    expect(result.modifiers).toEqual([
      { bucket: 'armorPen', op: 'ADD', value: 0.16, conditions: [] },
    ]);
  });

  it('Crackshot01 EP141 Mod Gun Range Mult → weaponMinRange + weaponMaxRange MUL_ADD 0.1', async () => {
    const perkFormId = '0x0031D4AF';
    const result = await runGrantedPerk(
      fixtureClient({ [perkFormId]: crackshot01 }),
      'Crackshot01',
      perkFormId,
      {
        edidByFormId: new Map([
          ['0x0031D4B0', 'Crackshot02'],
          ['0x0004A0A1', 'WeaponTypeSmallGun'],
          ['0x00226454', 'WeaponTypeH2H'],
          ['0x0004A0A0', 'WeaponTypePistol'],
          ['0x0004A0A3', 'WeaponTypeRifle'],
        ]),
      },
    );
    const rangeMods = result.modifiers.filter((m) => m.bucket === 'weaponMinRange');
    expect(rangeMods).toHaveLength(1);
    const frag = rangeMods[0];
    expect(frag && 'value' in frag ? frag.value : undefined).toBeCloseTo(0.1, 10);
    expect(frag?.op).toBe('MUL_ADD');
  });

  it('EnchPowerArmor_UnarmedDamage → baseDamage ADD 15 scoped to WeaponTypeUnarmed', async () => {
    const enchId = '0x001D6CCA';
    const mgefId = '0x001D6CCB';
    const result = await runEnchantment(
      fixtureClient({
        [enchId]: enchPowerArmorUnarmedDamage,
        [mgefId]: {
          header: { signature: 'MGEF', form_id: mgefId },
          editor_id: 'PowerArmor_FortifyUnarmedDamage',
          fields: {
            'Magic Effect Data': {
              Data: {
                Archetype: { name: 'Peak Value Modifier' },
                'Actor Value': UNARMED_DAMAGE_AV,
                Delivery: { name: 'Self' },
                Flags: { flags: [] },
              },
            },
          },
        },
      }),
      enchId,
      { edidByFormId: new Map([[UNARMED_DAMAGE_AV, 'UnarmedDamage']]) },
    );
    expect(result.modifiers).toContainEqual(
      expect.objectContaining({
        bucket: 'baseDamage',
        op: 'ADD',
        value: 15,
        conditions: [{ kind: 'weaponKeyword', keyword: 'WeaponTypeUnarmed', present: true }],
      }),
    );
  });

  it('mod_armor_BrawlerPerk → dbm ADD 0.1 with unarmed/H2H weapon gates', async () => {
    const perkFormId = '0x00245B9B';
    const result = await runGrantedPerk(
      fixtureClient({ [perkFormId]: modArmorBrawlerPerk }),
      'enchArmorBrawlerMod',
      perkFormId,
      {
        edidByFormId: new Map([
          [BRAWLER_AV, 'Mod_Brawler_AV'],
          [H2H_KW, 'WeaponTypeHandToHand'],
          [UNARMED_KW, 'WeaponTypeUnarmed'],
        ]),
      },
    );
    expect(result.modifiers).toContainEqual(
      expect.objectContaining({
        bucket: 'dbm',
        op: 'ADD',
        value: 0.1,
        conditions: expect.arrayContaining([expect.objectContaining({ kind: 'weaponKeywordAny' })]),
      }),
    );
  });

  it('FourLeafClover01 ability → critFill with luck curve', async () => {
    const perkFormId = '0x0004D895';
    const spellFormId = '0x007ACE71';
    const mgefFormId = '0x007ACE70';
    const result = await runGrantedPerk(
      fixtureClient({
        [perkFormId]: fourLeafClover01,
        [spellFormId]: abPerkFourLeafClover,
        [mgefFormId]: abPerkFortifyCritFillOnMiss,
        [CRIT_FILL_AV]: {
          header: { signature: 'AVIF', form_id: CRIT_FILL_AV },
          editor_id: 'STAT_VATSCritFillOnMiss',
          fields: {},
        },
        [LUCK_AV]: {
          header: { signature: 'AVIF', form_id: LUCK_AV },
          editor_id: 'Luck',
          fields: {},
        },
      }),
      'FourLeafClover01',
      perkFormId,
      {
        edidByFormId: new Map([
          [CRIT_FILL_AV, 'STAT_VATSCritFillOnMiss'],
          [LUCK_AV, 'Luck'],
        ]),
      },
    );
    expect(result.modifiers).toContainEqual(
      expect.objectContaining({
        bucket: 'critFill',
        op: 'ADD',
        curve: expect.objectContaining({ input: 'luck' }),
      }),
    );
  });

  it('LGN_LegendaryStrength_Perk01 ability → specialStrength ADD 1', async () => {
    const perkFormId = '0x0011C7DE';
    const spellFormId = '0x005CF181';
    const mgefFormId = '0x005CF17F';
    const result = await runGrantedPerk(
      fixtureClient({
        [perkFormId]: lgnLegendaryStrength01,
        [spellFormId]: abLgnPerkStrength,
        [mgefFormId]: {
          header: { signature: 'MGEF', form_id: mgefFormId },
          editor_id: 'AbLgnPerkFortifyStrength',
          fields: {
            'Magic Effect Data': {
              Data: {
                Archetype: { name: 'Dual Value Modifier' },
                'Actor Value': STRENGTH_AV,
                Delivery: { name: 'Self' },
              },
            },
          },
        },
        [STRENGTH_AV]: {
          header: { signature: 'AVIF', form_id: STRENGTH_AV },
          editor_id: 'Strength',
          fields: {},
        },
      }),
      'LGN_LegendaryStrength_Perk01',
      perkFormId,
      { edidByFormId: new Map([[STRENGTH_AV, 'Strength']]) },
    );
    expect(result.modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'specialStrength', op: 'ADD', value: 1 }),
    );
  });

  it('LGN_Retribution_Perk01 Mod Power Attack Damage Select Spell is note-only', async () => {
    const perkFormId = '0x005AE152';
    const result = await runGrantedPerk(
      fixtureClient({ [perkFormId]: lgnRetribution01 }),
      'LGN_Retribution_Perk01',
      perkFormId,
      { edidByFormId: new Map([['0x005AF818', 'LGN_Retribution_Perk02']]) },
    );
    expect(result.modifiers.filter((m) => m.bucket === 'powerAttackBonus')).toEqual([]);
    expect(result.notes.some((n) => n.includes('not powerAttackBonus'))).toBe(true);
  });

  it('mod_weapon_penetrating EP105 is note-only (not armorPen)', async () => {
    const perkFormId = '0x008B7A60';
    const result = await runGrantedPerk(
      fixtureClient({ [perkFormId]: modWeaponPenetrating }),
      'mod_custom_V63GatlingLaser_customName',
      perkFormId,
    );
    expect(result.notes.some((n) => n.includes('not armorPen'))).toBe(true);
  });

  it('MoM_VoiceofSetPerk EP51 shock spell → dotDamage with enemyType robot', async () => {
    const perkFormId = '0x00522668';
    const spellFormId = '0x0052266B';
    const upgradeSpellFormId = '0x00521937';
    const result = await runGrantedPerk(
      fixtureClient({
        [perkFormId]: momVoiceofSetPerk,
        [spellFormId]: momVoiceofSetShockRobots,
        [upgradeSpellFormId]: momVoiceofSetShockStunRobots,
        [SHOCK_MGEF]: {
          header: { signature: 'MGEF', form_id: SHOCK_MGEF },
          editor_id: 'dtElectricalEffectChanceAlways',
          fields: {
            'Magic Effect Data': {
              Data: {
                Archetype: { name: 'Damage' },
                'Resist Value': '0x000002EB',
                Flags: { flags: ['Hostile', 'Detrimental'] },
              },
            },
          },
        },
        [PARALYZE_MGEF]: {
          header: { signature: 'MGEF', form_id: PARALYZE_MGEF },
          editor_id: 'ParalyzeEffect25',
          fields: {
            'Magic Effect Data': {
              Data: {
                Archetype: { name: 'Paralysis' },
                Flags: { flags: ['Hostile', 'Recover', 'No Magnitude', 'No Area'] },
              },
            },
          },
        },
        '0x000002EB': {
          header: { signature: 'AVIF', form_id: '0x000002EB' },
          editor_id: 'EnergyResist',
          fields: {},
        },
        '0x0002CB73': {
          header: { signature: 'KYWD', form_id: '0x0002CB73' },
          editor_id: 'ActorTypeRobot',
          fields: {},
        },
        '0x004E60E2': {
          header: { signature: 'KYWD', form_id: '0x004E60E2' },
          editor_id: 'MoMEyeOfRaItemKeyword',
          fields: {},
        },
      }),
      'MoM_VoiceofSetPerk',
      perkFormId,
      {
        edidByFormId: new Map([
          ['0x000002EB', 'EnergyResist'],
          ['0x0002CB73', 'ActorTypeRobot'],
          ['0x004E60E2', 'MoMEyeOfRaItemKeyword'],
        ]),
        timedIsActive: false,
      },
    );
    expect(result.modifiers).toContainEqual(
      expect.objectContaining({
        bucket: 'dotDamage',
        op: 'ADD',
        value: 35,
        durationSec: 1,
        conditions: expect.arrayContaining([
          { kind: 'eyeOfRaWorn', value: false },
          expect.objectContaining({ kind: 'enemyType', keywordOrRace: 'ActorTypeRobot' }),
        ]),
      }),
    );
    expect(result.modifiers).toContainEqual(
      expect.objectContaining({
        bucket: 'dotDamage',
        op: 'ADD',
        value: 70,
        durationSec: 1,
        conditions: expect.arrayContaining([
          { kind: 'eyeOfRaWorn', value: true },
          expect.objectContaining({ kind: 'enemyType', keywordOrRace: 'ActorTypeRobot' }),
        ]),
      }),
    );
    expect(result.notes.some((n) => n.includes('25% paralyze'))).toBe(true);
  });

  it('translateConditions consumes GetDead()=0, GetDead() Not Equal To 1, and drops IsEssential()=1', () => {
    const rows: RawCondition[] = [
      {
        Function: 'GetDead',
        'Comparison Value': 0,
        Operator: 'Equal To',
        'Run On': 'Target',
      },
    ];
    expect(translateConditions(rows, { edidByFormId: new Map() }).conditions).toEqual([]);
    const notEqual = translateConditions(
      [
        {
          Function: 'GetDead',
          'Comparison Value': 1,
          Operator: 'Not Equal To',
          'Run On': 'Target',
        },
      ],
      { edidByFormId: new Map() },
    );
    expect(notEqual.conditions).toEqual([]);
    const essential = translateConditions(
      [{ Function: 'IsEssential', 'Comparison Value': 1, Operator: 'Equal To' }],
      { edidByFormId: new Map() },
    );
    expect(essential.conditions).toBeNull();
  });

  it('GunFu01–03 → dbm MUL_ADD +30/60/90% gated on vatsOnly + vatsTargetIndex min 2/3/4', async () => {
    const cases = [
      { perk: gunFu01, formId: '0x0004D881', min: 2, value: 0.3 },
      { perk: gunFu02, formId: '0x001D244F', min: 3, value: 0.6 },
      { perk: gunFu03, formId: '0x001D245C', min: 4, value: 0.9 },
    ] as const;
    for (const { perk, formId, min, value } of cases) {
      const result = await runGrantedPerk(fixtureClient({ [formId]: perk }), 'GunFu01', formId);
      expect(result.modifiers).toContainEqual(
        expect.objectContaining({
          bucket: 'dbm',
          op: 'MUL_ADD',
          value: expect.closeTo(value, 10),
          conditions: expect.arrayContaining([
            { kind: 'vatsOnly', value: true },
            { kind: 'vatsTargetIndex', min },
          ]),
        }),
      );
    }
  });

  it('ench_LegendaryWeapon_Steady IsMoving()=0 → standingStill on melee dbm', async () => {
    const enchId = '0x00606C8A';
    const mgefId = '0x00606C8C';
    const result = await runEnchantment(
      fixtureClient({
        [enchId]: enchSteady,
        [mgefId]: mgefSteadyMeleeDamage,
      }),
      enchId,
      {
        routes: new Map([['0x00312D66', [{ bucket: 'dbm', scale: 0.01, rawConditions: [] }]]]),
        edidByFormId: new Map([['0x00312D66', 'MeleeDamage']]),
      },
    );
    expect(result.modifiers).toContainEqual(
      expect.objectContaining({
        bucket: 'dbm',
        conditions: expect.arrayContaining([{ kind: 'standingStill', value: true }]),
      }),
    );
    expect(
      result.modifiers.some((m) =>
        m.conditions.some((c) => c.kind === 'unresolved' && c.raw.includes('IsMoving')),
      ),
    ).toBe(false);
  });
});

describe('PA_CommonArmPerk Rusty Knuckles bleed (2026-08-28)', () => {
  const PERK = '0x0024848E';
  const SPELL = '0x0024848D';
  const BLEED_MGEF = '0x001A03FD';
  const GRANT_MGEF = '0x0024848F';
  const ENCH = '0x00248490';
  const DAMAGE_RESIST = '0x000002E3';
  const UNARMED_KW = '0x0005240E';

  const bleedMgef = {
    header: { signature: 'MGEF', form_id: BLEED_MGEF },
    editor_id: 'DamageHealthContact',
    fields: {
      'Magic Effect Data': {
        Data: {
          Archetype: { name: 'Damage' },
          'Resist Value': DAMAGE_RESIST,
          Delivery: { name: 'Contact' },
          Flags: { flags: ['Hostile', 'Detrimental'] },
        },
      },
    },
  };

  const grantMgef = {
    header: { signature: 'MGEF', form_id: GRANT_MGEF },
    editor_id: 'PowerArmor_CommonArmEffect',
    fields: {
      'Magic Effect Data': {
        Data: {
          Archetype: { name: 'Script' },
          'Perk to Apply': PERK,
          Delivery: { name: 'Self' },
        },
      },
    },
  };

  const records = {
    [PERK]: paCommonArmPerk,
    [SPELL]: spellPaCommonArm,
    [BLEED_MGEF]: bleedMgef,
    [GRANT_MGEF]: grantMgef,
    [ENCH]: enchPaCommonArm,
    [DAMAGE_RESIST]: {
      header: { signature: 'AVIF', form_id: DAMAGE_RESIST },
      editor_id: 'DamageResist',
      fields: {},
    },
    [UNARMED_KW]: {
      header: { signature: 'KYWD', form_id: UNARMED_KW },
      editor_id: 'WeaponTypeUnarmed',
      fields: {},
    },
  };

  it('translateGrantedPerk → wornPieces bleed curve (3/6 per 1/2 arms)', async () => {
    const result = await runGrantedPerk(fixtureClient(records), 'PA_CommonArmPerk', PERK, {
      edidByFormId: new Map([
        [DAMAGE_RESIST, 'DamageResist'],
        [UNARMED_KW, 'WeaponTypeUnarmed'],
      ]),
    });
    expect(result.deliveryTargetType).toBe('Contact');
    expect(result.modifiers).toEqual([
      expect.objectContaining({
        bucket: 'dotDamage',
        op: 'ADD',
        curve: {
          input: 'wornPieces',
          points: [
            { x: 1, y: 3 },
            { x: 2, y: 6 },
          ],
        },
        durationSec: 3,
        conditions: expect.arrayContaining([
          { kind: 'weaponKeyword', keyword: 'WeaponTypeUnarmed', present: true },
          { kind: 'damageTypeScope', types: ['ballistic'] },
        ]),
      }),
    ]);
    expect(result.notes.some((n) => n.includes('PA_RustyKnuckles_AV'))).toBe(false);
  });

  it('translateEnchantment keeps bleed through Self outer ENCH via effectiveTargetType', async () => {
    const result = await runEnchantment(fixtureClient(records), ENCH, {
      edidByFormId: new Map([
        [DAMAGE_RESIST, 'DamageResist'],
        [UNARMED_KW, 'WeaponTypeUnarmed'],
      ]),
    });
    expect(result.targetType).toBe('Self');
    expect(result.effectiveTargetType).toBe('Contact');
    expect(result.modifiers.some((m) => m.bucket === 'dotDamage')).toBe(true);
  });
});

describe('Sheepsquatch Shard poison DoT playerLevel curve (2026-08-28)', () => {
  const ENCH = '0x0045FF64';
  const POISON_MGEF = '0x000856FA';
  const POISON_RESIST = '0x000002E4';
  const PLAYER_LEVEL_AV = '0x0000032C';
  const curvePoints = [
    { x: 1, y: 34 },
    { x: 50, y: 112 },
  ];

  it('extracts dotDamage with playerLevel curve 34→112', async () => {
    const result = await runEnchantment(
      fixtureClient({
        [ENCH]: {
          header: { signature: 'ENCH', form_id: ENCH },
          editor_id: 'ench_Weapon_SheepsquatchShard',
          fields: {
            'Effect Data': {
              'Target Type': { name: 'Contact' },
              'Cast Type': { name: 'Fire and Forget' },
            },
            Effects: [
              {
                Effect: {
                  'Base Effect': POISON_MGEF,
                  'Effect Item Data': { Magnitude: 0, Duration: 35 },
                  'Curve Table': { curve: curvePoints },
                  'Actor Value': PLAYER_LEVEL_AV,
                },
              },
            ],
          },
        },
        [POISON_MGEF]: {
          header: { signature: 'MGEF', form_id: POISON_MGEF },
          editor_id: 'dtPoisonEffectChanceAlways',
          fields: {
            'Magic Effect Data': {
              Data: {
                Archetype: { name: 'Damage' },
                'Resist Value': POISON_RESIST,
                Delivery: { name: 'Contact' },
                Flags: { flags: ['Hostile', 'Detrimental'] },
              },
            },
          },
        },
        [POISON_RESIST]: {
          header: { signature: 'AVIF', form_id: POISON_RESIST },
          editor_id: 'PoisonResist',
          fields: {},
        },
      }),
      ENCH,
      { edidByFormId: new Map([[POISON_RESIST, 'PoisonResist']]) },
    );
    expect(result.modifiers).toContainEqual(
      expect.objectContaining({
        bucket: 'dotDamage',
        curve: { input: 'playerLevel', points: curvePoints },
        durationSec: 35,
        conditions: expect.arrayContaining([{ kind: 'damageTypeScope', types: ['poison'] }]),
      }),
    );
  });
});

describe('ModKineticLiningPerk (2026-08-28)', () => {
  it('Mod Restore Action Cost Value → descriptive note, no bucket', async () => {
    const result = await runGrantedPerk(
      fixtureClient({ '0x00064002': modKineticLiningPerk }),
      'ModKineticLiningPerk',
      '0x00064002',
    );
    expect(result.modifiers).toEqual([]);
    expect(result.notes).toContainEqual(
      'perk ModKineticLiningPerk: restores AP by 20% of damage taken — on-damage-taken resource mechanic, not modeled (issue #89)',
    );
  });
});

describe('translateConditions (condition-whitelist round K, 2026-08-28)', () => {
  it('maps HasKeyword(DamageTypeEnergy)=1 on the wielder to damageTypeScope energy', () => {
    const row: RawCondition = {
      Function: 'HasKeyword',
      'Parameter 1': '0xENERGY',
      'Comparison Value': 1,
      Operator: 'Equal To',
      'Run On': 'Subject',
    };
    const { conditions, unresolved } = translateConditions([row], {
      edidByFormId: new Map([['0xENERGY', 'DamageTypeEnergy']]),
    });
    expect(conditions).toEqual([{ kind: 'damageTypeScope', types: ['energy'] }]);
    expect(unresolved).toEqual([]);
  });

  it('maps HasScopeWeaponEquipped()=1 to weaponKeywordAny over scope keywords', () => {
    const row: RawCondition = {
      Function: 'HasScopeWeaponEquipped',
      'Comparison Value': 1,
      Operator: 'Equal To',
      'Run On': 'Subject',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([
      { kind: 'weaponKeywordAny', keywords: ['HasScope', 'HasScopeRecon'] },
    ]);
  });

  it('maps scoped-weapon OR-groups to weaponKeywordAny', () => {
    const rows: RawCondition[] = [
      {
        Function: 'HasKeyword',
        'Parameter 1': '0xSCOPE',
        'Comparison Value': 1,
        Operator: 'Equal To',
        'AND/OR': 'OR',
        'Run On': 'Subject',
      },
      {
        Function: 'HasKeyword',
        'Parameter 1': '0xRECON',
        'Comparison Value': 1,
        Operator: 'Equal To',
        'Run On': 'Subject',
      },
    ];
    const { conditions, unresolved } = translateConditions(rows, {
      edidByFormId: new Map([
        ['0xSCOPE', 'HasScope'],
        ['0xRECON', 'HasScopeRecon'],
      ]),
    });
    expect(conditions).toEqual([
      { kind: 'weaponKeywordAny', keywords: ['HasScope', 'HasScopeRecon'] },
    ]);
    expect(unresolved).toEqual([]);
  });

  it('maps WornHasKeyword(MoMEyeOfRaItemKeyword) to eyeOfRaWorn true/false tiers', () => {
    const base = translateConditions(
      [
        {
          Function: 'WornHasKeyword',
          'Parameter 1': '0xEYE',
          'Comparison Value': 1,
          Operator: 'Not Equal To',
        },
      ],
      { edidByFormId: new Map([['0xEYE', 'MoMEyeOfRaItemKeyword']]) },
    );
    expect(base.conditions).toEqual([{ kind: 'eyeOfRaWorn', value: false }]);
    const upgrade = translateConditions(
      [
        {
          Function: 'WornHasKeyword',
          'Parameter 1': '0xEYE',
          'Comparison Value': 1,
          Operator: 'Equal To',
        },
      ],
      { edidByFormId: new Map([['0xEYE', 'MoMEyeOfRaItemKeyword']]) },
    );
    expect(upgrade.conditions).toEqual([{ kind: 'eyeOfRaWorn', value: true }]);
  });

  it('PlayerPerk Mod Sneak Attack Mult → ESM-provenance note via resolveDirectEntryPointModifiers', async () => {
    const { resolveDirectEntryPointModifiers } = await import('../normalize/mgef');
    const result = resolveDirectEntryPointModifiers({
      epName: 'Mod Sneak Attack Mult',
      functionName: 'Add Actor Value Mult',
      float: 0.01,
      conditionRows: [],
      conditions: [],
      edidByFormId: new Map([['0x006E1052', 'STAT_SneakAttackBonus']]),
      perkEdid: 'PlayerPerk',
      avFormId: '0x006E1052',
    });
    expect(result.handled).toBe(true);
    if (!result.handled) return;
    expect(result.modifiers).toEqual([]);
    expect(result.notes?.[0]).toContain('Player baseline sneak mult');
  });

  it('mod_weapon_NitroFortunate EP211 → ammoFreeChance via resolveDirectEntryPointModifiers', async () => {
    const { resolveDirectEntryPointModifiers } = await import('../normalize/mgef');
    const result = resolveDirectEntryPointModifiers({
      epName: 'Mod Add Bullet To Clip Chance',
      functionName: 'Set Value',
      float: 21,
      conditionRows: [],
      conditions: [],
      edidByFormId: new Map(),
      perkEdid: 'mod_weapon_NitroFortunate',
    });
    expect(result).toEqual({
      handled: true,
      modifiers: [
        {
          bucket: 'ammoFreeChance',
          op: 'ADD',
          value: 0.21,
          conditions: [],
        },
      ],
    });
  });
});

describe('mod_Custom_Rage zero-magnitude script MGEFs (2026-08-28)', () => {
  it('abFortifyDamageAll → unmeasured script-set note, not needs override', () => {
    const result = translate(
      mgef({ edid: 'abFortifyDamageAll', archetype: 'Script', actorValue: '0x0' }),
      effect({ magnitude: 0 }),
      new Map(),
      new Map(),
    );
    expect(result.notes).toContainEqual(
      'abFortifyDamageAll: unmeasured script-set damage bonus — needs in-game measurement',
    );
    expect(result.notes.some((n) => n.includes('needs override'))).toBe(false);
  });
});
