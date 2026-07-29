import { describe, it, expect } from 'bun:test';
import type { EsmClient, EsmListRow, EsmRecord } from '../esm-client';
import type { CobjIndex } from '../cobj-index';
import { extractOmods, isExcludedOmodEdid, propertyName } from '../extract-omods';
import unstoppableMonsterOmod from './fixtures/omod-unstoppablemonster.json';
import unstoppableMonsterPerk from './fixtures/perk-unstoppablemonster.json';
import allRiseOmod from './fixtures/omod-allrise.json';
import bunkerBusterOmod from './fixtures/omod-bunkerbuster.json';
import barrelLongRangeParent from './fixtures/omod-barrel-long-range-parent.json';
import armor2StatStrengthOmod from './fixtures/omod-armor2-statstrength.json';
import battleLoadersOmod from './fixtures/omod-battleloaders.json';
import battleLoadersEnch from './fixtures/ench-battleloaders.json';
import battleLoadersMgef from './fixtures/mgef-battleloaders.json';
import battleLoadersPerk from './fixtures/perk-battleloaders.json';
import vatsEnhancedOmod from './fixtures/omod-vatsenhanced.json';
import hellstormCryoOmod from './fixtures/omod-hellstorm-cryo.json';
import hellstormCryoProj from './fixtures/proj-hellstorm-cryo.json';
import hellstormCryoExpl from './fixtures/expl-hellstorm-cryo.json';
import hellstormNapalmOmod from './fixtures/omod-hellstorm-napalm.json';
import hellstormNapalmProj from './fixtures/proj-hellstorm-napalm.json';
import hellstormNapalmExpl from './fixtures/expl-hellstorm-napalm.json';
import napalmFireEnch from './fixtures/ench-napalm-fire.json';
import napalmFireMgef from './fixtures/mgef-hellstorm-napalm-fire.json';
import fireResistAvif from './fixtures/avif-fireresist.json';
import fireHazardHazd from './fixtures/hazd-fire-molotov.json';
import fireHazardSpel from './fixtures/spel-fire-hazard.json';
import fireHazardMgef from './fixtures/mgef-fire-hazard-effect.json';

// Fixtures are verbatim `esm -p --esm <esmPath> get <edid|formid> --json` output
// (20260710 ESM). These pin the unique-mod rework's two previously-undecoded
// OMOD property mechanisms (docs: how-do-we-handle-enumerated-feather.md):
//   omod-unstoppablemonster.json  mod_Custom_UnstoppableMonster  0x008F0DD2
//     — carries property 116 (raw numeric, no {value,name} join) attaching
//     UnstoppableMonster_Perk.
//   perk-unstoppablemonster.json  UnstoppableMonster_Perk        0x0069CBF4
//     — both its Entry Point effects are "Mod Incoming Weapon Damage"
//     (damage TAKEN, entry point 36) — no formula bucket exists for it
//     (deliberately out of scope), so it must decode to a note, not silence.
//   omod-allrise.json             mod_Custom_AllRise             0x0047187E
//     — carries an ActorValues property ADDing AV 0x000002D4 (Health) = 50.0.

describe('propertyName (property 116 raw-numeric decode)', () => {
  it('maps the raw number 116 to AttachedPerk', () => {
    expect(propertyName(116)).toBe('AttachedPerk');
  });

  it('maps other raw numbers to Property#<n> instead of collapsing to Unknown', () => {
    expect(propertyName(999)).toBe('Property#999');
  });

  it('passes a named {value,name} property through unchanged', () => {
    expect(propertyName({ value: 31, name: 'Keywords' })).toBe('Keywords');
  });

  it('falls back to Unknown when there is no name and no recognized number', () => {
    expect(propertyName(undefined)).toBe('Unknown');
    expect(propertyName(null)).toBe('Unknown');
  });
});

/**
 * Minimal stub EsmClient covering exactly what `extractOmods` touches for a
 * two-record OMOD list: the OMODs themselves, the attached perk, and the
 * Health AVIF. Every other formid (keywords, the shared Includes template,
 * the plumbing perks buildAvifRoutes always fetches) resolves to a harmless
 * placeholder record — the test doesn't assert on those.
 */
function makeStubClient(): EsmClient {
  const known: Record<string, EsmRecord> = {
    '0x0047187E': allRiseOmod as unknown as EsmRecord,
    '0x008F0DD2': unstoppableMonsterOmod as unknown as EsmRecord,
    '0x0069CBF4': unstoppableMonsterPerk as unknown as EsmRecord,
    '0x000002D4': {
      header: { signature: 'AVIF', form_id: '0x000002D4' },
      editor_id: 'Health',
      fields: {},
    } as unknown as EsmRecord,
  };
  const get = async (target: string): Promise<EsmRecord> => {
    if (known[target]) return known[target];
    // Placeholder for keywords / the shared Includes template / the
    // STAT_Damage*Perk plumbing perks buildAvifRoutes fetches by edid — none
    // of these carry Effects/Properties, so downstream parsing no-ops on them.
    return {
      header: { signature: 'KYWD', form_id: target },
      editor_id: target,
      fields: {},
    } as unknown as EsmRecord;
  };
  return {
    async list(type: string): Promise<EsmListRow[]> {
      if (type !== 'OMOD') return [];
      return [
        {
          form_id: '0x0047187E',
          record_type: 'OMOD',
          editor_id: 'mod_Custom_AllRise',
          name: 'All Rise Custom Mod',
        },
        {
          form_id: '0x008F0DD2',
          record_type: 'OMOD',
          editor_id: 'mod_Custom_UnstoppableMonster',
          name: 'Unstoppable Monster',
        },
      ];
    },
    get,
    resolveEdid: async (formId: string) => (await get(formId)).editor_id,
    refs: async () => [],
  } as unknown as EsmClient;
}

describe('extractOmods (unique-mod rework, 2026-07-13)', () => {
  it('mod_Custom_UnstoppableMonster: property 116 resolves the attached perk, whose two damage-TAKEN entry points land as a note (not a silent drop) and never surface as an unknown property', async () => {
    const result = await extractOmods(makeStubClient(), new Set());
    const omod = result.omods.find((o) => o.id === 'mod_Custom_UnstoppableMonster');
    expect(omod).toBeDefined();
    expect(omod!.modifiers).toEqual([]); // "Mod Incoming Weapon Damage" has no formula bucket — damage taken, out of scope
    expect(
      (omod!.notes ?? []).some(
        (n) => n.includes('Mod Incoming Weapon Damage') && n.includes('not modeled'),
      ),
    ).toBe(true);
    // The aggregate _meta-visible report also carries the note (edid-prefixed).
    expect(
      result.notes.some(
        (n) =>
          n.startsWith('mod_Custom_UnstoppableMonster:') &&
          n.includes('Mod Incoming Weapon Damage'),
      ),
    ).toBe(true);
    expect(result.unknownProperties).not.toContain('Unknown');
    expect(result.unknownProperties.some((p) => p.startsWith('Property#'))).toBe(false);
  });

  it('mod_Custom_AllRise: ActorValues ADD Health 50.0 decodes to a maxHealth modifier of value 50', async () => {
    const result = await extractOmods(makeStubClient(), new Set());
    const omod = result.omods.find((o) => o.id === 'mod_Custom_AllRise');
    expect(omod).toBeDefined();
    expect(omod!.modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'maxHealth', op: 'ADD', value: 50 }),
    );
    expect(omod!.notes).not.toContain('ActorValues on Health — unmapped');
  });
});

/**
 * Stub client for mod_Custom_BunkerBuster (2026-07-29): ActorValues ADD
 * ConvertExplosiveRadiusToDamage 1.0 → explosionRadiusToDamage bucket.
 */
function makeBunkerBusterStubClient(): EsmClient {
  const omodFormId = '0x00471880';
  const convertAv = '0x00919EE2';
  const known: Record<string, EsmRecord> = {
    [omodFormId]: bunkerBusterOmod as unknown as EsmRecord,
    [convertAv]: {
      header: { signature: 'AVIF', form_id: convertAv },
      editor_id: 'ConvertExplosiveRadiusToDamage',
      fields: {},
    } as unknown as EsmRecord,
  };
  const get = async (target: string): Promise<EsmRecord> => {
    if (known[target]) return known[target];
    return {
      header: { signature: 'KYWD', form_id: target },
      editor_id: target,
      fields: {},
    } as unknown as EsmRecord;
  };
  return {
    async list(type: string): Promise<EsmListRow[]> {
      if (type !== 'OMOD') return [];
      return [
        {
          form_id: omodFormId,
          record_type: 'OMOD',
          editor_id: 'mod_Custom_BunkerBuster',
          name: 'Bunker Buster',
        },
      ];
    },
    get,
    resolveEdid: async (formId: string) => (await get(formId)).editor_id,
    refs: async () => [],
  } as unknown as EsmClient;
}

