/**
 * `cutUniqueIdentityOmodIds` and `hiddenOmodIds` overlap on exactly four
 * identity-attach-point OMODs — that is deliberate, not duplication. Extraction
 * uses the cut list to skip synthesizing unique presets from unreleased
 * content; the app picker uses `hiddenOmodIds` (21 entries, including
 * non-identity attach points) to keep those records out of the OMOD UI. Both
 * policies genuinely apply to the four shared ids; the subset assertion here
 * stops them drifting apart.
 */
import { describe, it, expect } from 'bun:test';
import { cutUniqueIdentityOmodIds } from '../cut-unique-identity-omod-ids';
import { hiddenOmodIds } from '../../../src/data/overrides/omod-corrections';

const EXPECTED_IDS = [
  'mod_Custom_ThePipe',
  'P62_Mod_Custom_Splinter_CustomName',
  'P62_Mod_Custom_Tempest_CustomName',
  'P62_Mod_Custom_ChaosEngine_CustomName',
] as const;

describe('cutUniqueIdentityOmodIds', () => {
  it('is a non-empty subset of hiddenOmodIds', () => {
    expect(cutUniqueIdentityOmodIds.size).toBeGreaterThan(0);
    for (const id of cutUniqueIdentityOmodIds) {
      expect(hiddenOmodIds.has(id)).toBe(true);
    }
  });

  it('contains exactly the four expected identity-attach-point ids', () => {
    expect([...cutUniqueIdentityOmodIds].sort()).toEqual([...EXPECTED_IDS].sort());
    expect(cutUniqueIdentityOmodIds.size).toBe(EXPECTED_IDS.length);
  });
});
