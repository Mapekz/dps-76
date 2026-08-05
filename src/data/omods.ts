import type { GameMode, Weapon } from '@/types';
import type { GeneratedOmod } from '@/types/generated';
import { modifierHasEngineEffect } from '@/types/modifiers';
import { getDataset } from './dataset';
import { isOmodEligibleForWeapon } from './omod-eligibility';
import { isRecordVisible } from './overlay';

// Reads the merged omod list from the dataset chokepoint (legendary-value
// overrides already applied), so every access path — by-id lookup and slot
// pickers alike — sees the same patched modifiers.

/** Cosmetic/naming slots — never shown in the mod picker. */
const COSMETIC_SLOT_RE = /appearance|paint|skin|customname|item_description|material|curse/i;
/** Legendary-effect slots — handled by the legendary picker, not the mod slots. */
const LEGENDARY_SLOT_RE = /legendary/i;
/**
 * Attach points with zero real player choice — the mechanic was removed from
 * the game (universal range offsets ship stat-less) or it's a pure 3D-model
 * reskin outside COSMETIC_SLOT_RE. Curated, not heuristic: these are the only
 * two attach points whose every option is a zero-modifier non-choice
 * (roster-wide sweep, 2026-07-14, dps-todos/omod-nondps-stats.md).
 */
const DEAD_MECHANIC_SLOT_EDIDS: ReadonlySet<string> = new Set([
  'ap_Gun_UniversalOffset_Range',
  'ap_Weapon_Model_Replacement',
]);

const byIdCache = new Map<GameMode, Map<string, GeneratedOmod>>();

export function getOmodById(mode: GameMode, id: string): GeneratedOmod | undefined {
  let map = byIdCache.get(mode);
  if (!map) {
    map = new Map(getDataset(mode).omods.map((o) => [o.id, o]));
    byIdCache.set(mode, map);
  }
  return map.get(id);
}

const byFormIdCache = new Map<GameMode, Map<string, GeneratedOmod>>();

function omodsByFormId(mode: GameMode): Map<string, GeneratedOmod> {
  let map = byFormIdCache.get(mode);
  if (!map) {
    map = new Map(getDataset(mode).omods.map((o) => [o.formId, o]));
    byFormIdCache.set(mode, map);
  }
  return map;
}

/**
 * The weapon's real standard part for one attach point (from the ESM Object
 * Template's Default combination). Undefined when extraction found none or
 * the formid isn't an extracted omod (e.g. legendary-slot placeholders).
 */
export function getDefaultOmodId(mode: GameMode, weapon: Weapon, slot: string): string | undefined {
  for (const formId of weapon.defaultModFormIds ?? []) {
    const omod = omodsByFormId(mode).get(formId);
    if (omod?.attachPointEdid === slot) return omod.id;
  }
  return undefined;
}

/**
 * Default omods to fold into the effective weapon for slots the player hasn't
 * decided on — no real weapon instance has an empty slot, so an untouched (or
 * explicitly cleared) slot means its standard part. Only a *string* value in
 * `chosenMods` marks a slot as decided. Cosmetic/legendary attach points are
 * skipped (own pickers / no stats).
 */
export function getDefaultOmods(
  mode: GameMode,
  weapon: Weapon,
  chosenMods: Record<string, string | null | undefined>,
): GeneratedOmod[] {
  const out: GeneratedOmod[] = [];
  for (const formId of weapon.defaultModFormIds ?? []) {
    const omod = omodsByFormId(mode).get(formId);
    if (!omod) continue;
    if (LEGENDARY_SLOT_RE.test(omod.attachPointEdid)) continue;
    // Pure-appearance cosmetic defaults are noise, but stat-carrying ones are
    // real unique effects riding cosmetic attach points (Cold Shoulder's
    // Paranormal Mod on ap_customName) — same rule as the picker's
    // getOmodSlots includeSlot.
    if (COSMETIC_SLOT_RE.test(omod.attachPointEdid) && omod.modifiers.length === 0) continue;
    if (typeof chosenMods[omod.attachPointEdid] === 'string') continue;
    out.push(omod);
  }
  return out;
}