describe('extractOmods (Bunker Buster / ConvertExplosiveRadiusToDamage, 2026-07-29)', () => {
  it('mod_Custom_BunkerBuster: ActorValues ADD ConvertExplosiveRadiusToDamage 1.0 decodes to explosionRadiusToDamage 1.0', async () => {
    const result = await extractOmods(makeBunkerBusterStubClient(), new Set());
    const omod = result.omods.find((o) => o.id === 'mod_Custom_BunkerBuster');
    expect(omod).toBeDefined();
    expect(omod!.modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'explosionRadiusToDamage', op: 'ADD', value: 1.0 }),
    );
    expect(omod!.notes ?? []).not.toContain(
      'ActorValues on ConvertExplosiveRadiusToDamage — unmapped',
    );
  });
});

/**
 * Stub client for a synthetic OMOD carrying DamageTypeValues ADD/SET
 * properties (Task A, 2026-07-13). Verified raw ESM shape: Value 1 =
 * damage-type formid, Value 2 = amount, for all three operators (SET/
 * MUL_ADD/ADD) — mirrors the makeStubClient() pattern above but with its own
 * minimal record set (the OMOD plus the two damage-type formids it resolves).
 */
function makeDamageTypeValuesStubClient(): EsmClient {
  const dtEnergyFormId = '0x0001CA9F';
  const dtFireFormId = '0x0001CAA0';
  const omodFormId = '0x00DEC001';
  const known: Record<string, EsmRecord> = {
    [omodFormId]: {
      header: { signature: 'OMOD', form_id: omodFormId },
      editor_id: 'mod_Test_DamageTypeValues',
      fields: {
        Name: 'Test Damage Type Values Mod',
        Data: {
          'Form Type': { name: 'Weapon' },
          'Attach Point': '0x0047A264',
          Properties: [
            {
              'Function Type': { name: 'ADD' },
              Property: { name: 'DamageTypeValues' },
              'Value 1': dtEnergyFormId,
              'Value 2': 5,
            },
            {
              'Function Type': { name: 'SET' },
              Property: { name: 'DamageTypeValues' },
              'Value 1': dtFireFormId,
              'Value 2': 0,
            },
          ],
        },
      },
    } as unknown as EsmRecord,
    [dtEnergyFormId]: {
      header: { signature: 'DMGT', form_id: dtEnergyFormId },
      editor_id: 'dtEnergy',
      fields: {},
    } as unknown as EsmRecord,
    [dtFireFormId]: {
      header: { signature: 'DMGT', form_id: dtFireFormId },
      editor_id: 'dtFire',
      fields: {},
    } as unknown as EsmRecord,
  };
  const get = async (target: string): Promise<EsmRecord> => {
    if (known[target]) return known[target];
    return {
      header: { signature: 'KYWD', form_id: target },
      editor_id: target,
      fields: {},
    } as unknown as EsmRecord;
  };
  return {
    async list(type: string): Promise<EsmListRow[]> {
      if (type !== 'OMOD') return [];
      return [
        {
          form_id: omodFormId,
          record_type: 'OMOD',
          editor_id: 'mod_Test_DamageTypeValues',
          name: 'Test Damage Type Values Mod',
        },
      ];
    },
    get,
    resolveEdid: async (formId: string) => (await get(formId)).editor_id,
    refs: async () => [],
  } as unknown as EsmClient;
}

describe('extractOmods (DamageTypeValues ADD/SET, Task A 2026-07-13)', () => {
  it('emits baseDamage modifiers for ADD and SET, damage-type scoped, with no "not yet modeled" note', async () => {
    const result = await extractOmods(makeDamageTypeValuesStubClient(), new Set());
    const omod = result.omods.find((o) => o.id === 'mod_Test_DamageTypeValues');
    expect(omod).toBeDefined();
    expect(omod!.modifiers).toContainEqual(
      expect.objectContaining({
        bucket: 'baseDamage',
        op: 'ADD',
        value: 5,
        conditions: [{ kind: 'damageTypeScope', types: ['energy'] }],
      }),
    );
    expect(omod!.modifiers).toContainEqual(
      expect.objectContaining({
        bucket: 'baseDamage',
        op: 'SET',
        value: 0,
        conditions: [{ kind: 'damageTypeScope', types: ['fire'] }],
      }),
    );
    expect((omod!.notes ?? []).some((n) => n.includes('not yet modeled'))).toBe(false);
    expect(result.notes.some((n) => n.includes('not yet modeled'))).toBe(false);
  });
});

/**
 * Stub client for a synthetic OMOD carrying FullPowerSeconds/FullPowerDamageMult
 * SET properties (charging weapons phase 2, 2026-07-15). Verified raw ESM
 * shape on mod_GammaGun_SpecialMuzzle_Charger: both properties arrive as
 * plain SET numerics (Value 1 = the number, no curve table) — same shape as
 * AmmoCapacity, so no special-casing is needed in the generic property loop.
 */
function makeChargingBarrelStubClient(): EsmClient {
  const omodFormId = '0x00DEC002';
  const known: Record<string, EsmRecord> = {
    [omodFormId]: {
      header: { signature: 'OMOD', form_id: omodFormId },
      editor_id: 'mod_Test_ChargingBarrel',
      fields: {
        Name: 'Test Charging Barrel',
        Data: {
          'Form Type': { name: 'Weapon' },
          'Attach Point': '0x0047A264',
          Properties: [
            {
              'Function Type': { name: 'SET' },
              Property: { name: 'FullPowerSeconds' },
              'Value 1': 1.0,
              'Value 2': 1.0,
            },
            {
              'Function Type': { name: 'SET' },
              Property: { name: 'FullPowerDamageMult' },
              'Value 1': 2.0,
              'Value 2': 0.0,
            },
          ],
        },
      },
    } as unknown as EsmRecord,
  };
  const get = async (target: string): Promise<EsmRecord> => {
    if (known[target]) return known[target];
    return {
      header: { signature: 'KYWD', form_id: target },
      editor_id: target,
      fields: {},
    } as unknown as EsmRecord;
  };
  return {
    async list(type: string): Promise<EsmListRow[]> {
      if (type !== 'OMOD') return [];
      return [
        {
          form_id: omodFormId,
          record_type: 'OMOD',
          editor_id: 'mod_Test_ChargingBarrel',
          name: 'Test Charging Barrel',
        },
      ];
    },
    get,
    resolveEdid: async (formId: string) => (await get(formId)).editor_id,
    refs: async () => [],
  } as unknown as EsmClient;
}

describe('extractOmods (charging-barrel FullPowerSeconds/FullPowerDamageMult, charging weapons phase 2 2026-07-15)', () => {
  it('emits chargeFullPowerSec/chargeFullPowerDamageMult SET modifiers, no unknown-property report', async () => {
    const result = await extractOmods(makeChargingBarrelStubClient(), new Set());
    const omod = result.omods.find((o) => o.id === 'mod_Test_ChargingBarrel');
    expect(omod).toBeDefined();
    expect(omod!.modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'chargeFullPowerSec', op: 'SET', value: 1.0 }),
    );
    expect(omod!.modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'chargeFullPowerDamageMult', op: 'SET', value: 2.0 }),
    );
    expect(result.unknownProperties).not.toContain('FullPowerSeconds');
    expect(result.unknownProperties).not.toContain('FullPowerDamageMult');
  });
});

describe('isExcludedOmodEdid (regression, unrelated pre-filter)', () => {
  it('still drops dev/test-prefixed edids', () => {
    expect(isExcludedOmodEdid('zzzDeprecatedMod')).toBe(true);
    expect(isExcludedOmodEdid('mod_Custom_AllRise')).toBe(false);
  });
});

/**
 * Stub client mirroring Cremator's Slow-Burner receiver (2026-07-14 fix):
 * REM Enchantments '0xBASEENCH' (the base weapon's own fire-hit ench — must
 * be skipped, never walked) + ADD Enchantments '0xNEWENCH' (the receiver's
 * own tier-17-shaped NPC-only dot). '0xBASEENCH' carries only a PVP-only
 * (GetIsPlayer=1) branch, so if it were ever walked (the REM-as-ADD bug) it
 * would still surface a wrong modifier — this stub also checks that REM is
 * never fetched at all (an unexpected-get throw would fail the test).
 */
