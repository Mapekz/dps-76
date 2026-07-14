import type { GameMode, Weapon } from '@/types';
import type { GeneratedOmod } from '@/types/generated';
import { INERT_ENGINE_BUCKETS } from '@/types/modifiers';
import { forceVisibleOmodIds, hiddenOmodIds, omodBadgeOverrides, omodWeaponRestrictions } from './overrides/corrections';
import { getDataset } from './dataset';
import { isRecordVisible } from './overlay';

// Reads the merged omod list from the dataset chokepoint (legendary-value
// overrides already applied), so every access path — by-id lookup and slot
// pickers alike — sees the same patched modifiers.

/** Cosmetic/naming slots — never shown in the mod picker. */
const COSMETIC_SLOT_RE = /appearance|paint|skin|customname|item_description|material/i;
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
    map = new Map(getDataset(mode).omods.map(o => [o.id, o]));
    byIdCache.set(mode, map);
  }
  return map.get(id);
}

const byFormIdCache = new Map<GameMode, Map<string, GeneratedOmod>>();

function omodsByFormId(mode: GameMode): Map<string, GeneratedOmod> {
  let map = byFormIdCache.get(mode);
  if (!map) {
    map = new Map(getDataset(mode).omods.map(o => [o.formId, o]));
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
  chosenMods: Record<string, string | null | undefined>
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
 * May the picker offer this mod on this weapon?
 *
 * Branch 0 — the attach point must exist on the weapon (ESM-authoritative).
 * Branch 1 — keyword-scoped mods (the overwhelming majority): eligible iff
 *   targetKeywords ⊆ weapon.keywords, the game's own family gate.
 * Branch 2 — EMPTY targetKeywords match nothing by themselves (they used to
 *   match everything sharing the attach point — the source of "Vox Syringe
 *   Barrel on a gauss minigun"-class pollution, dps-todos/omod-eligibility).
 *   Such a mod is eligible only when this weapon's own ESM instance template
 *   whitelists it (Object Template Includes → templateModFormIds), or an
 *   explicit omodWeaponRestrictions rescue names the weapon (reward-granted
 *   identity mods with no ESM-derivable weapon tie at all).
 *
 * A crafting recipe existing (hasGrantingCobj) is deliberately NOT an input:
 * COBJs carry no CTDA/BNAM naming a weapon (verified live 2026-07-14), so a
 * recipe can never say WHICH weapon a keyword-less mod belongs to.
 */
export function isEligible(omod: GeneratedOmod, weapon: Weapon): boolean {
  const slots = weapon.attachParentSlots ?? [];
  if (!slots.includes(omod.attachPointFormId)) return false;
  if (omod.targetKeywords.length > 0) {
    const keywords = weapon.keywords ?? [];
    return omod.targetKeywords.every(k => keywords.includes(k));
  }
  return (
    (weapon.templateModFormIds ?? []).includes(omod.formId) ||
    (omodWeaponRestrictions[omod.id]?.includes(weapon.id) ?? false)
  );
}

/**
 * Picker badge for effects whose data can't move numbers yet:
 * - 'inert': no engine effect (extraction gap, limb/bash targeting not modeled)
 * - 'pendingMechanic': the underlying game mechanic is a deferred rework (Onslaught)
 * - 'needsEnemyDefenses': value extracted, waiting on enemy DR/ER modeling
 */
export type OmodBadge = 'inert' | 'pendingMechanic' | 'needsEnemyDefenses';

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
export function classifyOmodDisplay(omod: GeneratedOmod, weapon?: Weapon): { show: boolean; badge?: OmodBadge } {
  const overrideBadge = omodBadgeOverrides[omod.id];
  const isStock = (weapon?.templateModFormIds ?? []).includes(omod.formId) || STOCK_NAME_RE.test(omod.name);
  const hasModifiers = omod.modifiers.length > 0;
  if (!hasModifiers && !overrideBadge && !isStock) return { show: true, badge: 'inert' };
  if (overrideBadge) return { show: true, badge: overrideBadge };
  if (hasModifiers) {
    const isInert = (m: GeneratedOmod['modifiers'][number]) =>
      INERT_ENGINE_BUCKETS.has(m.bucket) ||
      m.curve?.input === 'enemyDamageResist' ||
      m.conditions.some(c => c.kind === 'enemyType' || c.kind === 'enemyTypeAny' || c.kind === 'unresolved');
    if (omod.modifiers.every(isInert)) {
      const enemyFacing = omod.modifiers.every(
        m =>
          m.bucket === 'armorPen' ||
          m.curve?.input === 'enemyDamageResist' ||
          m.conditions.some(c => c.kind === 'enemyType' || c.kind === 'enemyTypeAny')
      );
      return { show: true, badge: enemyFacing ? 'needsEnemyDefenses' : 'inert' };
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

/** Slots whose edid-derived label reads worse than a fixed name. */
const SLOT_LABEL_OVERRIDES: Record<string, string> = { ap_customName: 'Unique' };

function slotLabel(attachPointEdid: string): string {
  if (SLOT_LABEL_OVERRIDES[attachPointEdid]) return SLOT_LABEL_OVERRIDES[attachPointEdid];
  const raw = attachPointEdid.replace(/^ap_(gun_|melee_|Gun|Melee)?/i, '').replace(/[_-]+/g, ' ').trim();
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
  sortSlots: (a: OmodSlot, b: OmodSlot) => number
): OmodSlot[] {
  const groups = new Map<string, OmodOption[]>();
  for (const omod of getDataset(mode).omods) {
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
    if (!isRecordVisible(omod, { hidden: hiddenOmodIds, forceVisible: forceVisibleOmodIds }, isWeaponDefault)) continue;
    if (!includeSlot(omod.attachPointEdid, omod)) continue;
    if (!isEligible(omod, weapon)) continue;
    const { show, badge } = classifyOmodDisplay(omod, weapon);
    if (!show) continue;
    const option: OmodOption = badge ? { ...omod, badge } : omod;
    (groups.get(omod.attachPointEdid) ?? groups.set(omod.attachPointEdid, []).get(omod.attachPointEdid)!).push(option);
  }
  const defaultFormIds = new Set(weapon.defaultModFormIds ?? []);
  return [...groups.entries()]
    .map(([slot, options]) => ({
      slot,
      label: slotLabel(slot),
      options: options.sort(
        (a, b) =>
          // The weapon's standard part first, then alphabetical.
          Number(defaultFormIds.has(b.formId)) - Number(defaultFormIds.has(a.formId)) ||
          a.name.localeCompare(b.name) ||
          a.id.localeCompare(b.id)
      ),
    }))
    .sort(sortSlots);
}

/** Standard mod slots (receiver/barrel/…) available for a weapon, options sorted by name. */
export function getOmodSlots(mode: GameMode, weapon: Weapon): OmodSlot[] {
  return buildSlots(
    mode,
    weapon,
    // Cosmetic slots (paint/customName/...) are skipped UNLESS the mod carries
    // a real stat payload AND belongs to this weapon: unique-weapon effects
    // ride cosmetic attach points (Perfect Storm, Cold Shoulder's cryptid
    // bonus, Cursed melee mods, ...). templateModFormIds lists a weapon's
    // possible instance templates, so it gates which uniques' mods belong;
    // badge-override rescues (V.A.T.S. Unknown variants) pass explicitly and
    // are weapon-gated by omodWeaponRestrictions instead.
    (edid, omod) =>
      (!COSMETIC_SLOT_RE.test(edid) ||
        (omod.modifiers.length > 0 && (weapon.templateModFormIds ?? []).includes(omod.formId)) ||
        // Identity uniques surfaced even with no stats — 2026-07-13 unique
        // rework, see docs/assumptions.md "Unique weapons".
        (edid === 'ap_customName' &&
          omod.addedKeywords.includes('ObjectTypeUnique') &&
          (weapon.templateModFormIds ?? []).includes(omod.formId)) ||
        omodBadgeOverrides[omod.id] !== undefined) &&
      !LEGENDARY_SLOT_RE.test(edid),
    (a, b) => a.label.localeCompare(b.label)
  );
}

/** Legendary-effect OMODs attachable to a weapon, grouped by star slot (phase 7 picker). */
export function getLegendaryOmodSlots(mode: GameMode, weapon: Weapon): OmodSlot[] {
  return buildSlots(
    mode,
    weapon,
    edid => LEGENDARY_SLOT_RE.test(edid),
    (a, b) => a.slot.localeCompare(b.slot)
  );
}

/**
 * Display name after unique mods: an equipped `ap_customName` mod carrying
 * `ObjectTypeUnique` renames the weapon (e.g. "All Rise" instead of "Super
 * Sledge") — explicit choice, or the weapon's own default fold-in (The
 * Fixer's mod is a default part, never an explicit pick). Falls back to the
 * weapon's own name otherwise. Display-only; no engine/state change.
 */
export function effectiveWeaponName(
  mode: GameMode,
  weapon: Weapon,
  mods: Record<string, string | null | undefined>
): string {
  const chosen = mods['ap_customName'];
  const omodId = typeof chosen === 'string' ? chosen : getDefaultOmodId(mode, weapon, 'ap_customName');
  const omod = omodId ? getOmodById(mode, omodId) : undefined;
  return omod?.addedKeywords.includes('ObjectTypeUnique') ? omod.name : weapon.name;
}
