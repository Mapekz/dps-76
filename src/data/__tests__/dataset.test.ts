import { describe, it, expect } from 'bun:test';
import { buildDataset, getDataset, getUnresolvedOverrideKeys } from '@/data/dataset';
import type { DatasetSource, HandAuthored } from '@/data/dataset';
import generatedArmorOmodsLive from '@/data/live/generated/armor-omods.json';
import generatedOmodsLive from '@/data/live/generated/omods.json';
import generatedMutationsLive from '@/data/live/generated/mutations.json';
import generatedConsumablesLive from '@/data/live/generated/consumables.json';
import generatedUniquesLive from '@/data/live/generated/uniques.json';
import { generatedWeaponsRaw as generatedWeaponsRawLive } from '@/data/live/weapons';
import { getOmodById } from '@/data/omods';
import { armorLegendaryValueOverrides } from '@/data/overrides/armor-values';
import { buffValueOverrides } from '@/data/overrides/buff-overrides';
import { legendaryValueOverrides } from '@/data/overrides/legendary-values';
import type { GeneratedConstants, GeneratedOmod, GeneratedUnique } from '@/types/generated';
import type { Modifier } from '@/types/modifiers';

/**
 * Overlay reviewer: every hand-maintained override table (src/data/overrides/*)
 * must still target a real generated id. A failure here means a `bun run extract`
 * renamed/removed something an override keys off of — the override is now
 * silently inert. Fix by updating or removing the stale entry (see the
 * overlay's own file for its source-comment convention).
 */
describe('getUnresolvedOverrideKeys', () => {
  it('has no stale overlay keys on live', () => {
    expect(getUnresolvedOverrideKeys('live')).toEqual([]);
  });

  it('has no stale overlay keys on pts', () => {
    expect(getUnresolvedOverrideKeys('pts')).toEqual([]);
  });
});

describe('omod descriptions in the Merged Dataset', () => {
  it("serves the Medic's Heal-Allies / DoT interaction override", () => {
    expect(
      getDataset('live').omods.find((o) => o.id === 'mod_Legendary_Weapon1_Medic')?.description,
    ).toBe(
      'heals allies for a portion of base damage dealt — DoTs (bleed/burn/poison) never trigger it',
    );
  });
});

describe('consumable descriptions in the Merged Dataset', () => {
  it('serves the polished house style, from derivation or override', () => {
    const byId = new Map(getDataset('live').consumables.map((c) => [c.id, c]));
    // Mechanically derived (extract-buffs' STAT_XPMult percent rule) — no
    // override entry; pins the derivation's house style directly.
    expect(byId.get('BobbleHead_Leader_Potion')?.description).toBe('+5% XP');
    // Override-pinned: the raw derivation can't see the GLOB the template's
    // magnitude lives in (Backwoodsman04_Chance_Global).
    expect(byId.get('Magazine_Backwoodsman04_Potion')?.description).toBe(
      '+50% chance of double yield when harvesting plants',
    );
  });
});

describe('getDataset value overlays', () => {
  it('folds a real legendary modifier override into the live Merged Dataset', () => {
    const id = 'mod_Legendary_Weapon2_DmgLimbs';
    expect(getDataset('live').omods.find((omod) => omod.id === id)?.modifiers).toEqual(
      legendaryValueOverrides[id],
    );
  });
});

/**
 * `armor-values.ts` opens by promising "Every value below is still the
 * extracted ESM value; only the condition shape changes" — these entries
 * REPLACE a record's whole modifier array to fix a condition-translation
 * artifact, never to supply a magnitude the ESM doesn't have. Nothing enforced
 * that until now, so a balance patch that retuned one of these chances would
 * update `armor-omods.json` and leave the app serving the stale literal
 * silently (the wholesale replace masks it, and `extract:diff` reports
 * modifier COUNT changes, not value changes).
 *
 * Magnitudes only — condition/bucket reshaping is the whole point of these
 * entries, so shape is deliberately not asserted. A failure means the ESM
 * moved: re-read the record (`esm get <formId>`) and update the override's
 * values, don't relax this test.
 */