function makeSlowBurnerStubClient(): EsmClient {
  const omodFormId = '0xSLOWBURNER';
  const newEnchFormId = '0xNEWENCH';
  const newMgefFormId = '0xNEWMGEF';
  const fireResistFormId = '0xFIRERESIST';
  const known: Record<string, EsmRecord> = {
    [omodFormId]: {
      header: { signature: 'OMOD', form_id: omodFormId },
      editor_id: 'mod_Test_SlowBurner',
      fields: {
        Name: 'Test Slow-Burning Tank',
        Data: {
          'Form Type': { name: 'Weapon' },
          'Attach Point': '0x0047A264',
          Properties: [
            {
              'Function Type': { name: 'REM' },
              Property: { name: 'Enchantments' },
              'Value 1': '0xBASEENCH',
              'Value 2': 1,
            },
            {
              'Function Type': { name: 'ADD' },
              Property: { name: 'Enchantments' },
              'Value 1': newEnchFormId,
              'Value 2': 1,
            },
          ],
        },
      },
    } as unknown as EsmRecord,
    ['0xBASEENCH']: {
      header: { signature: 'ENCH', form_id: '0xBASEENCH' },
      editor_id: 'BaseFireHitEnch',
      fields: {
        'Effect Data': { 'Target Type': { name: 'Contact' } },
        Effects: [
          {
            Effect: {
              'Base Effect': '0xBASEMGEF',
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
    } as unknown as EsmRecord,
    [newEnchFormId]: {
      header: { signature: 'ENCH', form_id: newEnchFormId },
      editor_id: 'NewSlowBurnEnch',
      fields: {
        'Effect Data': { 'Target Type': { name: 'Contact' } },
        Effects: [
          {
            Effect: {
              'Base Effect': newMgefFormId,
              'Effect Item Data': { Magnitude: 16, Duration: 12 },
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
        ],
      },
    } as unknown as EsmRecord,
    [newMgefFormId]: {
      header: { signature: 'MGEF', form_id: newMgefFormId },
      editor_id: 'NewSlowBurnMgef',
      fields: {
        'Magic Effect Data': {
          Data: {
            Archetype: { name: 'Damage' },
            'Resist Value': fireResistFormId,
            Flags: { value: '0x0', flags: [] },
          },
        },
      },
    } as unknown as EsmRecord,
    [fireResistFormId]: {
      header: { signature: 'AVIF', form_id: fireResistFormId },
      editor_id: 'FireResist',
      fields: {},
    } as unknown as EsmRecord,
  };
  const get = async (target: string): Promise<EsmRecord> => {
    if (known[target]) return known[target];
    return {
      header: { signature: 'KYWD', form_id: target },
      editor_id: target,
      fields: {},
    } as unknown as EsmRecord;
  };
  return {
    async list(type: string): Promise<EsmListRow[]> {
      if (type !== 'OMOD') return [];
      return [
        {
          form_id: omodFormId,
          record_type: 'OMOD',
          editor_id: 'mod_Test_SlowBurner',
          name: 'Test Slow-Burning Tank',
        },
      ];
    },
    get,
    resolveEdid: async (formId: string) => (await get(formId)).editor_id,
    refs: async () => [],
  } as unknown as EsmClient;
}

describe('extractOmods (Enchantments REM-vs-ADD + GetIsPlayer/subjectIsTarget, 2026-07-14)', () => {
  it("skips the REMed base ench entirely (never fetched, note-only) and keeps only the ADDed ench's NPC-branch dot", async () => {
    const result = await extractOmods(makeSlowBurnerStubClient(), new Set());
    const omod = result.omods.find((o) => o.id === 'mod_Test_SlowBurner');
    expect(omod).toBeDefined();
    expect(omod!.modifiers).toEqual([
      expect.objectContaining({
        bucket: 'dotDamage',
        op: 'ADD',
        value: 16,
        durationSec: 12,
        conditions: [{ kind: 'damageTypeScope', types: ['fire'] }],
      }),
    ]);
    expect((omod!.notes ?? []).some((n) => n.includes('removes enchantment BaseFireHitEnch'))).toBe(
      true,
    );
  });
});

/**
 * Stub client mirroring the Lobber Barrel / Polar Lobber `OverrideProjectile`
 * chase (2026-07-14 fix): PROJ (Explosion flag) → EXPL (no direct damage,
 * "Placed Object" → HAZD) → HAZD (Lifetime 7, Effect → SPEL) → SPEL (Contact
 * delivery, one energy-scoped Damage-archetype effect, magnitude 34,
 * duration 1 — overridden to the HAZD's own Lifetime on the materialized
 * modifier).
 */
function makeLobberStubClient(cosmetic = false): EsmClient {
  const omodFormId = '0xLOBBER';
  const projFormId = '0xPROJ1';
  const explFormId = '0xEXPL1';
  const hazdFormId = '0xHAZD1';
  const spelFormId = '0xSPEL1';
  const mgefFormId = '0xHAZMGEF';
  const energyResistFormId = '0xENERGYRESIST';
  const known: Record<string, EsmRecord> = {
    [omodFormId]: {
      header: { signature: 'OMOD', form_id: omodFormId },
      editor_id: 'mod_Test_LobberBarrel',
      fields: {
        Name: 'Test Lobber Barrel',
        Data: {
          'Form Type': { name: 'Weapon' },
          'Attach Point': '0x0002249D',
          Properties: [
            {
              'Function Type': { name: 'SET' },
              Property: { name: 'OverrideProjectile' },
              'Value 1': projFormId,
              'Value 2': 1,
            },
          ],
        },
        'Target OMOD Keywords': ['0xMA_TESTLAUNCHER'],
      },
    } as unknown as EsmRecord,
    [projFormId]: {
      header: { signature: 'PROJ', form_id: projFormId },
      editor_id: 'TestLobberProjectile',
      fields: {
        Data: cosmetic
          ? { Flags: { flags: [] }, Explosion: explFormId }
          : { Flags: { flags: ['Explosion'] }, Explosion: explFormId },
      },
    } as unknown as EsmRecord,
    [explFormId]: {
      header: { signature: 'EXPL', form_id: explFormId },
      editor_id: 'TestLobberExplosion',
      fields: { Data: { Damage: 0, 'Placed Object': hazdFormId, 'Base Weapon Damage Mult': 0 } },
    } as unknown as EsmRecord,
    [hazdFormId]: {
      header: { signature: 'HAZD', form_id: hazdFormId },
      editor_id: 'TestLobberHazard',
      fields: {
        Data: { Limit: 20, Radius: 25, Lifetime: 7, 'Target Interval': 0.3, Effect: spelFormId },
      },
    } as unknown as EsmRecord,
    [spelFormId]: {
      header: { signature: 'SPEL', form_id: spelFormId },
      editor_id: 'TestLobberHazardSpell',
      fields: {
        Data: { 'Target Type': { name: 'Contact' }, 'Cast Type': { name: 'Fire and Forget' } },
        Effects: [
          {
            Effect: {
              'Base Effect': mgefFormId,
              'Effect Item Data': { Magnitude: 34, Duration: 1 },
            },
          },
        ],
      },
    } as unknown as EsmRecord,
    [mgefFormId]: {
      header: { signature: 'MGEF', form_id: mgefFormId },
      editor_id: 'TestLobberHazardEffect',
      fields: {
        'Magic Effect Data': {
          Data: {
            Archetype: { name: 'Damage' },
            'Resist Value': energyResistFormId,
            Flags: { value: '0x0', flags: [] },
          },
        },
      },
    } as unknown as EsmRecord,
    [energyResistFormId]: {
      header: { signature: 'AVIF', form_id: energyResistFormId },
      editor_id: 'EnergyResist',
      fields: {},
    } as unknown as EsmRecord,
  };
  const get = async (target: string): Promise<EsmRecord> => {
    if (known[target]) return known[target];
    return {
      header: { signature: 'KYWD', form_id: target },
      editor_id: target,
      fields: {},
    } as unknown as EsmRecord;
  };
  return {
    async list(type: string): Promise<EsmListRow[]> {
      if (type !== 'OMOD') return [];
      return [
        {
          form_id: omodFormId,
          record_type: 'OMOD',
          editor_id: 'mod_Test_LobberBarrel',
          name: 'Test Lobber Barrel',
        },
      ];
    },
    get,
    resolveEdid: async (formId: string) => (await get(formId)).editor_id,
    refs: async () => [],
  } as unknown as EsmClient;
}

describe('extractOmods (OverrideProjectile launcher-hazard chase, 2026-07-14)', () => {
  it('chases PROJ → EXPL → HAZD → SPEL into an energy-scoped dotDamage modifier, durationSec from HAZD Lifetime', async () => {
    const result = await extractOmods(makeLobberStubClient(), new Set());
    const omod = result.omods.find((o) => o.id === 'mod_Test_LobberBarrel');
    expect(omod).toBeDefined();
    expect(omod!.modifiers).toEqual([
      expect.objectContaining({
        bucket: 'dotDamage',
        op: 'ADD',
        value: 34,
        durationSec: 7, // HAZD Lifetime, NOT the SPEL's own per-tick Duration (1)
        conditions: [{ kind: 'damageTypeScope', types: ['energy'] }],
      }),
    ]);
  });

  it('materializes nothing for a PROJ lacking the Explosion flag (the ~154-cosmetic-mod majority)', async () => {
    const result = await extractOmods(makeLobberStubClient(true), new Set());
    const omod = result.omods.find((o) => o.id === 'mod_Test_LobberBarrel');
    expect(omod).toBeDefined();
    expect(omod!.modifiers).toEqual([]);
    expect(omod!.notes).toEqual([]);
  });

  it("launcher-family swap (explosiveFamilyKeywords match): still chases the swapped EXPL's own hazard damage as an ordinary modifier even when the EXPL itself has no direct/typed damage to replace the baseline with (explosionSwap stays absent)", async () => {
    // Same Lobber-shaped chain as the first test above, but this time the
    // omod's target keyword is flagged (via explosiveFamilyKeywords) as
    // already belonging to a weapon with its own fromExplosion component —
    // see the real Hellstorm cryo/napalm fixtures below for the "EXPL DOES
    // carry direct damage" shape (explosionSwap gets populated there). The
    // Lobber EXPL has no main curve / no typed Damage Types, only a hazard,
    // so `explosionSwap` stays undefined while the hazard's own dotDamage
    // still materializes exactly like the non-family case (2026-07-29:
    // launcher-family REPLACES the baseline fromExplosion component instead
    // of staying note-only — docs/assumptions.md "OMOD-chased launcher
    // payloads" § Launcher-family replacement).
    const result = await extractOmods(
      makeLobberStubClient(),
      new Set(),
      new Set(['0xMA_TESTLAUNCHER']),
    );
    const omod = result.omods.find((o) => o.id === 'mod_Test_LobberBarrel');
    expect(omod).toBeDefined();
    expect(omod!.explosionSwap).toBeUndefined();
    expect(omod!.modifiers).toEqual([
      expect.objectContaining({
        bucket: 'dotDamage',
        op: 'ADD',
        value: 34,
        durationSec: 7,
        conditions: [{ kind: 'damageTypeScope', types: ['energy'] }],
      }),
    ]);
  });
});

/**
 * Real ESM fixtures (`esm -p get`, 20260724 dump) for the Hellstorm Missile
 * Launcher's (`BOSRocketLauncher`) Cryo/Napalm tube barrels — the case the
 * launcher-family replacement branch exists for. Both OMODs `SET
 * OverrideProjectile` to a payload-specific PROJ whose EXPL carries real
 * typed damage the base `ExplosionMissileShellBOSLauncher` (the weapon's own
 * baseline `fromExplosion` component, tier 46) never fires once swapped:
 *   Cryo:   EXPL 0x005E47DD → dtCryo, Tier33 (58 @L1 → 194 @L50), no hazard.
 *   Napalm: EXPL 0x005E47DC → dtFire, Tier33 (58 → 194), PLUS its own
 *     on-hit Enchantment (0x005ED8E1, Tier16 fire DoT, 14 @L1 → 47 @L50,
 *     duration 7) AND a Placed Object ground hazard (0x0023C9E6
 *     FireHazardMolotov, flat magnitude 5, Lifetime 15).
 * `byFormId` (extractOmods' own OMOD index) only ever contains what
 * `client.list('OMOD')` returns — a single record here — so the OMODs'
 * real `Includes` chain (the shared Long-Range-Barrel/Missile-Ammo-Type
 * templates) is never resolved and contributes no modifiers, same as every
 * other stub client in this file; only `OverrideProjectile` produces output.
 */
function makeHellstormStubClient(payload: 'cryo' | 'napalm'): EsmClient {
  const known: Record<string, EsmRecord> = {
    '0x005E47E0': {
      header: { signature: 'KYWD', form_id: '0x005E47E0' },
      editor_id: 'ma_BOSRocketLauncher',
      fields: {},
    } as unknown as EsmRecord,
    '0x00060A82': {
      header: { signature: 'DMGT', form_id: '0x00060A82' },
      editor_id: 'dtFire',
      fields: {},
    } as unknown as EsmRecord,
    '0x00060A83': {
      header: { signature: 'DMGT', form_id: '0x00060A83' },
      editor_id: 'dtCryo',
      fields: {},
    } as unknown as EsmRecord,
    '0x000002E5': fireResistAvif as unknown as EsmRecord,
  };
  if (payload === 'cryo') {
    known['0x005E47E8'] = hellstormCryoOmod as unknown as EsmRecord;
    known['0x005E47EB'] = hellstormCryoProj as unknown as EsmRecord;
    known['0x005E47DD'] = hellstormCryoExpl as unknown as EsmRecord;
  } else {
    known['0x005E47E4'] = hellstormNapalmOmod as unknown as EsmRecord;
    known['0x005E47EC'] = hellstormNapalmProj as unknown as EsmRecord;
    known['0x005E47DC'] = hellstormNapalmExpl as unknown as EsmRecord;
    known['0x005ED8E1'] = napalmFireEnch as unknown as EsmRecord;
    known['0x002407FD'] = napalmFireMgef as unknown as EsmRecord;
    known['0x0023C9E6'] = fireHazardHazd as unknown as EsmRecord;
    known['0x00195904'] = fireHazardSpel as unknown as EsmRecord;
    known['0x00023C61'] = fireHazardMgef as unknown as EsmRecord;
  }
  const omodFormId = payload === 'cryo' ? '0x005E47E8' : '0x005E47E4';
  const omodEdid =
    payload === 'cryo'
      ? 'mod_BOSRocketLauncher_TubeBarrel_Cryo'
      : 'mod_BOSRocketLauncher_TubeBarrel_Napalm';
  const get = async (target: string): Promise<EsmRecord> => {
    if (known[target]) return known[target];
    return {
      header: { signature: 'KYWD', form_id: target },
      editor_id: target,
      fields: {},
    } as unknown as EsmRecord;
  };
  return {
    async list(type: string): Promise<EsmListRow[]> {
      if (type !== 'OMOD') return [];
      return [{ form_id: omodFormId, record_type: 'OMOD', editor_id: omodEdid, name: '' }];
    },
    get,
    resolveEdid: async (formId: string) => (await get(formId)).editor_id,
    refs: async () => [],
  } as unknown as EsmClient;
}

describe('extractOmods (launcher-family explosionSwap replacement, real Hellstorm fixtures, 2026-07-29)', () => {
  it('Cryo Payload: OverrideProjectile → EXPL with typed cryo damage (no hazard, no Enchantment) becomes an explosionSwap with one fromExplosion cryo component — no ordinary modifiers', async () => {
    const result = await extractOmods(
      makeHellstormStubClient('cryo'),
      new Set(),
      new Set(['ma_BOSRocketLauncher']),
    );
    const omod = result.omods.find((o) => o.id === 'mod_BOSRocketLauncher_TubeBarrel_Cryo');
    expect(omod).toBeDefined();
    expect(omod!.modifiers).toEqual([]);
    expect(omod!.explosionSwap).toEqual({
      explEdid: 'ExplosionMissileShellBOSLauncher_Cryo',
      baseWeaponDamageMult: 0,
      components: [
        {
          damageType: 'cryo',
          damageTypeEdid: 'dtCryo',
          amount: 0,
          tier: 33,
          curve: [
            { x: 1, y: 58 },
            { x: 5, y: 65 },
            { x: 10, y: 73 },
            { x: 15, y: 83 },
            { x: 20, y: 94 },
            { x: 25, y: 106 },
            { x: 30, y: 119 },
            { x: 35, y: 135 },
            { x: 40, y: 152 },
            { x: 45, y: 172 },
            { x: 50, y: 194 },
          ],
          fromExplosion: true,
        },
      ],
    });
  });

  it("Napalm Payload: explosionSwap carries the fire component, PLUS the EXPL's own on-hit Enchantment (curve-shaped fire DoT, durationSec from the ENCH's own Duration) AND its ground hazard (flat fire DoT, durationSec from HAZD Lifetime) as ordinary modifiers", async () => {
    const result = await extractOmods(
      makeHellstormStubClient('napalm'),
      new Set(),
      new Set(['ma_BOSRocketLauncher']),
    );
    const omod = result.omods.find((o) => o.id === 'mod_BOSRocketLauncher_TubeBarrel_Napalm');
    expect(omod).toBeDefined();
    expect(omod!.explosionSwap).toEqual({
      explEdid: 'ExplosionMissileShellBOSLauncher_Napalm',
      baseWeaponDamageMult: 0,
      components: [
        {
          damageType: 'fire',
          damageTypeEdid: 'dtFire',
          amount: 0,
          tier: 33,
          curve: [
            { x: 1, y: 58 },
            { x: 5, y: 65 },
            { x: 10, y: 73 },
            { x: 15, y: 83 },
            { x: 20, y: 94 },
            { x: 25, y: 106 },
            { x: 30, y: 119 },
            { x: 35, y: 135 },
            { x: 40, y: 152 },
            { x: 45, y: 172 },
            { x: 50, y: 194 },
          ],
          fromExplosion: true,
        },
      ],
    });
    expect(omod!.modifiers).toEqual([
      // EXPL "Enchantment" hop — curve-shaped (11 points, itemLevel input),
      // durationSec 7 straight from the ENCH's own Effect Item Data Duration
      // (no HAZD Lifetime override on this hop).
      expect.objectContaining({
        bucket: 'dotDamage',
        op: 'ADD',
        curve: {
          input: 'itemLevel',
          points: [
            { x: 1, y: 14 },
            { x: 5, y: 16 },
            { x: 10, y: 18 },
            { x: 15, y: 20 },
            { x: 20, y: 23 },
            { x: 25, y: 26 },
            { x: 30, y: 29 },
            { x: 35, y: 33 },
            { x: 40, y: 37 },
            { x: 45, y: 42 },
            { x: 50, y: 47 },
          ],
        },
        curveScale: 1,
        durationSec: 7,
        conditions: [{ kind: 'damageTypeScope', types: ['fire'] }],
      }),
      // EXPL "Placed Object" HAZD hop — flat magnitude 5, durationSec
      // OVERRIDDEN to the HAZD's own Lifetime (15), not the SPEL effect's
      // own per-tick Duration (0).
      expect.objectContaining({
        bucket: 'dotDamage',
        op: 'ADD',
        value: 5,
        durationSec: 15,
        conditions: [{ kind: 'damageTypeScope', types: ['fire'] }],
      }),
    ]);
  });
});

/**
 * Stub client mirroring the Cremator flame-color false-positive found while
 * validating the OverrideProjectile fix (2026-07-14): PROJ (Explosion flag)
 * → EXPL carrying typed damage but NO "Placed Object" (a re-skinned
 * fireball-impact VFX, purely cosmetic — Cremator's chemical colors don't
 * change damage in-game) — must materialize NOTHING (just a note), unlike
 * the Polar Lobber shape (typed damage PLUS a hazard) above.
 */
function makeCosmeticReskinStubClient(): EsmClient {
  const omodFormId = '0xCOSMETIC';
  const projFormId = '0xCOSMETICPROJ';
  const explFormId = '0xCOSMETICEXPL';
  const known: Record<string, EsmRecord> = {
    [omodFormId]: {
      header: { signature: 'OMOD', form_id: omodFormId },
      editor_id: 'mod_Test_CosmeticReskin',
      fields: {
        Name: 'Test Cosmetic Reskin',
        Data: {
          'Form Type': { name: 'Weapon' },
          'Attach Point': '0x00024004',
          Properties: [
            {
              'Function Type': { name: 'SET' },
              Property: { name: 'OverrideProjectile' },
              'Value 1': projFormId,
              'Value 2': 1,
            },
          ],
        },
      },
    } as unknown as EsmRecord,
    [projFormId]: {
      header: { signature: 'PROJ', form_id: projFormId },
      editor_id: 'TestReskinProjectile',
      fields: { Data: { Flags: { flags: ['Explosion'] }, Explosion: explFormId } },
    } as unknown as EsmRecord,
    [explFormId]: {
      header: { signature: 'EXPL', form_id: explFormId },
      editor_id: 'TestReskinExplosion',
      fields: {
        Data: { Damage: 0, 'Placed Object': null, 'Base Weapon Damage Mult': 0 },
        'Damage Types': [
          {
            Type: '0xDTFIRE',
            Amount: 25,
            'Curve Table': {
              curve_path: 'Player\\Damage\\Damage_Universal_Tier13.json',
              curve: [
                { x: 1, y: 10 },
                { x: 50, y: 32 },
              ],
            },
          },
        ],
      },
    } as unknown as EsmRecord,
    '0xDTFIRE': {
      header: { signature: 'DMGT', form_id: '0xDTFIRE' },
      editor_id: 'dtFire',
      fields: {},
    } as unknown as EsmRecord,
  };
  const get = async (target: string): Promise<EsmRecord> => {
    if (known[target]) return known[target];
    return {
      header: { signature: 'KYWD', form_id: target },
      editor_id: target,
      fields: {},
    } as unknown as EsmRecord;
  };
  return {
    async list(type: string): Promise<EsmListRow[]> {
      if (type !== 'OMOD') return [];
      return [
        {
          form_id: omodFormId,
          record_type: 'OMOD',
          editor_id: 'mod_Test_CosmeticReskin',
          name: 'Test Cosmetic Reskin',
        },
      ];
    },
    get,
    resolveEdid: async (formId: string) => (await get(formId)).editor_id,
    refs: async () => [],
  } as unknown as EsmClient;
}

describe('extractOmods (OverrideProjectile cosmetic-reskin guard, 2026-07-14)', () => {
  it('does NOT materialize direct EXPL typed damage when there is no Placed Object hazard (Cremator chemical-color false positive)', async () => {
    const result = await extractOmods(makeCosmeticReskinStubClient(), new Set());
    const omod = result.omods.find((o) => o.id === 'mod_Test_CosmeticReskin');
    expect(omod).toBeDefined();
    expect(omod!.modifiers).toEqual([]);
    expect((omod!.notes ?? []).some((n) => n.includes('not modeled'))).toBe(true);
  });
});

describe('extractOmods (OverrideProjectile REM/SET, 2026-07-14)', () => {
  it('skips a REMed projectile override entirely (never chased) while still chasing the SET one', async () => {
    // Mirrors Cremator's Lithium (Pink)/(Blue)/(Green): REM the shared default
    // projectile (which, if walked, would ALSO carry the same typed damage +
    // hazard as the SET one, double-counting it) while SETting its own.
    const omodFormId = '0xPINKLIKE';
    const remProjFormId = '0xREMPROJ';
    const setProjFormId = '0xSETPROJ';
    const explFormId = '0xSETEXPL';
    const hazdFormId = '0xSETHAZD';
    const spelFormId = '0xSETSPEL';
    const mgefFormId = '0xSETMGEF';
    const known: Record<string, EsmRecord> = {
      [omodFormId]: {
        header: { signature: 'OMOD', form_id: omodFormId },
        editor_id: 'mod_Test_PinkLike',
        fields: {
          Name: 'Test Pink-Like',
          Data: {
            'Form Type': { name: 'Weapon' },
            'Attach Point': '0x00024004',
            Properties: [
              {
                'Function Type': { name: 'REM' },
                Property: { name: 'OverrideProjectile' },
                'Value 1': remProjFormId,
                'Value 2': 1,
              },
              {
                'Function Type': { name: 'SET' },
                Property: { name: 'OverrideProjectile' },
                'Value 1': setProjFormId,
                'Value 2': 1,
              },
            ],
          },
        },
      } as unknown as EsmRecord,
      [setProjFormId]: {
        header: { signature: 'PROJ', form_id: setProjFormId },
        editor_id: 'TestSetProjectile',
        fields: { Data: { Flags: { flags: ['Explosion'] }, Explosion: explFormId } },
      } as unknown as EsmRecord,
      [explFormId]: {
        header: { signature: 'EXPL', form_id: explFormId },
        editor_id: 'TestSetExplosion',
        fields: { Data: { Damage: 0, 'Placed Object': hazdFormId, 'Base Weapon Damage Mult': 0 } },
      } as unknown as EsmRecord,
      [hazdFormId]: {
        header: { signature: 'HAZD', form_id: hazdFormId },
        editor_id: 'TestSetHazard',
        fields: { Data: { Limit: 20, Radius: 25, Lifetime: 7, Effect: spelFormId } },
      } as unknown as EsmRecord,
      [spelFormId]: {
        header: { signature: 'SPEL', form_id: spelFormId },
        editor_id: 'TestSetHazardSpell',
        fields: {
          Data: { 'Target Type': { name: 'Contact' } },
          Effects: [
            {
              Effect: {
                'Base Effect': mgefFormId,
                'Effect Item Data': { Magnitude: 20, Duration: 1 },
              },
            },
          ],
        },
      } as unknown as EsmRecord,
      [mgefFormId]: {
        header: { signature: 'MGEF', form_id: mgefFormId },
        editor_id: 'TestSetHazardEffect',
        fields: {
          'Magic Effect Data': {
            Data: {
              Archetype: { name: 'Damage' },
              'Resist Value': '0xFIRERESISTX',
              Flags: { value: '0x0', flags: [] },
            },
          },
        },
      } as unknown as EsmRecord,
      '0xFIRERESISTX': {
        header: { signature: 'AVIF', form_id: '0xFIRERESISTX' },
        editor_id: 'FireResist',
        fields: {},
      } as unknown as EsmRecord,
      // The REM code path resolves this projectile's OWN edid (for the
      // note text — mirrors the Enchantments REM fix), so it's legitimately
      // fetched; what must NEVER be fetched is what it chases TO (its own
      // `Explosion` field, `0xREMEXPL`) — that would mean the REM branch was
      // walked/decoded like the SET one, the exact bug this test guards.
      [remProjFormId]: {
        header: { signature: 'PROJ', form_id: remProjFormId },
        editor_id: 'TestRemProjectile',
        fields: { Data: { Flags: { flags: ['Explosion'] }, Explosion: '0xREMEXPL' } },
      } as unknown as EsmRecord,
    };
    const forbidden = new Set(['0xREMEXPL']);
    const get = async (target: string): Promise<EsmRecord> => {
      if (forbidden.has(target))
        throw new Error(`unexpected get(${target}) — the REMed branch must never be chased`);
      if (known[target]) return known[target];
      // Placeholder for the plumbing-perk edids buildAvifRoutes always
      // fetches (STAT_DamagePerk & co.) and any keyword/AVIF lookups.
      return {
        header: { signature: 'KYWD', form_id: target },
        editor_id: target,
        fields: {},
      } as unknown as EsmRecord;
    };
    const client = {
      async list(type: string): Promise<EsmListRow[]> {
        if (type !== 'OMOD') return [];
        return [
          {
            form_id: omodFormId,
            record_type: 'OMOD',
            editor_id: 'mod_Test_PinkLike',
            name: 'Test Pink-Like',
          },
        ];
      },
      get,
      resolveEdid: async (formId: string) => (await get(formId)).editor_id,
      refs: async () => [],
    } as unknown as EsmClient;

    const result = await extractOmods(client, new Set());
    const omod = result.omods.find((o) => o.id === 'mod_Test_PinkLike');
    expect(omod).toBeDefined();
    expect(omod!.modifiers).toEqual([
      expect.objectContaining({ bucket: 'dotDamage', op: 'ADD', value: 20 }),
    ]);
    expect(
      (omod!.notes ?? []).some((n) => n.includes('removes projectile override TestRemProjectile')),
    ).toBe(true);
  });
});

/**
 * Stub mirroring the "Locked" false positive (2026-07-15,
 * mod_Legendary_Weapon4_Guns_Locked 0x008B4C3F): two legendary-crafting OMODs
 * (target keyword ma_legendarycrafting_weapon), both riding an obtainable
 * WEAP's template (the only reverse reference). One has a real granting COBJ
 * (Created Object = the OMOD — every shipped 4★'s shape); the other has none
 * (Locked's shell COBJ creates nothing → no byCreatedObject entry). A plain
 * non-legendary mod in the same shape keeps the WEAP-ride rule.
 */
function makeLegendaryCraftStub(): {
  client: EsmClient;
  cobjIndex: CobjIndex;
  weaponFormId: string;
} {
  const withCobjFormId = '0xLEGWITHCOBJ';
  const noCobjFormId = '0xLEGNOCOBJ';
  const plainFormId = '0xPLAINRIDE';
  const weaponFormId = '0xLEGWEAP';
  const legKeywordFormId = '0xMALEGCRAFT';
  const omodRecord = (formId: string, edid: string, name: string, legendary: boolean): EsmRecord =>
    ({
      header: { signature: 'OMOD', form_id: formId },
      editor_id: edid,
      fields: {
        Name: name,
        Data: {
          'Form Type': { name: 'Weapon' },
          'Attach Point': '0x0002249D',
          Properties: [],
        },
        ...(legendary ? { 'Target OMOD Keywords': [legKeywordFormId] } : {}),
      },
    }) as unknown as EsmRecord;
  const known: Record<string, EsmRecord> = {
    [withCobjFormId]: omodRecord(
      withCobjFormId,
      'mod_Test_Legendary_WithRecipe',
      'With Recipe',
      true,
    ),
    [noCobjFormId]: omodRecord(noCobjFormId, 'mod_Test_Legendary_LockedLike', 'Locked-Like', true),
    [plainFormId]: omodRecord(plainFormId, 'mod_Test_PlainTemplateRide', 'Plain Ride', false),
    [legKeywordFormId]: {
      header: { signature: 'KYWD', form_id: legKeywordFormId },
      editor_id: 'ma_legendarycrafting_weapon',
      fields: {},
    } as unknown as EsmRecord,
  };
  const get = async (target: string): Promise<EsmRecord> => {
    if (known[target]) return known[target];
    return {
      header: { signature: 'KYWD', form_id: target },
      editor_id: target,
      fields: {},
    } as unknown as EsmRecord;
  };
  const cobjInfo = {
    formId: '0xCOBJGRANT',
    edid: 'co_mod_Test_Legendary_WithRecipe',
    createdObjectFormId: withCobjFormId,
    learnMethod: 3,
    repairMethod: null,
    learnRecipeFrom: null,
  };
  const cobjIndex: CobjIndex = {
    byFormId: new Map([[cobjInfo.formId, cobjInfo]]),
    byCreatedObject: new Map([[withCobjFormId, [cobjInfo]]]),
  };
  const client = {
    async list(type: string): Promise<EsmListRow[]> {
      if (type !== 'OMOD') return [];
      return [
        {
          form_id: withCobjFormId,
          record_type: 'OMOD',
          editor_id: 'mod_Test_Legendary_WithRecipe',
          name: 'With Recipe',
        },
        {
          form_id: noCobjFormId,
          record_type: 'OMOD',
          editor_id: 'mod_Test_Legendary_LockedLike',
          name: 'Locked-Like',
        },
        {
          form_id: plainFormId,
          record_type: 'OMOD',
          editor_id: 'mod_Test_PlainTemplateRide',
          name: 'Plain Ride',
        },
      ];
    },
    get,
    resolveEdid: async (formId: string) => (await get(formId)).editor_id,
    // Every OMOD's only reverse reference is the obtainable host weapon.
    refs: async () => [
      { form_id: weaponFormId, record_type: 'WEAP', editor_id: 'HostHuntingRifle' },
    ],
  } as unknown as EsmClient;
  return { client, cobjIndex, weaponFormId };
}

describe('extractOmods (legendary-crafting obtainability gate, 2026-07-15)', () => {
  it('a legendary-crafting mod without a granting COBJ flips obtainable:false with a legendaryNoGrantCobj signal; one with a real recipe stays obtainable; the WEAP-ride rule is untouched for non-legendary mods', async () => {
    const { client, cobjIndex, weaponFormId } = makeLegendaryCraftStub();
    const result = await extractOmods(client, new Set([weaponFormId]), new Set(), cobjIndex);

    const withRecipe = result.omods.find((o) => o.id === 'mod_Test_Legendary_WithRecipe');
    expect(withRecipe?.obtainable).toBe(true);
    expect(withRecipe?.hasGrantingCobj).toBe(true);

    const lockedLike = result.omods.find((o) => o.id === 'mod_Test_Legendary_LockedLike');
    expect(lockedLike?.obtainable).toBe(false);
    expect(lockedLike?.hasGrantingCobj).toBeUndefined();
    const detail = result.excludedDetailed.omodUnobtainable.find(
      (d) => d.id === 'mod_Test_Legendary_LockedLike',
    );
    expect(detail?.signals).toContain('legendaryNoGrantCobj');
    expect(detail?.signals).toContain('weap:HostHuntingRifle');

    const plainRide = result.omods.find((o) => o.id === 'mod_Test_PlainTemplateRide');
    expect(plainRide?.obtainable).toBe(true);
  });
});

/**
 * Stub client for a synthetic OMOD carrying the two Bullet Storm ActorValues
 * properties (unique-mod rework, 2026-07-16). Verified raw ESM shape:
 * Resolute Veteran (mod_Custom_ResoluteVeteran 0x008F0DCE) carries
 * `ActorValues ADD AmmoSpenderMinStacks 5.0`; Final Word
 * (mod_Custom_FinalWord 0x008F1037) carries
 * `ActorValues SET EnableAmmoSpenderOnKill 1.0` — mirrors
 * makeDamageTypeValuesStubClient's pattern above, one property per mod so
 * each op is pinned independently. The SET assertion is the regression test
 * for the pushAv op-mapping bug fix (every non-MUL_ADD function used to
 * collapse to 'ADD', silently downgrading SET).
 */
function makeBulletStormStubClient(): EsmClient {
  const minStacksAvFormId = '0x00919957';
  const onKillAvFormId = '0x00924DB9';
  const minStacksOmodFormId = '0x00DEC003';
  const onKillOmodFormId = '0x00DEC004';
  const known: Record<string, EsmRecord> = {
    [minStacksOmodFormId]: {
      header: { signature: 'OMOD', form_id: minStacksOmodFormId },
      editor_id: 'mod_Test_ResoluteVeteran',
      fields: {
        Name: 'Test Resolute Veteran',
        Data: {
          'Form Type': { name: 'Weapon' },
          'Attach Point': '0x0047A264',
          Properties: [
            {
              'Function Type': { name: 'ADD' },
              Property: { name: 'ActorValues' },
              'Value 1': minStacksAvFormId,
              'Value 2': 5.0,
            },
          ],
        },
      },
    } as unknown as EsmRecord,
    [onKillOmodFormId]: {
      header: { signature: 'OMOD', form_id: onKillOmodFormId },
      editor_id: 'mod_Test_FinalWord',
      fields: {
        Name: 'Test Final Word',
        Data: {
          'Form Type': { name: 'Weapon' },
          'Attach Point': '0x0047A264',
          Properties: [
            {
              'Function Type': { name: 'SET' },
              Property: { name: 'ActorValues' },
              'Value 1': onKillAvFormId,
              'Value 2': 1.0,
            },
          ],
        },
      },
    } as unknown as EsmRecord,
    [minStacksAvFormId]: {
      header: { signature: 'AVIF', form_id: minStacksAvFormId },
      editor_id: 'AmmoSpenderMinStacks',
      fields: {},
    } as unknown as EsmRecord,
    [onKillAvFormId]: {
      header: { signature: 'AVIF', form_id: onKillAvFormId },
      editor_id: 'EnableAmmoSpenderOnKill',
      fields: {},
    } as unknown as EsmRecord,
  };
  const get = async (target: string): Promise<EsmRecord> => {
    if (known[target]) return known[target];
    return {
      header: { signature: 'KYWD', form_id: target },
      editor_id: target,
      fields: {},
    } as unknown as EsmRecord;
  };
  return {
    async list(type: string): Promise<EsmListRow[]> {
      if (type !== 'OMOD') return [];
      return [
        {
          form_id: minStacksOmodFormId,
          record_type: 'OMOD',
          editor_id: 'mod_Test_ResoluteVeteran',
          name: 'Test Resolute Veteran',
        },
        {
          form_id: onKillOmodFormId,
          record_type: 'OMOD',
          editor_id: 'mod_Test_FinalWord',
          name: 'Test Final Word',
        },
      ];
    },
    get,
    resolveEdid: async (formId: string) => (await get(formId)).editor_id,
    refs: async () => [],
  } as unknown as EsmClient;
}

describe('extractOmods (Bullet Storm ActorValues — AmmoSpenderMinStacks/EnableAmmoSpenderOnKill, 2026-07-16)', () => {
  it('ActorValues ADD 5.0 on AmmoSpenderMinStacks decodes to a bulletStormMinStacks ADD modifier of value 5', async () => {
    const result = await extractOmods(makeBulletStormStubClient(), new Set());
    const omod = result.omods.find((o) => o.id === 'mod_Test_ResoluteVeteran');
    expect(omod).toBeDefined();
    expect(omod!.modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'bulletStormMinStacks', op: 'ADD', value: 5 }),
    );
    expect(omod!.notes).not.toContain('ActorValues on AmmoSpenderMinStacks — unmapped');
  });

  it('ActorValues SET 1.0 on EnableAmmoSpenderOnKill decodes to a bulletStormOnKill SET modifier (regression: SET must not downgrade to ADD)', async () => {
    const result = await extractOmods(makeBulletStormStubClient(), new Set());
    const omod = result.omods.find((o) => o.id === 'mod_Test_FinalWord');
    expect(omod).toBeDefined();
    expect(omod!.modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'bulletStormOnKill', op: 'SET', value: 1 }),
    );
    expect(omod!.modifiers.find((m) => m.bucket === 'bulletStormOnKill')?.op).not.toBe('ADD');
    expect(omod!.notes).not.toContain('ActorValues on EnableAmmoSpenderOnKill — unmapped');
  });
});

/**
 * Stub client for the range-barrel bucket wiring (Phase 1 extraction half,
 * go-through-every-single-silly-whistle.md). The REAL parent template fixture
 * (omod-barrel-long-range-parent.json, verbatim `esm get 0x0027ABFA` output —
 * `_PARENT_mod_WEAPON_Barrel_Long_Range`, carrying MaxRange/MinRange MUL+ADD
 * 0.5) is wired in via a synthetic named child mod's `Data.Includes`, exactly
 * how real range-barrel OMODs attach it in-game (e.g. mod_10mm_Barrel_Long_Base
 * 0x0000469C) — `client.list('OMOD')` must return BOTH rows so the parent
 * lands in extractOmods' internal byFormId map even though
 * classifyOmodRecordExclusion drops it from the picker-facing `named` list
 * (authoringTemplate, `_PARENT_` prefix).
 */
function makeRangeBarrelStubClient(): EsmClient {
  const childFormId = '0x00DEC005';
  const parentFormId = '0x0027ABFA';
  const known: Record<string, EsmRecord> = {
    [childFormId]: {
      header: { signature: 'OMOD', form_id: childFormId },
      editor_id: 'mod_Test_LongRangeBarrel',
      fields: {
        Name: 'Test Long Range Barrel',
        Data: {
          'Form Type': { name: 'Weapon' },
          'Attach Point': '0x0002249D',
          Includes: [{ Mod: parentFormId }],
          Properties: [],
        },
      },
    } as unknown as EsmRecord,
    [parentFormId]: barrelLongRangeParent as unknown as EsmRecord,
  };
  const get = async (target: string): Promise<EsmRecord> => {
    if (known[target]) return known[target];
    return {
      header: { signature: 'KYWD', form_id: target },
      editor_id: target,
      fields: {},
    } as unknown as EsmRecord;
  };
  return {
    async list(type: string): Promise<EsmListRow[]> {
      if (type !== 'OMOD') return [];
      return [
        {
          form_id: childFormId,
          record_type: 'OMOD',
          editor_id: 'mod_Test_LongRangeBarrel',
          name: 'Test Long Range Barrel',
        },
        {
          form_id: parentFormId,
          record_type: 'OMOD',
          editor_id: '_PARENT_mod_WEAPON_Barrel_Long_Range',
          name: null,
        },
      ];
    },
    get,
    resolveEdid: async (formId: string) => (await get(formId)).editor_id,
    refs: async () => [],
  } as unknown as EsmClient;
}

describe('extractOmods (range barrel MinRange/MaxRange, Phase 1 extraction half)', () => {
  it('flattens the real _PARENT_mod_WEAPON_Barrel_Long_Range template into weaponMinRange/weaponMaxRange MUL_ADD 0.5 modifiers on the including child mod', async () => {
    const result = await extractOmods(makeRangeBarrelStubClient(), new Set());
    const omod = result.omods.find((o) => o.id === 'mod_Test_LongRangeBarrel');
    expect(omod).toBeDefined();
    expect(omod!.modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'weaponMinRange', op: 'MUL_ADD', value: 0.5 }),
    );
    expect(omod!.modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'weaponMaxRange', op: 'MUL_ADD', value: 0.5 }),
    );
    expect(result.unknownProperties).not.toContain('MinRange');
    expect(result.unknownProperties).not.toContain('MaxRange');
    // The template itself is never emitted as a player-facing mod.
    expect(
      result.omods.find((o) => o.id === '_PARENT_mod_WEAPON_Barrel_Long_Range'),
    ).toBeUndefined();
  });

  it('maps a synthetic OutOfRangeDamageMult property to weaponOutOfRangeMult (no real OMOD carries this property in the sampled range barrels — synthetic pin for completeness)', async () => {
    const omodFormId = '0x00DEC006';
    const client = {
      async list(type: string): Promise<EsmListRow[]> {
        if (type !== 'OMOD') return [];
        return [
          {
            form_id: omodFormId,
            record_type: 'OMOD',
            editor_id: 'mod_Test_OutOfRangeMult',
            name: 'Test Out Of Range Mult',
          },
        ];
      },
      async get(target: string): Promise<EsmRecord> {
        if (target === omodFormId) {
          return {
            header: { signature: 'OMOD', form_id: omodFormId },
            editor_id: 'mod_Test_OutOfRangeMult',
            fields: {
              Name: 'Test Out Of Range Mult',
              Data: {
                'Form Type': { name: 'Weapon' },
                'Attach Point': '0x0002249D',
                Properties: [
                  {
                    'Function Type': { name: 'SET' },
                    Property: { name: 'OutOfRangeDamageMult' },
                    'Value 1': 0.75,
                    'Value 2': 0.0,
                  },
                ],
              },
            },
          } as unknown as EsmRecord;
        }
        return {
          header: { signature: 'KYWD', form_id: target },
          editor_id: target,
          fields: {},
        } as unknown as EsmRecord;
      },
      resolveEdid: async (formId: string) => formId,
      refs: async () => [],
    } as unknown as EsmClient;

    const result = await extractOmods(client, new Set());
    const omod = result.omods.find((o) => o.id === 'mod_Test_OutOfRangeMult');
    expect(omod).toBeDefined();
    expect(omod!.modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'weaponOutOfRangeMult', op: 'SET', value: 0.75 }),
    );
    expect(result.unknownProperties).not.toContain('OutOfRangeDamageMult');
  });
});