/**
 * May the picker offer this mod on this weapon? Semantics live in the shared
 * predicate (./omod-eligibility) — the extractor's attach-point closure uses
 * the exact same gate, so extracted slot lists can't drift from what the
 * picker offers. This wrapper just supplies the app-layer rescue table.
 */
export function isEligible(omod: GeneratedOmod, weapon: Weapon, mode: GameMode = 'live'): boolean {
  return isOmodEligibleForWeapon(omod, weapon, getDataset(mode).omodWeaponRestrictions);
}

/**
 * Picker badge for effects whose data can't move numbers yet:
 * - 'inert': no engine effect (extraction gap, limb/bash targeting not modeled)
 * - 'pendingMechanic': the underlying game mechanic is a deferred rework (Onslaught)
 *
 * 'needsEnemyDefenses' (value extracted, waiting on enemy DR/ER modeling)
 * REMOVED Phase 2 — Enemy defenses shipped (mitigation.ts); armorPen mods
 * show unbadged (or plain 'inert' if genuinely no-effect) like any other
 * conditional modifier now.
 */
export type OmodBadge = 'inert' | 'pendingMechanic';

export type OmodOption = GeneratedOmod & { badge?: OmodBadge };

// INERT_ENGINE_BUCKETS (buckets with no engine effect today — drives the
// 'inert' picker badge below) is derived from BUCKET_REGISTRY
// (@/types/modifiers), not hand-maintained here: the engine's own fold sites
// are the source of truth for what does and doesn't move a number, so this
// list can't silently go stale the way a second hand-kept copy would (as it
// did for specialEndurance/Charisma/Intelligence/Agility, each of which DOES
// have a real downstream effect — max HP, or a perk's curve input, or the
// VATS AP pool — despite once being badged 'inert' here).

const STOCK_NAME_RE = /^(standard|no |stock)/i;

/**
 * Picker display rule (user decision, 2026-07-14, superseding the earlier
 * "hide pure utility" policy): show ALL valid + obtainable mods, even those
 * with zero DPS delta — genre convention (Path of Building, WoWSims model the
 * full loadout), sight/grip choices are part of the build mental model, and
 * AP-cost / armor-pen wiring is coming (ap-regen.md, phase-3-enemies.md).
 * Zero-modifier non-stock mods show badged 'inert' instead of vanishing.
 */
export function classifyOmodDisplay(
  omod: GeneratedOmod,
  weapon?: Weapon,
  mode: GameMode = 'live',
): { show: boolean; badge?: OmodBadge } {
  const overrideBadge = getDataset(mode).omodBadgeOverrides[omod.id];
  const isStock =
    ((weapon?.templateModFormIds ?? []).includes(omod.formId) && omod.variantOf === undefined) ||
    STOCK_NAME_RE.test(omod.name);
  const hasModifiers = omod.modifiers.length > 0;
  if (!hasModifiers && !overrideBadge && !isStock) return { show: true, badge: 'inert' };
  if (overrideBadge) return { show: true, badge: overrideBadge };
  if (hasModifiers) {
    // enemyType/enemyTypeAny gates are NOT inert: they resolve against the
    // Target picker's selected race (resolve.ts enemyTypeIds), so Zealot's/
    // Assassin's/Prime receivers are ordinary conditional mods — unbadged,
    // like Instigating. (modifierHasEngineEffect covers exactly this —
    // shared with the perk and consumable 'no effect yet' badges,
    // @/types/modifiers.) The `needsEnemyDefenses` badge (armorPen /
    // enemyDamageResist waiting on enemy DR modeling) is DEAD as of Phase 2
    // — both left INERT_ENGINE_BUCKETS (mitigation.ts, the Berserker's
    // playerDamageResist rename) — so every remaining all-inert case is a
    // plain 'inert' badge now (Anti-Armor-style mods show unbadged instead).
    if (omod.modifiers.every((m) => !modifierHasEngineEffect(m))) {
      return { show: true, badge: 'inert' };
    }
    return { show: true };
  }
  // Stock part with no stats: normal (unbadged) unless extraction flagged gaps.
  return { show: true, badge: omod.notes?.length ? 'inert' : undefined };
}

