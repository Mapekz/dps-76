import type { GeneratedOmod, GeneratedUnique, GeneratedWeapon } from '../../src/types/generated';
import type { EsmClient } from './esm-client';
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

function isIdentityOmod(omod: GeneratedOmod): boolean {
  if (omod.attachPointEdid === 'ap_customName' && omod.addedKeywords.includes('ObjectTypeUnique')) return true;
  // Cursed uniques ride ap_Item_Description (Broadsider, MoM blades, …).
  if (omod.attachPointEdid === 'ap_Item_Description') return true;
  return false;
}

function isCosmeticAttachPoint(attachPointEdid: string): boolean {
  if (attachPointEdid === 'ap_customName' || attachPointEdid === 'ap_Item_Description') return false;
  return COSMETIC_SLOT_RE.test(attachPointEdid);
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

export async function extractUniques(
  client: EsmClient,
  weapons: GeneratedWeapon[],
  omods: GeneratedOmod[]
): Promise<ExtractUniquesResult> {
  const omodByFormId = new Map(omods.map(o => [o.formId, o]));
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
      const mods: Record<string, string> = {};
      const legendaryByIndex = new Map<number, string>();
      const randomLegendaryIndices = new Set<number>();

      for (const formId of combo.modFormIds) {
        const omod = omodByFormId.get(formId);
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
      uniques.push({
        id: identityOmod.id,
        name: combo.name,
        baseWeaponId: weapon.id,
        mods,
        legendaryEffects,
      });
    }
  }

  return { uniques, skipped };
}