/**
 * Phase 3 armor pipeline (go-through-every-single-silly-whistle.md, extraction
 * half): classifyOmodRecordExclusion now gates on Form Type ∈ {'Weapon',
 * 'Armor'} instead of Weapon-only, and extractOmods emits a SECOND array
 * (armorOmods) alongside the unchanged weapon `omods` array from one shared
 * OMOD list+get pass. Fixtures are verbatim `esm -p get <formid> --json`
 * output (20260710 ESM):
 *   omod-armor2-statstrength.json  mod_Legendary_Armor2_StatStrength  0x004EE54E
 *     — 2★ SPECIAL armor mod: `ActorValues ADD Strength 2.0` routes through
 *     the EXISTING ActorValues handler's FALLBACK_AVIF_ROUTES (Strength →
 *     specialStrength, scale 1) with zero new mapping code.
 *   omod-battleloaders.json + ench-battleloaders.json +
 *   mgef-battleloaders.json + perk-battleloaders.json — the full
 *   Battle-Loader's chain: OMOD → ENCH ench_LegendaryArmor_BattleLoaders →
 *   MGEF (Script archetype, Perk to Apply) → PERK Legendary_Armor_
 *   BattleLoadersPerk, whose 5 EP199 "Instant Reload Clip On Bash" effects
 *   are each Set Value 1.0 (a boolean placeholder) gated
 *   WornApparelHasKeywordCount({==1..==4,>=5}) × IsPowerAttacking ×
 *   GetRandomPercent(<=15..<=75) × two tab-index-2 sanity rows (GetIsPlayer
 *   Equal To 0.0 / GetDead Equal To 0.0, both Run On forced to 'Target' by
 *   flattenPerkConditionRows).
 */
