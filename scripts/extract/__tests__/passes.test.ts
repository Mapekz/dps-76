import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'bun:test';
import type { GeneratedArmor, GeneratedPerk, GeneratedWeapon } from '../../../src/types/generated';
import type { EsmRecord, EsmSource } from '../esm-client';
import { createInMemoryEsmSource } from '../esm-source-fake';
import { createPassContext, writeOutput, type ExtractorName } from '../pass';
import type { ExtractWeaponsResult } from '../extract-weapons';
import * as extractOmodsModule from '../extract-omods';
import * as conditionsModule from '../normalize/conditions';
import { omodsPass, weaponsPass, bodypartsPass, constantsPass, curvetablesPass } from '../passes';
import { minimalWeapon, perkPlaceholder, useTempDir } from './esm-stubs';
import {
  CONTAINER_ID,
  VARIANT_FIRE_ID,
  VARIANT_POISON_ID,
  curveTableClient,
  humanBodyPartRecords,
  validConstantsRecords,
  variantContainerClient,
} from './extract-fixtures';
import fixer from './fixtures/weap-fixer.json';
import avifStrength from './fixtures/avif-strength.json';

/**
 * Direct coverage for `passes.ts` real pass bodies — complements
 * `pass.test.ts`, which exercises the runner framework with synthetic fake
 * passes. Focus: the stateful `omodsPass` (variant-container rewrite +
 * optionalNeeds disk fallbacks) plus light smoke tests for a few thin passes.
 */

function makeOmodsCtx(
  client: EsmSource,
  weapons: GeneratedWeapon[],
  memoryExtras: ReadonlyMap<ExtractorName, unknown> = new Map(),
) {
  const memory = new Map<ExtractorName, unknown>([
    ['weapons', weaponsMemory(weapons)],
    ...memoryExtras.entries(),
  ]);
  return createPassContext(client, 'live', '/unused/out', memory);
}

function weaponsMemory(weapons: GeneratedWeapon[]): ExtractWeaponsResult {
  return {
    weapons,
    excluded: {},
    excludedDetailed: {},
    unresolved: [],
    obtainableFormIds: new Set(weapons.map((w) => w.formId)),
  };
}

/** Empty OMOD list — no variant containers in the run. */
function emptyOmodsClient(): EsmSource {
  return createInMemoryEsmSource({
    records: {},
    rows: [],
    getFallback: perkPlaceholder,
  });
}

describe('omodsPass', () => {
  const UNRELATED_TEMPLATE_MOD = '0x00CA0099';

  it('with no variant containers: allWeapons untouched and outputs omit weapons.json', async () => {
    const weapon = minimalWeapon({
      id: 'weap_plain',
      formId: '0x00WE0001',
      templateModFormIds: [UNRELATED_TEMPLATE_MOD],
    });
    const before = [...weapon.templateModFormIds];
    const ctx = makeOmodsCtx(emptyOmodsClient(), [weapon]);
    const { result } = await omodsPass.run(ctx);

    expect(weapon.templateModFormIds).toEqual(before);
    expect(result.outputs.map((o) => o.path)).toEqual(['omods.json', 'armor-omods.json']);
  });

  it('rewrites templateModFormIds in place and emits weapons.json when a container matches', async () => {
    const weapon = minimalWeapon({
      id: 'weap_whacker',
      formId: '0x00WE0002',
      templateModFormIds: [CONTAINER_ID, UNRELATED_TEMPLATE_MOD],
    });
    const ctx = makeOmodsCtx(variantContainerClient(), [weapon]);
    const { result } = await omodsPass.run(ctx);

    expect(weapon.templateModFormIds).toEqual([
      VARIANT_FIRE_ID,
      VARIANT_POISON_ID,
      UNRELATED_TEMPLATE_MOD,
    ]);
    const weaponsOutput = result.outputs.find((o) => o.path === 'weapons.json');
    expect(weaponsOutput).toBeDefined();
    expect(weaponsOutput!.content).toBe(ctx.memoryOf('weapons')!.weapons);
    expect((weaponsOutput!.content as GeneratedWeapon[])[0].templateModFormIds).toEqual([
      VARIANT_FIRE_ID,
      VARIANT_POISON_ID,
      UNRELATED_TEMPLATE_MOD,
    ]);
  });

  it('emits weapons.json when any variant container exists, even if one weapon’s templates do not match', async () => {
    const matching = minimalWeapon({
      id: 'weap_match',
      formId: '0x00WE0003',
      templateModFormIds: [CONTAINER_ID],
    });
    const nonMatching = minimalWeapon({
      id: 'weap_other',
      formId: '0x00WE0004',
      templateModFormIds: [UNRELATED_TEMPLATE_MOD],
    });
    const unchanged = [...nonMatching.templateModFormIds];
    const ctx = makeOmodsCtx(variantContainerClient(), [matching, nonMatching]);
    const { result } = await omodsPass.run(ctx);

    expect(matching.templateModFormIds).toEqual([VARIANT_FIRE_ID, VARIANT_POISON_ID]);
    expect(nonMatching.templateModFormIds).toEqual(unchanged);
    expect(result.outputs.some((o) => o.path === 'weapons.json')).toBe(true);
  });

  describe('optionalNeeds disk fallbacks', () => {
    const dir = useTempDir('passes-test-');
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('reads perks.json from disk when perks are not in memory', async () => {
      const perksOnDisk: GeneratedPerk[] = [
        {
          family: 'TestPerk',
          name: 'Test Perk',
          formIds: ['0x00PE0001'],
          maxRank: 1,
          descriptions: ['desc'],
          ranks: [{ rank: 1, modifiers: [] }],
          hasCard: false,
          notes: [],
        },
      ];
      await writeOutput(dir(), { path: 'perks.json', content: perksOnDisk });

      const spy = vi.spyOn(conditionsModule, 'buildCrossFamilyRankMap');
      const weapon = minimalWeapon({ id: 'weap_perks', formId: '0x00WE0005' });
      const ctx = createPassContext(
        emptyOmodsClient(),
        'live',
        dir(),
        new Map([['weapons', weaponsMemory([weapon])]]),
      );
      await omodsPass.run(ctx);

      expect(spy).toHaveBeenCalledWith([{ family: 'TestPerk', formIds: ['0x00PE0001'] }]);
    });

    it('warns and omits crossFamilyRank when perks.json is missing', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const spy = vi.spyOn(conditionsModule, 'buildCrossFamilyRankMap');
      const weapon = minimalWeapon({ id: 'weap_no_perks', formId: '0x00WE0006' });
      const ctx = createPassContext(
        emptyOmodsClient(),
        'live',
        dir(),
        new Map([['weapons', weaponsMemory([weapon])]]),
      );
      await omodsPass.run(ctx);

      expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('no perks.json found'))).toBe(
        true,
      );
      expect(spy).not.toHaveBeenCalled();
    });

    it('reads armor.json from disk and passes obtainable formIds to extractOmods', async () => {
      const armorOnDisk: GeneratedArmor[] = [
        { id: 'armor_obtain', formId: '0x00AR0001', name: 'Obtainable', obtainable: true },
        { id: 'armor_hidden', formId: '0x00AR0002', name: 'Hidden', obtainable: false },
        { id: 'armor_default', formId: '0x00AR0003', name: 'Default obtainable' },
      ];
      await writeOutput(dir(), { path: 'armor.json', content: armorOnDisk });

      const extractSpy = vi.spyOn(extractOmodsModule, 'extractOmods');
      const weapon = minimalWeapon({ id: 'weap_armor', formId: '0x00WE0007' });
      const ctx = createPassContext(
        emptyOmodsClient(),
        'live',
        dir(),
        new Map([['weapons', weaponsMemory([weapon])]]),
      );
      await omodsPass.run(ctx);

      const obtainableArmor = extractSpy.mock.calls[0]?.[0]?.obtainableArmorFormIds;
      expect(obtainableArmor).toEqual(new Set(['0x00AR0001', '0x00AR0003']));
    });
  });
});