export interface OmodSlot {
  /** Attach point edid (e.g. ap_gun_Receiver). */
  slot: string;
  /** Human label derived from the edid (Receiver, Barrel, ...). */
  label: string;
  options: OmodOption[];
}

/**
 * Slots exempt from the hygiene rules below (dedupe, hide-standard-only):
 * unique-identity slots legitimately hold same-named variants ("Relic
 * Reaper"'s seven records differ only in modifiers) and single-option
 * identity slots must stay visible (The Fixer's Unique slot IS its identity);
 * legendary slots are star pickers, not upgrade choices.
 */
const NON_HYGIENE_SLOT_RE = /legendary|customname|item_description|curse/i;

/**
 * Slots whose edid-derived label reads worse than a fixed name. Sourced from
 * the attach-point KYWD's FULL name where one exists (20260710 dump);
 * inventions are commented.
 */
const SLOT_LABEL_OVERRIDES: Record<string, string> = {
  ap_customName: 'Unique',
  // Cursed identity mods (Nuka-World on Tour) got their own dedicated attach
  // point in the 20260724 patch (previously squatted on ap_Item_Description
  // — see git history for the pre-patch label/override shape). The raw edid
  // transform would read "Curse"; every ap_curse record is a "Cursed X" mod.
  ap_curse: 'Cursed',
  // Remaining occupants are Mistress of Mystery unique-identity mods (Voice
  // of Set, Blade of Bastet) now that Cursed content moved to ap_curse — the
  // raw transform would read "Item Description".
  ap_Item_Description: 'Unique',
  // KYWD 0x0005524C FULL = "Upgrade" (48 melee weapons).
  ap_melee_MeleeMod: 'Upgrade',
  // KYWD 0x0005D4D7 FULL = "Magazine".
  ap_gun_Mag: 'Magazine',
  // KYWD 0x00729BD5 FULL is ALSO "Magazine", which would collide with
  // ap_gun_Mag on the Cremator — the only weapon using this attach point,
  // whose options here are all "... Tank" (Napalm/Slow-Burning). Invented.
  ap_gun_ChemicalType: 'Tank',
};

