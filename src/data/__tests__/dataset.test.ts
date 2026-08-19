import { describe, it, expect } from 'bun:test';
import { getDataset, getUnresolvedOverrideKeys } from '@/data/dataset';
import generatedArmorOmodsLive from '@/data/live/generated/armor-omods.json';
import generatedUniquesLive from '@/data/live/generated/uniques.json';
import { generatedWeaponsRaw as generatedWeaponsRawLive } from '@/data/live/weapons';
import { getOmodById } from '@/data/omods';
import { armorLegendaryValueOverrides } from '@/data/overrides/armor-values';
import { legendaryValueOverrides } from '@/data/overrides/legendary-values';
import type { GeneratedUnique } from '@/types/generated';

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

describe('generated uniques resolve', () => {
  it('every unique id maps to an omod and baseWeaponId to a generated weapon (live)', () => {
    const weaponIds = new Set(generatedWeaponsRawLive.map((w) => w.id));
    for (const unique of generatedUniquesLive as unknown as GeneratedUnique[]) {
      expect(getOmodById('live', unique.id), `${unique.id} omod`).toBeDefined();
      expect(weaponIds.has(unique.baseWeaponId), `${unique.baseWeaponId} weapon`).toBe(true);
    }
  });
});
