import { describe, it, expect } from 'vitest';
import { getUnresolvedOverrideKeys } from '@/data/dataset';
import generatedUniquesLive from '@/data/live/generated/uniques.json';
import { generatedWeaponsRaw as generatedWeaponsRawLive } from '@/data/live/weapons';
import { getOmodById } from '@/data/omods';
import type { GeneratedUnique } from '@/types/generated';

/**
 * Overlay reviewer: every hand-maintained override table (src/data/overrides/*)
 * must still target a real generated id. A failure here means a `pnpm extract`
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

describe('generated uniques resolve', () => {
  it('every unique id maps to an omod and baseWeaponId to a generated weapon (live)', () => {
    const weaponIds = new Set(generatedWeaponsRawLive.map(w => w.id));
    for (const unique of generatedUniquesLive as unknown as GeneratedUnique[]) {
      expect(getOmodById('live', unique.id), `${unique.id} omod`).toBeDefined();
      expect(weaponIds.has(unique.baseWeaponId), `${unique.baseWeaponId} weapon`).toBe(true);
    }
  });
});