function slotLabel(mode: GameMode, weaponId: string, attachPointEdid: string): string {
  const perWeapon = getDataset(mode).perWeaponSlotLabelOverrides[weaponId]?.[attachPointEdid];
  if (perWeapon) return perWeapon;
  if (SLOT_LABEL_OVERRIDES[attachPointEdid]) return SLOT_LABEL_OVERRIDES[attachPointEdid];
  const raw = attachPointEdid
    .replace(/^ap_(gun_|melee_|Gun|Melee)?/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/**
 * Group a weapon's attachable OMODs into slots. `includeSlot` selects which
 * attach points participate (standard vs legendary); `sortSlots` orders the
 * resulting slot list.
 */
function buildSlots(
  mode: GameMode,
  weapon: Weapon,
  includeSlot: (attachPointEdid: string, omod: GeneratedOmod) => boolean,
  sortSlots: (a: OmodSlot, b: OmodSlot) => number,
): OmodSlot[] {
  const dataset = getDataset(mode);
  const groups = new Map<string, OmodOption[]>();
  for (const omod of dataset.omods) {
    // Authoring templates (_PARENT_ records, "TEMPLATE:"-named) carry the stats
    // real mods include via their Includes chain — not equippable themselves.
    // (The extractor stopped emitting them; this guards pre-derivation data.)
    if (omod.id.startsWith('_PARENT_') || omod.name.startsWith('TEMPLATE')) continue;
    if (DEAD_MECHANIC_SLOT_EDIDS.has(omod.attachPointEdid)) continue;
    // Obtainability verdicts + hand corrections (see live/weapons.ts). A
    // weapon's own standard parts are always visible: default mods are often
    // attached purely by template/keyword with no reverse reference — that
    // rescue is weapon-contextual (needs the weapon being modded), so it
    // stays here rather than folding into the shared visibility predicate.
    const isWeaponDefault = (weapon.defaultModFormIds ?? []).includes(omod.formId);
    if (
      !isRecordVisible(
        omod,
        { hidden: dataset.hiddenOmodIds, forceVisible: dataset.forceVisibleOmodIds },
        isWeaponDefault,
      )
    )
      continue;
    if (!includeSlot(omod.attachPointEdid, omod)) continue;
    if (!isEligible(omod, weapon, mode)) continue;
    const { show, badge } = classifyOmodDisplay(omod, weapon, mode);
    if (!show) continue;
    const option: OmodOption = badge ? { ...omod, badge } : omod;
    (
      groups.get(omod.attachPointEdid) ??
      groups.set(omod.attachPointEdid, []).get(omod.attachPointEdid)!
    ).push(option);
  }
  const defaultFormIds = new Set(weapon.defaultModFormIds ?? []);
  const templateFormIds = new Set(weapon.templateModFormIds ?? []);
  // Hygiene rule 1 (dedupe): several weapons carry two records with the same
  // display name AND identical modifier payloads (Hatchet's "No Upgrade"
  // pair) — pure picker noise. Same name with DIFFERENT payloads is a real
  // choice and always survives. Prefer the record the weapon's own template
  // whitelists; the key strips per-record Modifier fields (id, source).
  const dedupe = (options: OmodOption[]): OmodOption[] => {
    const byKey = new Map<string, OmodOption>();
    for (const option of options) {
      const key = `${option.name} ${JSON.stringify(option.modifiers.map((m) => Object.fromEntries(Object.entries(m).filter(([field]) => field !== 'id' && field !== 'source'))))}`;
      const prev = byKey.get(key);
      if (!prev || (templateFormIds.has(option.formId) && !templateFormIds.has(prev.formId)))
        byKey.set(key, option);
    }
    return [...byKey.values()];
  };
  return (
    [...groups.entries()]
      .map(([slot, options]) => ({
        slot,
        label: slotLabel(mode, weapon.id, slot),
        options: (NON_HYGIENE_SLOT_RE.test(slot) ? options : dedupe(options)).sort(
          (a, b) =>
            // The weapon's standard part first, then alphabetical.
            Number(defaultFormIds.has(b.formId)) - Number(defaultFormIds.has(a.formId)) ||
            a.name.localeCompare(b.name) ||
            a.id.localeCompare(b.id),
        ),
      }))
      // Hygiene rule 2 (hide no-decision slots): drop a slot whose every
      // option is the weapon's own default part, or whose SOLE option is a
      // stock-named zero-stat part that merely isn't listed as a default
      // (AGL's "Standard Magazine" _Base on ap_Bot_Mag). Multi-option slots
      // with a stock alternative stay — clearing the Bone Club's default
      // Wounding mod down to "No Upgrade" is a real stat decision. The
      // engine still folds default parts via getDefaultOmods. (User req,
      // dps-todos/omod-slot-hygiene.md.)
      .filter(
        ({ slot, options }) =>
          NON_HYGIENE_SLOT_RE.test(slot) ||
          (options.some((o) => !defaultFormIds.has(o.formId)) &&
            !(
              options.length === 1 &&
              STOCK_NAME_RE.test(options[0].name) &&
              options[0].modifiers.length === 0
            )),
      )
      .sort(sortSlots)
  );
}

/** Standard mod slots (receiver/barrel/…) available for a weapon, options sorted by name. */
export function getOmodSlots(mode: GameMode, weapon: Weapon): OmodSlot[] {
  return buildSlots(
    mode,
    weapon,
    // Cosmetic slots (paint/customName/...) are skipped UNLESS the mod carries
    // a real stat payload AND belongs to this weapon: unique-weapon effects
    // ride cosmetic attach points (Perfect Storm, Cold Shoulder's cryptid
    // bonus, Cursed melee mods, The V.A.T.S. Unknown, ...). templateModFormIds
    // lists a weapon's possible instance templates, so it gates which uniques'
    // mods belong; badge-override rescues pass explicitly for the rare
    // template-less case, weapon-gated by omodWeaponRestrictions instead (no
    // live entries as of 2026-07-16, but the mechanism stays for the next one).
    (edid, omod) =>
      (!COSMETIC_SLOT_RE.test(edid) ||
        (omod.modifiers.length > 0 && (weapon.templateModFormIds ?? []).includes(omod.formId)) ||
        // Identity uniques surfaced even with no stats — 2026-07-13 unique
        // rework, see docs/assumptions.md "Unique weapons".
        (edid === 'ap_customName' &&
          (omod.addedKeywords.includes('ObjectTypeUnique') || omod.variantOf !== undefined) &&
          (weapon.templateModFormIds ?? []).includes(omod.formId)) ||
        getDataset(mode).omodBadgeOverrides[omod.id] !== undefined) &&
      !LEGENDARY_SLOT_RE.test(edid),
    (a, b) => a.label.localeCompare(b.label),
  );
}

/** Legendary-effect OMODs attachable to a weapon, grouped by star slot (phase 7 picker). */
export function getLegendaryOmodSlots(mode: GameMode, weapon: Weapon): OmodSlot[] {
  return buildSlots(
    mode,
    weapon,
    (edid) => LEGENDARY_SLOT_RE.test(edid),
    (a, b) => a.slot.localeCompare(b.slot),
  );
}

/**
 * Display name after unique mods: an equipped `ap_customName` mod carrying
 * `ObjectTypeUnique` renames the weapon (e.g. "All Rise" instead of "Super
 * Sledge") — explicit choice, or the weapon's own default fold-in (The
 * Fixer's mod is a default part, never an explicit pick). Cursed identity
 * mods do the same from `ap_curse` via `dn_HasCustomMod_Cursed`
 * (their names are the full in-game rename, "Cursed Broadsider"). Falls back
 * to the weapon's own name otherwise. Display-only; no engine/state change.
 */
const RENAMING_SLOTS: ReadonlyArray<[slot: string, keyword: string]> = [
  ['ap_customName', 'ObjectTypeUnique'],
  ['ap_curse', 'dn_HasCustomMod_Cursed'],
];

// Cursed mods (ap_curse, Nuka-World on Tour) carry real stat payloads on a
// cosmetic naming slot but do NOT carry ObjectTypeUnique. They're surfaced by
// the generic "has modifiers + template-member" cosmetic-slot gate (line 329:
// omod.modifiers.length > 0 && templateModFormIds.includes(...)), not by the
// ObjectTypeUnique identity-unique path. They're labeled "Cursed" via the
// RENAMING_SLOTS/SLOT_LABEL_OVERRIDES machinery above, not via ObjectTypeUnique.

export function effectiveWeaponName(
  mode: GameMode,
  weapon: Weapon,
  mods: Record<string, string | null | undefined>,
): string {
  for (const [slot, keyword] of RENAMING_SLOTS) {
    const chosen = mods[slot];
    const omodId = typeof chosen === 'string' ? chosen : getDefaultOmodId(mode, weapon, slot);
    const omod = omodId ? getOmodById(mode, omodId) : undefined;
    if (
      omod?.addedKeywords.includes(keyword) ||
      (keyword === 'ObjectTypeUnique' && omod?.variantOf !== undefined)
    )
      return omod.name;
  }
  return weapon.name;
}
