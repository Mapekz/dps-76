/**
 * Shared OMOD ↔ weapon eligibility predicate.
 *
 * !! BOUNDARY — READ BEFORE ADDING IMPORTS !!
 * This module is consumed by BOTH the app picker (src/data/omods.ts) and the
 * extraction pipeline (scripts/extract/extract-weapons.ts, via a relative
 * import — the attach-point closure must use the exact gate the picker uses,
 * or extracted slot lists drift from what the picker offers). It must stay
 * pure: no `@/` alias, no imports from dataset.ts / overrides/* / generated
 * JSON — extraction runs against a live ESM while those read the previous,
 * checked-in generation (stale and circular). Every input is threaded by the
 * caller, including the restrictions rescue table.
 *
 * Semantics (history in dps-todos/omod-eligibility → docs/assumptions.md):
 *
 * Branch 0 — the attach point must exist on the weapon (ESM-authoritative;
 *   since the attach-point closure, `attachParentSlots` is the fixpoint over
 *   mod-granted slots, not just the WEAP record's own list).
 * Branch 1 — keyword-scoped mods (the overwhelming majority): eligible iff
 *   targetKeywords ⊆ weapon.keywords, the game's own family gate — OR the
 *   weapon's own template whitelists the mod. Many unique identity mods
 *   (Boiling Point, Drill Fist, Valkyrie, Shattered Grounds, Flatliner, …)
 *   carry an instance-only second keyword (`RD01_ma_BoilingPoint`,
 *   `ma_Corrupted`) that the base WEAP never has — the game applies it at
 *   instance creation via the very template combination that includes the
 *   mod, so template membership is the same per-weapon ESM whitelist branch
 *   2 already trusts (verified 2026-07-14: ~24 template-member uniques were
 *   keyword-blocked; no cross-weapon pollution is possible since templates
 *   are per-weapon).
 * Branch 2 — EMPTY targetKeywords match nothing by themselves (they used to
 *   match everything sharing the attach point — the source of "Vox Syringe
 *   Barrel on a gauss minigun"-class pollution). Such a mod is eligible only
 *   when this weapon's own ESM instance template whitelists it (Object
 *   Template Includes → templateModFormIds), or an explicit restrictions
 *   entry names the weapon (reward-granted identity mods with no
 *   ESM-derivable weapon tie at all).
 *
 * A crafting recipe existing (hasGrantingCobj) is deliberately NOT an input:
 * COBJs carry no CTDA/BNAM naming a weapon (verified live 2026-07-14), so a
 * recipe can never say WHICH weapon a keyword-less mod belongs to.
 */

export interface EligibleOmodView {
  /** Editor id — the restrictions rescue table is keyed by it. */
  id: string;
  formId: string;
  attachPointFormId: string;
  targetKeywords: readonly string[];
}

export interface EligibleWeaponView {
  /** Editor id — matched against restrictions entries. */
  id: string;
  attachParentSlots?: readonly string[];
  /** Keyword EDIDs (both sides of the subset check are edid-shaped). */
  keywords?: readonly string[];
  templateModFormIds?: readonly string[];
}

export function isOmodEligibleForWeapon(
  omod: EligibleOmodView,
  weapon: EligibleWeaponView,
  restrictions: Readonly<Record<string, readonly string[]>> = {}
): boolean {
  const slots = weapon.attachParentSlots ?? [];
  if (!slots.includes(omod.attachPointFormId)) return false;
  if (omod.targetKeywords.length > 0) {
    const keywords = weapon.keywords ?? [];
    return (
      omod.targetKeywords.every(k => keywords.includes(k)) ||
      (weapon.templateModFormIds ?? []).includes(omod.formId)
    );
  }
  return (
    (weapon.templateModFormIds ?? []).includes(omod.formId) ||
    (restrictions[omod.id]?.includes(weapon.id) ?? false)
  );
}
