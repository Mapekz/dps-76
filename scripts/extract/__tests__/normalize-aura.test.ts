import { describe, it, expect } from 'bun:test';
import type { EsmRecord } from '../esm-client';
import { createInMemoryEsmSource } from '../esm-source-fake';
import { decodeAuraFromCloakMgef } from '../normalize/aura';
import type { MgefInfo, MgefTranslationDeps, SpellEffect } from '../normalize/mgef';
import { translateEnchantment, translateMagicEffect } from '../normalize/mgef';

function mgef(overrides: Partial<MgefInfo> = {}): MgefInfo {
  return {
    edid: 'TestMgef',
    name: 'Test',
    archetype: 'Cloak',
    actorValue: null,
    resistValue: null,
    perkToApply: null,
    explosion: null,
    keywords: [],
    dispelWithKeywords: false,
    detrimental: false,
    conditionRows: [],
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
    cooldownDurationSec: null,
    area: null,
    ...overrides,
  };
}

function esmEffectConditions(rows: Record<string, unknown>[]) {
  return {
    Conditions: rows.map((data) => ({ Condition: { 'Condition Data': data } })),
  };
}

describe('decodeAuraFromCloakMgef (ADR-0023 fixture chains)', () => {
  // Tesla Coils — 20260821 live shape: Cloak MGEF → Contact SPEL → Damage MGEF
  // (effect magnitude 20 + flat ×5 curve on the SPEL row; per-tick damage is
  // curve Y only = 5 — see docs/assumptions.md; MGEF record carries
  // IsHostileToActor on Subject).
  const CLOAK_MGEF = '0xTESLA01';
  const SPEL_ID = '0xTESLA03';
  const DAMAGE_MGEF = '0xTESLA04';
  const ENERGY_RESIST_AV = '0xENERAV';
  const IMMUNE_POISON_PERK = '0xIMMPERK';

  const teslaClient = createInMemoryEsmSource({
    records: {
      [CLOAK_MGEF]: {
        header: { signature: 'MGEF', form_id: CLOAK_MGEF },
        editor_id: 'PowerArmor_mod_Lining_FieldGen_Radiation_CloakEffect',
        fields: {
          'Magic Effect Data': {
            Data: {
              Archetype: { name: 'Cloak' },
              'Assoc. Item': SPEL_ID,
            },
          },
        },
      } as unknown as EsmRecord,
      [SPEL_ID]: {
        header: { signature: 'SPEL', form_id: SPEL_ID },
        editor_id: 'PowerArmor_mod_Lining_FieldGen_EMP_Spell',
        fields: {
          Data: { 'Target Type': { name: 'Contact' } },
          Effects: [
            {
              Effect: {
                'Base Effect': DAMAGE_MGEF,
                'Effect Item Data': { Magnitude: 20, Duration: 1, Area: 0 },
                'Curve Table': {
                  curve: [
                    { x: 1, y: 5 },
                    { x: 50, y: 5 },
                  ],
                },
                Conditions: esmEffectConditions([
                  {
                    Function: 'IsInCombat',
                    'Comparison Value': 1,
                    Operator: 'Equal To',
                    'Run On': 'Subject',
                  },
                ]),
              },
            },
          ],
        },
      } as unknown as EsmRecord,
      [DAMAGE_MGEF]: {
        header: { signature: 'MGEF', form_id: DAMAGE_MGEF },
        editor_id: 'mod_Lining_FieldGen_EMP_MagicEffect',
        fields: {
          Conditions: esmEffectConditions([
            {
              Function: 'IsHostileToActor',
              'Comparison Value': 1,
              Operator: 'Equal To',
              'Run On': 'Subject',
            },
          ]),
          'Magic Effect Data': {
            Data: {
              Archetype: { name: 'Damage' },
              'Resist Value': ENERGY_RESIST_AV,
              Delivery: { name: 'Contact' },
            },
          },
        },
      } as unknown as EsmRecord,
      [IMMUNE_POISON_PERK]: {
        header: { signature: 'PERK', form_id: IMMUNE_POISON_PERK },
        editor_id: 'ImmuneToPoison',
      } as unknown as EsmRecord,
    },
    resolveEdidMap: { [ENERGY_RESIST_AV]: 'EnergyResist', [IMMUNE_POISON_PERK]: 'ImmuneToPoison' },
  });

  it('decodes Tesla Coils cloak chain into energy aura (curve Y=5/tick, no dual amount)', async () => {
    const notes: string[] = [];
    const auras = await decodeAuraFromCloakMgef(
      {
        client: teslaClient,
        routes: new Map(),
        edidByFormId: new Map([
          [ENERGY_RESIST_AV, 'EnergyResist'],
          [IMMUNE_POISON_PERK, 'ImmuneToPoison'],
        ]),
      },
      mgef({ edid: 'PowerArmor_mod_Lining_FieldGen_Radiation_CloakEffect', archetype: 'Cloak' }),
      effect({ mgefFormId: CLOAK_MGEF }),
      [],
      notes,
    );
    expect(auras).toHaveLength(1);
    expect(auras[0]).toMatchObject({
      damageType: 'energy',
      tickSec: 1,
      curveScale: 1,
    });
    expect(auras[0].amount).toBeUndefined();
    expect(auras[0].curve).toEqual([
      { x: 1, y: 5 },
      { x: 50, y: 5 },
    ]);
    expect(auras[0].conditions).toEqual([]);
  });

  // Miasma — perk-mediated chain (20260821): ENCH → Script MGEF → PERK →
  // Ability SPEL → Cloak MGEF → V94_AcidCloakSpell → zero-magnitude damage.
  const MIASMA_ENCH = '0xMIASMA00';
  const MIASMA_SCRIPT = '0xMIASMA01';
  const MIASMA_PERK = '0xMIASMA02';
  const MIASMA_ABILITY = '0xMIASMA03';
  const MIASMA_CLOAK = '0xMIASMA04';
  const MIASMA_DAMAGE_SPEL = '0xMIASMA05';
  const MIASMA_DAMAGE_MGEF = '0xMIASMA06';
  const POISON_AV = '0xPOISAV';

  const miasmaClient = createInMemoryEsmSource({
    records: {
      [MIASMA_ENCH]: {
        header: { signature: 'ENCH', form_id: MIASMA_ENCH },
        editor_id: 'ench_LegendaryArmor_Miasma',
        fields: {
          'Effect Data': { 'Target Type': { name: 'Self' } },
          Effects: [
            { Effect: { 'Base Effect': MIASMA_SCRIPT, 'Effect Item Data': { Magnitude: 0 } } },
          ],
        },
      } as unknown as EsmRecord,
      [MIASMA_SCRIPT]: {
        header: { signature: 'MGEF', form_id: MIASMA_SCRIPT },
        editor_id: 'Legendary_Armor_MiasmaAddPerkEffect',
        fields: {
          'Magic Effect Data': {
            Data: { Archetype: { name: 'Script' }, 'Perk to Apply': MIASMA_PERK },
          },
        },
      } as unknown as EsmRecord,
      [MIASMA_PERK]: {
        header: { signature: 'PERK', form_id: MIASMA_PERK },
        editor_id: 'Legendary_Armor_MiasmaPerk',
        fields: {
          Effects: [
            {
              Effect: {
                'Effect Header': { 'Effect Type': { name: 'Ability' } },
                Ability: MIASMA_ABILITY,
              },
            },
          ],
        },
      } as unknown as EsmRecord,
      [MIASMA_ABILITY]: {
        header: { signature: 'SPEL', form_id: MIASMA_ABILITY },
        editor_id: 'Legendary_Armor_MiasmaCloakSpell',
        fields: {
          Data: { 'Target Type': { name: 'Self' } },
          Effects: [
            {
              Effect: {
                'Base Effect': MIASMA_CLOAK,
                'Effect Item Data': { Magnitude: 15, Duration: 0 },
              },
            },
          ],
        },
      } as unknown as EsmRecord,
      [MIASMA_CLOAK]: {
        header: { signature: 'MGEF', form_id: MIASMA_CLOAK },
        editor_id: 'Legendary_Armor_MiasmaCloakEffect',
        fields: {
          'Magic Effect Data': {
            Data: {
              Archetype: { name: 'Cloak' },
              'Assoc. Item': MIASMA_DAMAGE_SPEL,
            },
          },
        },
      } as unknown as EsmRecord,
      [MIASMA_DAMAGE_SPEL]: {
        header: { signature: 'SPEL', form_id: MIASMA_DAMAGE_SPEL },
        editor_id: 'V94_AcidCloakSpell',
        fields: {
          Data: { 'Target Type': { name: 'Contact' } },
          Effects: [
            {
              Effect: {
                'Base Effect': MIASMA_DAMAGE_MGEF,
                'Effect Item Data': { Magnitude: 0, Duration: 0 },
              },
            },
          ],
        },
      } as unknown as EsmRecord,
      [MIASMA_DAMAGE_MGEF]: {
        header: { signature: 'MGEF', form_id: MIASMA_DAMAGE_MGEF },
        editor_id: 'V94_AcidCloakDamageEffect',
        fields: {
          'Magic Effect Data': {
            Data: {
              Archetype: { name: 'Damage' },
              'Resist Value': POISON_AV,
              Delivery: { name: 'Contact' },
            },
          },
        },
      } as unknown as EsmRecord,
      [POISON_AV]: {
        header: { signature: 'AVIF', form_id: POISON_AV },
        editor_id: 'PoisonResist',
      } as unknown as EsmRecord,
    },
    resolveEdidMap: { [POISON_AV]: 'PoisonResist' },
  });

  it('decodes Miasma ENCH perk chain as magnitudePending poison aura', async () => {
    const { auras } = await translateEnchantment(
      {
        client: miasmaClient,
        routes: new Map(),
        edidByFormId: new Map([[POISON_AV, 'PoisonResist']]),
      },
      MIASMA_ENCH,
    );
    expect(auras).toHaveLength(1);
    expect(auras[0]).toMatchObject({
      damageType: 'poison',
      magnitudePending: true,
      tickSec: 1,
    });
  });

  // Plague Walker — 20260821: cloak assoc → Mutation_PlagueWalkerDamage SPEL
  // (5/tick @1 disease, not the cloak-effect magnitudes 10/12 on the mutation SPEL).
  const PW_CLOAK = '0xPW01';
  const PW_DAMAGE_SPEL = '0xPW03';
  const PW_DAMAGE_MGEF = '0xPW04';
  const PW_POISON_AV = '0xPOISAV2';
  const PW_IMMUNE = '0xPWIMM';
  const PW_DISEASE_KW = '0xPWDIS';

  const plagueClient = createInMemoryEsmSource({
    records: {
      [PW_CLOAK]: {
        header: { signature: 'MGEF', form_id: PW_CLOAK },
        editor_id: 'Mutation_PlagueWalkerCloak',
        fields: {
          'Magic Effect Data': {
            Data: { Archetype: { name: 'Cloak' }, 'Assoc. Item': PW_DAMAGE_SPEL },
          },
        },
      } as unknown as EsmRecord,
      [PW_DAMAGE_SPEL]: {
        header: { signature: 'SPEL', form_id: PW_DAMAGE_SPEL },
        editor_id: 'Mutation_PlagueWalkerDamage',
        fields: {
          Data: { 'Target Type': { name: 'Contact' } },
          Effects: [
            {
              Effect: {
                'Base Effect': PW_DAMAGE_MGEF,
                'Effect Item Data': { Magnitude: 5, Duration: 1 },
                Conditions: esmEffectConditions([
                  {
                    Function: 'GetNumActiveSpellsWithKeyword',
                    'Parameter 1': PW_DISEASE_KW,
                    'Comparison Value': 1,
                    Operator: 'Equal To',
                    'Run On': 'Target',
                  },
                  {
                    Function: 'GetIsPlayer',
                    'Comparison Value': 0,
                    Operator: 'Equal To',
                    'Run On': 'Target',
                    'AND/OR': 'OR',
                  },
                  {
                    Function: 'IsHostileToActor',
                    'Comparison Value': 1,
                    Operator: 'Equal To',
                    'Run On': 'Subject',
                    'AND/OR': 'OR',
                  },
                ]),
              },
            },
          ],
        },
      } as unknown as EsmRecord,
      [PW_DAMAGE_MGEF]: {
        header: { signature: 'MGEF', form_id: PW_DAMAGE_MGEF },
        editor_id: 'Mutation_PlagueWalkerDamageEffect',
        fields: {
          Conditions: esmEffectConditions([
            {
              Function: 'HasPerk',
              'Parameter 1': PW_IMMUNE,
              'Comparison Value': 0,
              Operator: 'Equal To',
              'Run On': 'Subject',
            },
          ]),
          'Magic Effect Data': {
            Data: {
              Archetype: { name: 'Damage' },
              'Resist Value': PW_POISON_AV,
              Delivery: { name: 'Contact' },
            },
          },
        },
      } as unknown as EsmRecord,
      [PW_POISON_AV]: {
        header: { signature: 'AVIF', form_id: PW_POISON_AV },
        editor_id: 'PoisonResist',
      } as unknown as EsmRecord,
      [PW_IMMUNE]: {
        header: { signature: 'PERK', form_id: PW_IMMUNE },
        editor_id: 'ImmuneToPoison',
      } as unknown as EsmRecord,
      [PW_DISEASE_KW]: {
        header: { signature: 'KYWD', form_id: PW_DISEASE_KW },
        editor_id: 'SURV_Icon_Disease',
      } as unknown as EsmRecord,
    },
    resolveEdidMap: {
      [PW_POISON_AV]: 'PoisonResist',
      [PW_IMMUNE]: 'ImmuneToPoison',
      [PW_DISEASE_KW]: 'SURV_Icon_Disease',
    },
  });

  it('decodes Plague Walker normal cloak as poison 5/tick with disease gate unresolved', async () => {
    const auras = await decodeAuraFromCloakMgef(
      {
        client: plagueClient,
        routes: new Map(),
        edidByFormId: new Map([
          [PW_POISON_AV, 'PoisonResist'],
          [PW_IMMUNE, 'ImmuneToPoison'],
          [PW_DISEASE_KW, 'SURV_Icon_Disease'],
        ]),
      },
      mgef({ edid: 'Mutation_PlagueWalkerCloak', archetype: 'Cloak' }),
      effect({ mgefFormId: PW_CLOAK }),
      [{ kind: 'strangeInNumbers', value: false }],
    );
    expect(auras).toHaveLength(1);
    expect(auras[0]).toMatchObject({
      damageType: 'poison',
      amount: 5,
      tickSec: 1,
      conditions: [
        { kind: 'strangeInNumbers', value: false },
        {
          kind: 'unresolved',
          raw: 'GetNumActiveSpellsWithKeyword(SURV_Icon_Disease)=1',
        },
      ],
    });
  });

  it('translateMagicEffect routes Cloak archetype through aura chase', async () => {
    const deps: MgefTranslationDeps = {
      client: teslaClient,
      routes: new Map(),
      edidByFormId: new Map([
        [ENERGY_RESIST_AV, 'EnergyResist'],
        [IMMUNE_POISON_PERK, 'ImmuneToPoison'],
      ]),
    };
    const result = await translateMagicEffect(deps, effect({ mgefFormId: CLOAK_MGEF }));
    expect(result.auras?.length).toBe(1);
    expect(result.modifiers).toEqual([]);
    expect(result.notes.some((n) => n.includes('needs override'))).toBe(false);
  });
});