describe('pass smoke tests', () => {
  it('weaponsPass wires extractWeapons → weapons.json output', async () => {
    const fixerRecord = fixer as unknown as EsmRecord;
    const client = createInMemoryEsmSource({
      records: { '0x0046D2A1': fixerRecord },
      rows: [
        {
          form_id: '0x0046D2A1',
          record_type: 'WEAP',
          editor_id: 'CombatRifle_Fixer',
          name: 'The Fixer',
        },
      ],
      resolveEdidMap: {
        '0x0004A0A1': 'WeaponTypeRifle',
      },
      resolveEdidFallback: (formId) => `kw_${formId}`,
      getFallback: perkPlaceholder,
    });
    const ctx = createPassContext(client, 'live', '/unused/out', new Map());
    const { raw, result } = await weaponsPass.run(ctx);

    expect(result.outputs).toEqual([{ path: 'weapons.json', content: raw.weapons }]);
    expect(raw.weapons.some((w) => w.id === 'CombatRifle_Fixer')).toBe(true);
    expect(result.counts).toEqual({ weapons: raw.weapons.length });
  });

  it('bodypartsPass wires extractBodyParts → bodyparts.json output', async () => {
    const client = createInMemoryEsmSource({ records: humanBodyPartRecords() });
    const ctx = createPassContext(client, 'live', '/unused/out', new Map());
    const { raw, result } = await bodypartsPass.run(ctx);

    expect(result.outputs).toEqual([{ path: 'bodyparts.json', content: raw.races }]);
    expect(raw.races.some((r) => r.id === 'HumanRace')).toBe(true);
    expect(result.counts).toEqual({ bodypartRaces: raw.races.length });
  });

  it('constantsPass wires extractConstants → constants.json output', async () => {
    const records = {
      ...validConstantsRecords(),
      '0x000002C2': avifStrength as unknown as EsmRecord,
    };
    const client = createInMemoryEsmSource({ records });
    const ctx = createPassContext(client, 'live', '/unused/out', new Map());
    const { raw, result } = await constantsPass.run(ctx);

    expect(result.outputs).toEqual([{ path: 'constants.json', content: raw.constants }]);
    expect(raw.constants.special).toEqual({ min: 1, max: 100 });
    expect(result.counts).toEqual({ constants: 1 });
  });

  it('curvetablesPass routes outputs to ../curvetables (outside outDir)', async () => {
    const client = curveTableClient([
      { form_id: '0x0076E999', editor_id: 'CT_Creatures_Armor_Universal_Tier22' },
    ]);
    const outDir = '/unused/out';
    const curveDir = path.join(outDir, '..', 'curvetables');
    const ctx = createPassContext(client, 'live', outDir, new Map());
    const { raw, result } = await curvetablesPass.run(ctx);

    expect(
      raw.files.some((f) => f.relativePath === 'creatures/armor/armor_universal_tier22.json'),
    ).toBe(true);
    expect(
      result.outputs.some(
        (o) =>
          o.path === path.join(curveDir, 'creatures/armor/armor_universal_tier22.json') &&
          !o.path.startsWith(outDir),
      ),
    ).toBe(true);
    expect(
      result.outputs.some((o) => o.raw === true && o.path.endsWith('index.generated.ts')),
    ).toBe(true);
  });
});
