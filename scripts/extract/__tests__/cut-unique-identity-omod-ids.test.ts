/**
 * `cutUniqueIdentityOmodIds` and `hiddenOmodIds` overlap on their
 * identity-attach-point OMODs — that is deliberate, not duplication. Extraction
 * uses the cut list to skip synthesizing unique presets from unreleased
 * content; the app picker uses `hiddenOmodIds` (including non-identity attach
 * points) to keep those records out of the OMOD UI. Both policies genuinely
 * apply to the shared ids; the subset assertion here stops them drifting apart.
 */
import { describe, it, expect } from 'bun:test';
import { cutUniqueIdentityOmodIds } from '../cut-unique-identity-omod-ids';
import { hiddenOmodIds } from '../../../src/data/overrides/omod-corrections';

const EXPECTED_IDS = [
  'mod_Custom_ThePipe',
  'mod_custom_StormSlasher_Burning00',
  'mod_custom_StormSlasher_Channeler00',
  'mod_custom_StormSlasher_Crusher00',
  'mod_custom_StormSlasher_OneShot00',
  'mod_custom_StormSlasher_Static00',
  'mod_custom_StormSlasher_Stormwalker00',
] as const;

describe('cutUniqueIdentityOmodIds', () => {
  it('is a subset of hiddenOmodIds', () => {
    for (const id of cutUniqueIdentityOmodIds) {
      expect(hiddenOmodIds.has(id)).toBe(true);
    }
  });

  it('contains exactly the expected identity-attach-point ids', () => {
    expect([...cutUniqueIdentityOmodIds].sort()).toEqual([...EXPECTED_IDS].sort());
  });
});
