import type { GameMode, Weapon } from '@/types';
import type { GeneratedOmod } from '@/types/generated';
import { forceVisibleOmodIds, hiddenOmodIds, omodBadgeOverrides, omodWeaponRestrictions } from './overrides/corrections';
import { getDataset } from './dataset';

// Reads the merged omod list from the dataset chokepoint (legendary-value
// overrides already applied), so every access path — by-id lookup and slot
// pickers alike — sees the same patched modifiers.

/** Cosmetic/naming slots — never shown in the mod picker. */
const COSMETIC_SLOT_RE = /appearance|paint|skin|customname|item_description|material/i;
/** Legendary-effect slots — handled by the legendary picker, not the mod slots. */
const LEGENDARY_SLOT_RE = /legendary/i;

const byIdCache = new Map<GameMode, Map<string, GeneratedOmod>>();

export function getOmodById(mode: GameMode, id: string): GeneratedOmod | undefined {
  let map = byIdCache.get(mode);
  if (!map) {
    map = new Map(getDataset(mode).omods.map(o => [o.id, o]));
    byIdCache.set(mode, map);
  }
  return map.get(id);
}

function isAttachable(omod: GeneratedOmod, weapon: Weapon): boolean {
  const slots = weapon.attachParentSlots ?? [];
  if (!slots.includes(omod.attachPointFormId)) return false;
  const keywords = weapon.keywords ?? [];
  return omod.targetKeywords.every(k => keywords.includes(k));
}

/**
 * Picker badge for effects whose data can't move numbers yet:
 * - 'inert': no engine effect (extraction gap, limb/bash targeting not modeled, or unwired SPECIAL)
 * - 'pendingMechanic': the underlying game mechanic is a deferred rework (Onslaught)
 * - 'needsEnemyDefenses': value extracted, waiting on enemy DR/ER modeling
 */
export type OmodBadge = 'inert' | 'pendingMechanic' | 'needsEnemyDefenses';

export type OmodOption = GeneratedOmod & { badge?: OmodBadge };

/**
 * Buckets the engine stores but does not fold into damage yet.
 * specialStrength/specialLuck ARE wired (loadout); explosivePayload/
 * explosionMult (Stage A1), dotDamage (Stage A2), and vatsApCost/apRegen/
 * apPerCrit (Stage B, AP economy) are ALSO wired now — removed from this
 * set, kept out of the badge path.
 */
const INERT_ENGINE_BUCKETS = new Set([
  'armorPen', 'limbDamage', 'bashDamage',
  'specialPerception', 'specialEndurance', 'specialCharisma', 'specialIntelligence', 'specialAgility',
]);

const STOCK_NAME_RE = /^(standard|no |stock)/i;

/**
 * Picker display rule (user decision, 2026-07 overhaul): show mods that are
 * damage-relevant OR SPECIAL-modifying OR the weapon's stock/default parts;
 * hide pure utility (durability, weight — they extract with no modifiers).
 * Inert-but-shown entries get a badge instead of silently doing nothing.
 */
export function classifyOmodDisplay(omod: GeneratedOmod, weapon?: Weapon): { show: boolean; badge?: OmodBadge } {
  const overrideBadge = omodBadgeOverrides[omod.id];
  const isStock = (weapon?.templateModFormIds ?? []).includes(omod.formId) || STOCK_NAME_RE.test(omod.name);
  const hasModifiers = omod.modifiers.length > 0;
  if (!hasModifiers && !overrideBadge && !isStock) return { show: false };
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

function slotLabel(attachPointEdid: string): string {
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
    // Obtainability verdicts + hand corrections (see live/weapons.ts).
    if (omod.obtainable === false && !forceVisibleOmodIds.has(omod.id)) continue;
    if (hiddenOmodIds.has(omod.id)) continue;
    // Weapon-restricted mods (empty targetKeywords on shared slots) only
    // appear on their own weapon.
    if (omodWeaponRestrictions[omod.id] && !omodWeaponRestrictions[omod.id].includes(weapon.id)) continue;
    if (!includeSlot(omod.attachPointEdid, omod)) continue;
    if (!isAttachable(omod, weapon)) continue;
    const { show, badge } = classifyOmodDisplay(omod, weapon);
    if (!show) continue;
    const option: OmodOption = badge ? { ...omod, badge } : omod;
    (groups.get(omod.attachPointEdid) ?? groups.set(omod.attachPointEdid, []).get(omod.attachPointEdid)!).push(option);
  }
  return [...groups.entries()]
    .map(([slot, options]) => ({
      slot,
      label: slotLabel(slot),
      options: options.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
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