function makeArmorStubClient(): EsmClient {
  const known: Record<string, EsmRecord> = {
    '0x004EE54E': armor2StatStrengthOmod as unknown as EsmRecord,
    '0x00792A28': battleLoadersOmod as unknown as EsmRecord,
    '0x00792948': battleLoadersEnch as unknown as EsmRecord,
    '0x0079B51F': battleLoadersMgef as unknown as EsmRecord,
    '0x0079B522': battleLoadersPerk as unknown as EsmRecord,
    // AVIF the 2★ SPECIAL mod's ActorValues property targets directly (the
    // raw SPECIAL AVIF, not a STAT_* plumbing stat) — must resolve to the
    // exact edid FALLBACK_AVIF_ROUTES keys on.
    '0x000002C2': {
      header: { signature: 'AVIF', form_id: '0x000002C2' },
      editor_id: 'Strength',
      fields: {},
    } as unknown as EsmRecord,
    // The worn-keyword Battle-Loader's WornApparelHasKeywordCount conditions
    // gate on — must resolve to the exact edid the wornPieceCount condition
    // carries.
    '0x00792A12': {
      header: { signature: 'KYWD', form_id: '0x00792A12' },
      editor_id: 'HasLegendary_Armor_BattleLoaders',
      fields: {},
    } as unknown as EsmRecord,
  };
  const get = async (target: string): Promise<EsmRecord> => {
    if (known[target]) return known[target];
    // Placeholder for the _PARENT_ Includes templates, other keywords, and
    // the STAT_Damage*Perk plumbing perks buildAvifRoutes always fetches —
    // none of these carry Effects/Properties, so downstream parsing no-ops
    // on them (same convention as makeStubClient() above).
    return {
      header: { signature: 'KYWD', form_id: target },
      editor_id: target,
      fields: {},
    } as unknown as EsmRecord;
  };
  return {
    async list(type: string): Promise<EsmListRow[]> {
      if (type !== 'OMOD') return [];
      return [
        {
          form_id: '0x004EE54E',
          record_type: 'OMOD',
          editor_id: 'mod_Legendary_Armor2_StatStrength',
          name: 'Strength',
        },
        {
          form_id: '0x00792A28',
          record_type: 'OMOD',
          editor_id: 'mod_Legendary_Armor4_BattleLoaders',
          name: "Battle-Loader's",
        },
      ];
    },
    get,
    resolveEdid: async (formId: string) => (await get(formId)).editor_id,
    refs: async () => [],
  } as unknown as EsmClient;
}

