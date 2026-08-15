import type { GeneratedArmor } from '../../src/types/generated';
import { mapPool, type EsmSource } from './esm-client';
import { ObtainabilityClassifier } from './obtainability';

/**
 * Armor grounding pass (docs/assumptions.md "Armor extraction pipeline"):
 * list + classify ARMO records so the omods pass can
 * derive armor-OMOD obtainability the same way it already does for weapons
 * (an OMOD referenced by an obtainable ARMO's own attach/template chain
 * rides along — the WEAP-riding rule's ARMO parallel, obtainability.ts).
 *
 * Deliberately NOT a full armor dataset: no resistances, no mod slots, no
 * damage/DR modeling — no UI consumer exists yet for any of that. This is
 * grounding data only; a `GeneratedArmor` row is `{id, formId, name,
 * obtainable}`, mirroring the minimal identity shape every other extractor
 * uses for its obtainability derivation input (cf. GeneratedWeapon's
 * `obtainableFormIds` output).
 */

// Dev/dead-record and non-player-equippable prefixes (creature skins, FX
// camera overlays, NPC-only creature clothes). Cheap pre-filter only —
// obtainability derivation (reverse references) is the real gate. Mirrors
// extract-weapons.ts's EXCLUDED_EDID_PATTERNS / extract-omods.ts's
// OMOD_JUNK_EDID_RE dev-prefix set, plus armor-specific non-equippable kinds.
const EXCLUDED_EDID_PATTERNS = [
  /^zzz/i,
  /^del_/i,
  /^deleted/i,
  /^deprecated/i,
  /^hto_/i,
  /^xpd_/i,
  /^post_/i,
  /^test/i,
  /^debug/i,
  /^mtnm/i,
  /^cut_/i,
  // Creature/actor skins and NPC-only worn clothes — never a player armor
  // piece (no Attach Parent Slots / legendary mod slots either).
  /^skin/i,
  /^creatureclothes_/i,
  // Camera/UI visual-effect overlays reusing the ARMO record type.
  /^fx/i,
  /NONPLAYABLE/i,
];

/** Exposed for tests: does the pre-filter drop this editor_id? */
export function isExcludedArmorEdid(edid: string): boolean {
  return EXCLUDED_EDID_PATTERNS.some((p) => p.test(edid));
}

export interface ExtractArmorResult {
  armors: GeneratedArmor[];
  /** Formids of obtainable armor pieces — feeds the OMOD obtainability pass (extract-omods.ts). */
  obtainableFormIds: Set<string>;
}

export async function extractArmor(client: EsmSource): Promise<ExtractArmorResult> {
  const rows = await client.list('ARMO');
  const candidateRows = rows.filter((r) => !isExcludedArmorEdid(r.editor_id));
  const records = await mapPool(candidateRows, 8, (r) => client.get(r.form_id));

  const armors: GeneratedArmor[] = records
    .filter((r) => !!r.fields['Name'])
    .map((r) => ({
      id: r.editor_id,
      formId: r.header.form_id,
      name: r.fields['Name'] as string,
    }));

  // Obtainability derivation (see extract-weapons.ts for the flag semantics:
  // failures stay in the data as obtainable:false for app-side hiding/
  // rescue). No obtainableWeaponFormIds/cobjIndex needed — real armor pieces
  // are directly referenced by COBJ/LVLI/GMRW/CONT, not riding on anything.
  const classifier = new ObtainabilityClassifier(client);
  const verdicts = await classifier.classify(armors.map((a) => ({ formId: a.formId, edid: a.id })));
  const obtainableFormIds = new Set<string>();
  for (const armor of armors) {
    const verdict = verdicts.get(armor.formId);
    armor.obtainable = verdict?.obtainable ?? false;
    if (armor.obtainable) obtainableFormIds.add(armor.formId);
  }

  armors.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return { armors, obtainableFormIds };
}