describe('armor value overrides preserve extracted magnitudes', () => {
  const extractedById = new Map(generatedArmorOmodsLive.map((omod) => [omod.id, omod]));
  /**
   * Plain magnitude, or null for a curve-driven modifier (excluded: it carries
   * `curve`/`curveScale` instead of a scalar to compare). Takes `unknown`
   * because the two sides are differently typed — a checked-in JSON import
   * (widened) and the `Modifier` union (discriminated on `curve`).
   */
  const magnitude = (m: unknown): number | null => {
    const value = (m as { value?: unknown }).value;
    return typeof value === 'number' ? value : null;
  };

  for (const [id, overrides] of Object.entries(armorLegendaryValueOverrides)) {
    it(`${id} only re-shapes conditions, never magnitudes`, () => {
      const extracted = extractedById.get(id);
      expect(extracted, `${id} has no generated record`).toBeDefined();
      const extractedValues = new Set(
        extracted!.modifiers.map(magnitude).filter((v): v is number => v !== null),
      );
      for (const override of overrides) {
        const value = magnitude(override);
        if (value === null) continue;
        expect(
          extractedValues.has(value),
          `${id}: override value ${value} is not among the extracted values ${[
            ...extractedValues,
          ].join(', ')}`,
        ).toBe(true);
      }
    });
  }
});

type MagnitudePolicy =
  | { mode: 'must-match-source' }
  | { mode: 'pinned-divergence'; pinnedScalars: readonly number[]; note: string };

/** Shared scalar extractor — curve-driven modifiers carry no scalar `value`. */
const magnitude = (m: unknown): number | null => {
  const value = (m as { value?: unknown }).value;
  return typeof value === 'number' ? value : null;
};

function runMagnitudePolicyTests(
  label: string,
  overrides: Readonly<Record<string, Modifier[]>>,
  extractedById: ReadonlyMap<string, { modifiers: unknown[] }>,
  policy: Readonly<Record<string, MagnitudePolicy>>,
) {
  describe(`${label} preserve magnitudes`, () => {
    for (const [id, entryPolicy] of Object.entries(policy)) {
      it(`${id} (${entryPolicy.mode})`, () => {
        const overridesForId = overrides[id];
        expect(overridesForId, `${id} missing from overrides table`).toBeDefined();
        if (entryPolicy.mode === 'pinned-divergence') {
          const actualScalars = overridesForId!
            .map(magnitude)
            .filter((v): v is number => v !== null);
          expect(actualScalars).toEqual([...entryPolicy.pinnedScalars]);
          return;
        }
        const extracted = extractedById.get(id);
        expect(extracted, `${id} has no generated record`).toBeDefined();
        const extractedValues = new Set(
          extracted!.modifiers.map(magnitude).filter((v): v is number => v !== null),
        );
        for (const override of overridesForId!) {
          const value = magnitude(override);
          if (value === null) continue;
          expect(
            [...extractedValues].some((v) => Math.abs(v - value) < 1e-9),
            `${id}: override value ${value} is not among the extracted values ${[
              ...extractedValues,
            ].join(', ')}`,
          ).toBe(true);
        }
      });
    }
  });
}

/**
 * `legendary-values.ts` REPLACES whole modifier arrays — often to drop
 * extraction artifacts or supply script-computed magnitudes. Pin every entry's
 * policy so an ESM sync forces a conscious adjudication.
 */
const LEGENDARY_MAGNITUDE_POLICY = {
  mod_Legendary_Weapon2_DmgLimbs: {
    mode: 'pinned-divergence',
    pinnedScalars: [],
    note: 'Filters Medic ally-heal ×0 rows; keeps limb curve only',
  },
  mod_Legendary_Weapon4_Conductors: {
    mode: 'pinned-divergence',
    pinnedScalars: [10, 20],
    note: 'Script-computed instant AP + HoT split',
  },
  mod_Cremator_Reciever_SlowBurner: {
    mode: 'pinned-divergence',
    pinnedScalars: [],
    note: 'SET op flip for weapon-intrinsic DoT replacement (curve matches extract)',
  },
  mod_melee_Shishkebab_ExtraFlameJets: {
    mode: 'pinned-divergence',
    pinnedScalars: [-0.2, 0],
    note: 'SET 0 silences orphaned ballistic bleed; fire curve is SET not ADD',
  },
} as const satisfies Record<string, MagnitudePolicy>;

runMagnitudePolicyTests(
  'legendary value overrides',
  legendaryValueOverrides,
  new Map(generatedOmodsLive.map((omod) => [omod.id, omod])),
  LEGENDARY_MAGNITUDE_POLICY,
);
describe('legendary value overrides magnitude policy coverage', () => {
  it('covers every entry', () => {
    expect(Object.keys(legendaryValueOverrides).sort()).toEqual(
      Object.keys(LEGENDARY_MAGNITUDE_POLICY).sort(),
    );
  });
});

/**
 * `buff-overrides.ts` REPLACES mutation/consumable modifiers — some entries
 * only reshape conditions (magnitude unchanged), others restore values the
 * extractor cannot see.
 */