describe('extractOmods (Phase 3 armor pipeline, 2026-07-18)', () => {
  it('routes both armor OMODs into armorOmods, and neither into the weapon omods array', async () => {
    const result = await extractOmods(makeArmorStubClient(), new Set());
    expect(result.armorOmods.map((o) => o.id).sort()).toEqual(
      ['mod_Legendary_Armor2_StatStrength', 'mod_Legendary_Armor4_BattleLoaders'].sort(),
    );
    expect(result.omods.find((o) => o.id === 'mod_Legendary_Armor2_StatStrength')).toBeUndefined();
    expect(result.omods.find((o) => o.id === 'mod_Legendary_Armor4_BattleLoaders')).toBeUndefined();
  });

  it('2★ SPECIAL (Strength): ActorValues ADD Strength 2.0 decodes to a specialStrength modifier via the existing fallback route', async () => {
    const result = await extractOmods(makeArmorStubClient(), new Set());
    const omod = result.armorOmods.find((o) => o.id === 'mod_Legendary_Armor2_StatStrength');
    expect(omod).toBeDefined();
    expect(omod!.modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'specialStrength', op: 'ADD', value: 2 }),
    );
    expect(omod!.notes ?? []).not.toContain('ActorValues on Strength — unmapped');
  });

  it("Battle-Loader's: 5 reloadSkipChance modifiers at the right per-worn-piece chances, each carrying the matching wornPieceCount condition", async () => {
    const result = await extractOmods(makeArmorStubClient(), new Set());
    const omod = result.armorOmods.find((o) => o.id === 'mod_Legendary_Armor4_BattleLoaders');
    expect(omod).toBeDefined();

    const reloadMods = omod!.modifiers.filter((m) => m.bucket === 'reloadSkipChance');
    expect(reloadMods).toHaveLength(5);
    // Every emitted modifier is flat-valued (GetRandomPercent chance, not a
    // curve) — narrow accordingly instead of widening to `unknown`.
    const flatValue = (m: (typeof reloadMods)[number]): number => {
      if (!('value' in m))
        throw new Error(`expected a flat-value modifier, got a curve one: ${JSON.stringify(m)}`);
      return m.value;
    };
    // NOT the raw Set Value 1.0 placeholder — the real per-tier chance.
    expect(reloadMods.every((m) => flatValue(m) !== 1)).toBe(true);

    const byWornCondition = new Map(
      reloadMods.map((m) => {
        const worn = m.conditions.find(
          (c): c is Extract<typeof c, { kind: 'wornPieceCount' }> => c.kind === 'wornPieceCount',
        );
        return [worn ? `${worn.count}${worn.orMore ? '+' : ''}` : 'MISSING', flatValue(m)];
      }),
    );
    expect(byWornCondition).toEqual(
      new Map([
        ['1', 0.15],
        ['2', 0.3],
        ['3', 0.45],
        ['4', 0.6],
        ['5+', 0.75],
      ]),
    );
    // Every wornPieceCount condition names the Battle-Loader's keyword.
    for (const m of reloadMods) {
      const worn = m.conditions.find((c) => c.kind === 'wornPieceCount');
      expect(worn).toMatchObject({ keyword: 'HasLegendary_Armor_BattleLoaders' });
    }
  });
});

