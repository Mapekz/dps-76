import type { GameMode, Weapon } from '@/types';
import type { GeneratedOmod } from '@/types/generated';
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

export interface OmodSlot {
  /** Attach point edid (e.g. ap_gun_Receiver). */
  slot: string;
  /** Human label derived from the edid (Receiver, Barrel, ...). */
  label: string;
  options: GeneratedOmod[];
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
  includeSlot: (attachPointEdid: string) => boolean,
  sortSlots: (a: OmodSlot, b: OmodSlot) => number
): OmodSlot[] {
  const groups = new Map<string, GeneratedOmod[]>();
  for (const omod of getDataset(mode).omods) {
    // Authoring templates (_PARENT_ records, "TEMPLATE:"-named) carry the stats
    // real mods include via their Includes chain — not equippable themselves.
    if (omod.id.startsWith('_PARENT_') || omod.name.startsWith('TEMPLATE')) continue;
    if (!includeSlot(omod.attachPointEdid)) continue;
    if (!isAttachable(omod, weapon)) continue;
    (groups.get(omod.attachPointEdid) ?? groups.set(omod.attachPointEdid, []).get(omod.attachPointEdid)!).push(omod);
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
    edid => !COSMETIC_SLOT_RE.test(edid) && !LEGENDARY_SLOT_RE.test(edid),
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
