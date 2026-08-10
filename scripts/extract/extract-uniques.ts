import { omodNameOverrides } from '../../src/data/overrides/omod-corrections';
import { cutUniqueIdentityOmodIds } from './cut-unique-identity-omod-ids';
import type { GeneratedOmod, GeneratedUnique, GeneratedWeapon } from '../../src/types/generated';
import type { EsmSource } from './esm-client';
import { isExcludedOmodEdid, isVariantContainer } from './extract-omods';
import { walkWeaponCombinations } from './extract-weapons';

const COSMETIC_SLOT_RE = /appearance|paint|skin|material/i;
const LEGENDARY_SLOT_RE = /^ap_Legendary(\d+)$/;
// The game's shared "this star rolls at random" pool selector — e.g.
// modcol_Legendary_Crafting_Weapon2 (formId 0x007904EB) at ap_Legendary2.
// `Data.Form Type = None` (not Weapon), so extract-omods.ts's Form-Type
// filter legitimately excludes it from omods.json — it's never a real
// equippable mod. Without this, a combo's Includes list still names it at a
// real ap_LegendaryN attach point, but the per-combo loop below silently
// drops the formId (not in omodByFormId) and legendaryEffects gets truncated
// instead of getting a positional `null` — found 2026-07-15 auditing
// Foundation's Vengeance / Cryptid Jawbone Knife (both fixed ★1 + random
// ★2/★3, patch-summary.md).
const RANDOM_LEGENDARY_SLOT_RE = /^modcol_Legendary_Crafting_Weapon(\d+)$/;

/** Dev/cut/NPC-only identity mods on ap_customName that lack ObjectTypeUnique. */
const IDENTITY_JUNK_EDID_RE = /^(deprecated|Burn_Bounty|Burn_BountyEnchantment)/i;

function sharesTargetKeywordGate(a: GeneratedOmod, b: GeneratedOmod): boolean {
  if (a.targetKeywords.length === 0 || b.targetKeywords.length === 0) return false;
  const bSet = new Set(b.targetKeywords);
  return a.targetKeywords.every((kw) => bSet.has(kw));
}

/** Exposed for tests — structural exclusion for widened ap_customName identity mods. */
export function isExcludedIdentityOmod(omod: GeneratedOmod): boolean {
  const id = omod.id;
  if (omod.obtainable === false) return true;
  if (id.startsWith('_PARENT_')) return true;
  if (IDENTITY_JUNK_EDID_RE.test(id)) return true;
  if (/MutationNameMod_/i.test(id)) return true;
  if (/^cr[^a-z]/.test(id)) return true;
  if (isExcludedOmodEdid(id)) return true;
  return false;
}

function isIdentityOmod(omod: GeneratedOmod): boolean {
  // MoM (Mistress of Mystery) blades ride ap_Item_Description; Cursed identity mods
  // (Nuka-World on Tour) moved to their own ap_curse attach point in the 20260724 patch.
  // See src/data/omods.ts for the attach-point layout.
  if (omod.attachPointEdid === 'ap_Item_Description') return true;
  if (omod.attachPointEdid === 'ap_customName') return !isExcludedIdentityOmod(omod);
  return false;
}

function isCosmeticAttachPoint(attachPointEdid: string): boolean {
  if (attachPointEdid === 'ap_customName' || attachPointEdid === 'ap_Item_Description')
    return false;
  return COSMETIC_SLOT_RE.test(attachPointEdid);
}

/**
 * Unique preset display name precedence (highest first):
 * 1. `omodNameOverrides` (hand-maintained)
 * 2. Identity OMOD Name with " Custom Mod"/" Custom Name" suffix stripped
 * 3. Object Template Combination.Name fallback
 *
 * The OMOD's `CustomItemName_*` added keyword resolved through the `dn_CommonGun`
 * Instance Naming Rules record (INNR 0x002377CF) is the game's actual naming
 * mechanism and would be the most-correct source, but the `esm` CLI's INNR decoder
 * currently can't pair that ruleset's keywords with their display strings (an upstream
 * `FO76-Tools/esm` schema issue) — this OMOD-Name fallback is the best available
 * approximation today, not a final answer.
 */
