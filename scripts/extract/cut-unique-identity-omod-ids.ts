/**
 * Identity-attach-point (`ap_customName` / `ap_Item_Description`) OMODs for
 * unique-weapon presets that are cut or unreleased content with no
 * player-facing grant path — `extractUniques` must not synthesize a preset
 * from these.
 *
 * This is an EXTRACTION-TIME policy ("never derive a unique preset from this
 * record"), deliberately distinct from the app-side OMOD picker's hidden set
 * (`src/data/overrides/omod-corrections.ts`'s `hiddenOmodIds`, which decides
 * picker + unique-preset VISIBILITY and is not read here). The two lists
 * intersect on exactly these ids and that is intentional — both policies
 * genuinely apply. `__tests__/cut-unique-identity-omod-ids.test.ts` pins the
 * subset relation so they cannot drift apart.
 */
export const cutUniqueIdentityOmodIds: ReadonlySet<string> = new Set<string>([
  // Unique identity mod riding its base weapon's template with NO
  // player-facing grant chain (2026-07-14 refs walks,
  // docs/assumptions.md "Unique weapons" "bogus" review; delete the line if one
  // ever ships):
  // The Pipe (Pipe Gun): uniques.md found no LVLI, plan or recipe exists yet
  // for this item as of the current ESM dump — re-review when a later ESM dump
  // adds a grant path (LVLI, COBJ recipe, or quest reward).
  'mod_Custom_ThePipe',
  // P62 "The Drifter" identity mods REMOVED 2026-10-29: shipped as Hideouts
  // content in the 20261026 dump (grant chain in omod-corrections.ts).
  // V63-Z Custom (Stormcutter's "Stormslasher" template) slot-family unlock
  // markers: empty ap_Item_Description OMODs whose COBJs (Learn Method 5,
  // challenge) only drive the bench's mods-unlocked counter. Not uniques; the
  // real mods are the _01/_02 slot variants (walked 2026-10-29).
  'mod_custom_StormSlasher_Burning00',
  'mod_custom_StormSlasher_Channeler00',
  'mod_custom_StormSlasher_Crusher00',
  'mod_custom_StormSlasher_OneShot00',
  'mod_custom_StormSlasher_Static00',
  'mod_custom_StormSlasher_Stormwalker00',
]);