const BUFF_MAGNITUDE_POLICY = {
  BobbleHead_BigGuns_Potion: { mode: 'must-match-source' },
  GHL_GlowingBobbleHead_BigGuns_Potion: { mode: 'must-match-source' },
  Magazine_USCovertOps08_Potion: { mode: 'must-match-source' },
  Magazine_AwesomeTales10_Potion: { mode: 'must-match-source' },
  E08A_Brew_GulpershineFresh: { mode: 'must-match-source' },
  E08A_Brew_GulpershineVintage: { mode: 'must-match-source' },
  Magazine_LiveAndLove05_Potion: { mode: 'must-match-source' },
  Magazine_GunsAndBullets06_Potion: { mode: 'must-match-source' },
  Magazine_Unstoppables01_Potion: { mode: 'must-match-source' },
  Magazine_Unstoppables02_Potion: { mode: 'must-match-source' },
  Magazine_Unstoppables03_Potion: {
    mode: 'pinned-divergence',
    pinnedScalars: [0],
    note: 'Extractor emits no modifier for explosion-damage proc family',
  },
  Magazine_Unstoppables04_Potion: { mode: 'must-match-source' },
  Magazine_Unstoppables05_Potion: { mode: 'must-match-source' },
} as const satisfies Record<string, MagnitudePolicy>;

runMagnitudePolicyTests(
  'buff value overrides',
  buffValueOverrides,
  new Map([...generatedMutationsLive, ...generatedConsumablesLive].map((buff) => [buff.id, buff])),
  BUFF_MAGNITUDE_POLICY,
);
describe('buff value overrides magnitude policy coverage', () => {
  it('covers every entry', () => {
    expect(Object.keys(buffValueOverrides).sort()).toEqual(
      Object.keys(BUFF_MAGNITUDE_POLICY).sort(),
    );
  });
});

describe('buildDataset OMOD overlay order', () => {
  function modifier(id: string, value: number): Modifier {
    return {
      id,
      source: { kind: 'omod', formId: '', edid: 'synthetic', name: 'Synthetic' },
      bucket: 'dbm',
      op: 'ADD',
      value,
      conditions: [],
    };
  }

  function buildSyntheticOmods(generatedOmods: GeneratedOmod[], overrides: Partial<DatasetSource>) {
    const source: DatasetSource = {
      generatedWeapons: [],
      generatedOmods,
      generatedArmorOmods: [],
      generatedPerks: [],
      generatedMutations: [],
      generatedConsumables: [],
      generatedAddictions: [],
      generatedBodyParts: [],
      generatedUniques: [],
      generatedNpcs: [],
      constants: {} as GeneratedConstants,
      legendaryValueOverrides: {},
      armorLegendaryValueOverrides: {},
      buffValueOverrides: {},
      npcOverrides: {},
      weaponCorrections: {},
      hiddenWeaponIds: new Set(),
      forceVisibleWeaponIds: new Set(),
      hiddenOmodIds: new Set(),
      forceVisibleOmodIds: new Set(),
      hiddenArmorOmodIds: new Set(),
      forceVisibleArmorOmodIds: new Set(),
      hiddenConsumableIds: new Set(),
      forceVisibleConsumableIds: new Set(),
      omodBadgeOverrides: {},
      omodWeaponRestrictions: {},
      omodNameOverrides: {},
      perWeaponSlotLabelOverrides: {},
      omodModifierAdditions: {},
      ...overrides,
    };
    return buildDataset({ perkNames: {} } as HandAuthored, source).omods[0].modifiers;
  }

  it('applies legendary replace before omodModifierAdditions concat on the same record', () => {
    const extracted = modifier('extracted', 0.1);
    const replacement = modifier('replacement', 0.2);
    const addition = modifier('addition', 0.3);
    const omod = { id: 'synthetic', name: 'Synthetic', modifiers: [extracted] } as GeneratedOmod;

    expect(
      buildSyntheticOmods([omod], {
        legendaryValueOverrides: { synthetic: [replacement] },
        omodModifierAdditions: { synthetic: [addition] },
      }),
    ).toEqual([replacement, addition]);
  });
});

describe('generated uniques resolve', () => {
  it('every unique id maps to an omod and baseWeaponId to a generated weapon (live)', () => {
    const weaponIds = new Set(generatedWeaponsRawLive.map((w) => w.id));
    for (const unique of generatedUniquesLive as unknown as GeneratedUnique[]) {
      expect(getOmodById('live', unique.id), `${unique.id} omod`).toBeDefined();
      expect(weaponIds.has(unique.baseWeaponId), `${unique.baseWeaponId} weapon`).toBe(true);
    }
  });
});