function stripIdentityOmodNameSuffix(name: string): string {
  return name.replace(/\s+Custom (Mod|Name)$/i, '');
}

async function resolveContainerPresetName(
  client: EsmSource,
  containerEdid: string,
  containerFormId: string,
  comboName: string,
): Promise<string> {
  const override = omodNameOverrides[containerEdid];
  if (override !== undefined) return override;
  try {
    const record = await client.get(containerFormId);
    const fromOmod = stripIdentityOmodNameSuffix(
      ((record.fields['Name'] as string | undefined) ?? record.editor_id).trim(),
    );
    if (fromOmod) return fromOmod;
  } catch {
    /* fall through */
  }
  return comboName;
}

function resolveUniquePresetName(identityOmod: GeneratedOmod, comboName: string): string {
  const override = omodNameOverrides[identityOmod.id];
  if (override !== undefined) return override;
  const fromOmod = stripIdentityOmodNameSuffix(identityOmod.name).trim();
  if (fromOmod) return fromOmod;
  return comboName;
}

export interface SkippedUniqueCombination {
  weaponId: string;
  combinationName: string;
  reason: string;
}

export interface ExtractUniquesResult {
  uniques: GeneratedUnique[];
  skipped: SkippedUniqueCombination[];
}

function lowestFormIdVariant(variants: GeneratedOmod[]): GeneratedOmod {
  return [...variants].sort((a, b) => a.formId.localeCompare(b.formId))[0];
}

async function resolveVariantContainer(
  client: EsmSource,
  containerFormId: string,
  omodByFormId: Map<string, GeneratedOmod>,
  variantContainers: Record<string, GeneratedOmod[]> | undefined,
): Promise<{
  defaultOmod: GeneratedOmod;
  variantIds: string[];
  containerEdid: string;
  containerFormId: string;
} | null> {
  const fromExtract = variantContainers?.[containerFormId];
  if (fromExtract?.length) {
    const sorted = [...fromExtract].sort((a, b) => a.formId.localeCompare(b.formId));
    const containerEdid = sorted[0].variantOf ?? '';
    return {
      defaultOmod: sorted[0],
      variantIds: sorted.map((v) => v.id),
      containerEdid,
      containerFormId,
    };
  }
  try {
    const containerRecord = await client.get(containerFormId);
    if (!isVariantContainer(containerRecord)) return null;
    const data = (containerRecord.fields['Data'] ?? {}) as Record<string, unknown>;
    const includes = data['Includes'];
    if (!Array.isArray(includes)) return null;
    const variantFormIds = (includes as Array<Record<string, unknown>>)
      .map((i) => i['Mod'])
      .filter((m): m is string => typeof m === 'string')
      .sort();
    const variantOmods = variantFormIds
      .map((id) => omodByFormId.get(id))
      .filter((o): o is GeneratedOmod => o !== undefined);
    if (variantOmods.length === 0) return null;
    const defaultOmod = lowestFormIdVariant(variantOmods);
    return {
      defaultOmod,
      variantIds: variantOmods.map((v) => v.id),
      containerEdid: containerRecord.editor_id,
      containerFormId,
    };
  } catch {
    return null;
  }
}