/**
 * Stub client for V.A.T.S. Enhanced (Phase 4 — VATS hit-chance aggregate,
 * display-only, 2026-07-18). Fixture is verbatim `esm -p get 0x00524153
 * --json` output: mod_Legendary_Weapon2_Guns_VATSAccuracy carries a direct
 * `ActorValues ADD STAT_VATSAccuracy 50.0` property (no ENCH/PERK chain) —
 * the simplest of the three real sources this phase wires (the other two,
 * the Awareness perk's curve and the armor helmets' granted-perk
 * Multiply-Value entry point, are pinned at the pure-`translate()` level in
 * normalize.test.ts).
 */
function makeVatsEnhancedStubClient(): EsmClient {
  const known: Record<string, EsmRecord> = {
    '0x00524153': vatsEnhancedOmod as unknown as EsmRecord,
    '0x006C2035': {
      header: { signature: 'AVIF', form_id: '0x006C2035' },
      editor_id: 'STAT_VATSAccuracy',
      fields: {},
    } as unknown as EsmRecord,
  };
  const get = async (target: string): Promise<EsmRecord> => {
    if (known[target]) return known[target];
    return {
      header: { signature: 'KYWD', form_id: target },
      editor_id: target,
      fields: {},
    } as unknown as EsmRecord;
  };
  return {
    async list(type: string): Promise<EsmListRow[]> {
      if (type !== 'OMOD') return [];
      return [
        {
          form_id: '0x00524153',
          record_type: 'OMOD',
          editor_id: 'mod_Legendary_Weapon2_Guns_VATSAccuracy',
          name: 'V.A.T.S. Enhanced',
        },
      ];
    },
    get,
    resolveEdid: async (formId: string) => (await get(formId)).editor_id,
    refs: async () => [],
  } as unknown as EsmClient;
}

describe('extractOmods (V.A.T.S. Enhanced — STAT_VATSAccuracy fallback route, Phase 4 2026-07-18)', () => {
  it('ActorValues ADD 50.0 on STAT_VATSAccuracy decodes to a vatsHitChance ADD modifier of value 0.5', async () => {
    const result = await extractOmods(makeVatsEnhancedStubClient(), new Set());
    const omod = result.omods.find((o) => o.id === 'mod_Legendary_Weapon2_Guns_VATSAccuracy');
    expect(omod).toBeDefined();
    expect(omod!.modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'vatsHitChance', op: 'ADD', value: 0.5 }),
    );
    expect(omod!.notes).not.toContain('ActorValues on STAT_VATSAccuracy — unmapped');
  });
});