export async function extractUniques(
  client: EsmSource,
  weapons: GeneratedWeapon[],
  omods: GeneratedOmod[],
  variantContainers: Record<string, GeneratedOmod[]> = {},
): Promise<ExtractUniquesResult> {
  const omodByFormId = new Map(omods.map((o) => [o.formId, o]));
  const omodById = new Map(omods.map((o) => [o.id, o]));
  const uniques: GeneratedUnique[] = [];
  const skipped: SkippedUniqueCombination[] = [];
  const seenIdentityIds = new Set<string>();

  for (const weapon of weapons) {
    const record = await client.get(weapon.formId);
    const combinations = walkWeaponCombinations(record.fields);
    // Standalone unique WEAPs (Fixer, Cold Shoulder instance record, …) ship a
    // single Object Template combination — they stay plain weapon-picker entries.
    if (combinations.length <= 1) continue;

    for (const combo of combinations) {
      let identityOmod: GeneratedOmod | undefined;
      let variantIds: string[] | undefined;
      let variantContainer: { edid: string; formId: string } | undefined;
      const mods: Record<string, string> = {};
      const legendaryByIndex = new Map<number, string>();
      const randomLegendaryIndices = new Set<number>();

      for (const formId of combo.modFormIds) {
        let omod = omodByFormId.get(formId);
        if (!omod) {
          const resolved = await resolveVariantContainer(
            client,
            formId,
            omodByFormId,
            variantContainers,
          );
          if (resolved) {
            omod = resolved.defaultOmod;
            variantIds = resolved.variantIds;
            variantContainer = {
              edid: resolved.containerEdid,
              formId: resolved.containerFormId,
            };
          }
        }
        if (!omod) {
          // Not in the (Weapon-Form-Type-filtered) omods dataset — check if
          // it's the shared random-legendary-pool selector before giving up.
          const edid = await client.resolveEdid(formId);
          const randomMatch = RANDOM_LEGENDARY_SLOT_RE.exec(edid);
          if (randomMatch) randomLegendaryIndices.add(parseInt(randomMatch[1], 10) - 1);
          continue;
        }

        const slot = omod.attachPointEdid;
        const legendaryMatch = LEGENDARY_SLOT_RE.exec(slot);
        if (legendaryMatch) {
          legendaryByIndex.set(parseInt(legendaryMatch[1], 10) - 1, omod.id);
          continue;
        }

        if (isIdentityOmod(omod)) {
          identityOmod = omod;
          mods[slot] = omod.id;
          continue;
        }

        if (!isCosmeticAttachPoint(slot)) mods[slot] = omod.id;
      }

      if (!identityOmod) continue;

      if (cutUniqueIdentityOmodIds.has(identityOmod.id)) continue;

      if (seenIdentityIds.has(identityOmod.id)) {
        skipped.push({
          weaponId: weapon.id,
          combinationName: combo.name,
          reason: `duplicate identity mod ${identityOmod.id}`,
        });
        continue;
      }

      // maxLegendaryIndex covers BOTH fixed stars and random-pool slots, so a
      // combo with e.g. only ★1 fixed + ★2/★3 random emits
      // [omodId, null, null] — not a truncated length-1 array.
      const allIndices = [...legendaryByIndex.keys(), ...randomLegendaryIndices];
      const maxLegendaryIndex = allIndices.length > 0 ? Math.max(...allIndices) : -1;
      const legendaryEffects: (string | null)[] = [];
      for (let i = 0; i <= maxLegendaryIndex; i++) {
        legendaryEffects[i] = legendaryByIndex.get(i) ?? null;
      }

      seenIdentityIds.add(identityOmod.id);
      const presetName = variantContainer
        ? await resolveContainerPresetName(
            client,
            variantContainer.edid,
            variantContainer.formId,
            combo.name,
          )
        : resolveUniquePresetName(identityOmod, combo.name);
      uniques.push({
        id: identityOmod.id,
        name: presetName,
        baseWeaponId: weapon.id,
        mods,
        legendaryEffects,
        ...(variantIds ? { variantIds } : {}),
      });
    }
  }

  // COBJ-granted identity mods (e.g. Cosmic Knife Super-Heated) share a
  // target-keyword gate with a template-combination sibling but never appear in
  // Object Template Includes — emit a minimal preset on the same base weapon.
  for (const omod of omods) {
    if (
      !isIdentityOmod(omod) ||
      seenIdentityIds.has(omod.id) ||
      cutUniqueIdentityOmodIds.has(omod.id)
    )
      continue;

    let baseWeaponId: string | undefined;
    for (const unique of uniques) {
      const sibling = omodById.get(unique.id);
      if (!sibling || !sharesTargetKeywordGate(sibling, omod)) continue;
      baseWeaponId = unique.baseWeaponId;
      break;
    }
    if (!baseWeaponId) continue;

    seenIdentityIds.add(omod.id);
    uniques.push({
      id: omod.id,
      name: resolveUniquePresetName(omod, ''),
      baseWeaponId,
      mods: { [omod.attachPointEdid]: omod.id },
      legendaryEffects: [],
    });
  }

  return { uniques, skipped };
}
