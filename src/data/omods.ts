import type { GameMode, Weapon } from '@/types';
import type { GeneratedOmod } from '@/types/generated';
import { legendaryValueOverrides } from './overrides/legendary-values';
import generatedOmodsLive from './live/generated/omods.json';

// PTS generated data doesn't exist yet — single ESM for now (see plan).
const omodsByMode: Record<GameMode, GeneratedOmod[]> = {
  live: generatedOmodsLive as GeneratedOmod[],
  pts: generatedOmodsLive as GeneratedOmod[],
};

/** Cosmetic/naming slots — never shown in the mod picker. */
const COSMETIC_SLOT_RE = /appearance|paint|skin|customname|item_description|material/i;
/** Legendary-effect slots — handled by the legendary picker, not the mod slots. */
const LEGENDARY_SLOT_RE = /legendary/i;

const byIdCache = new Map<GameMode, Map<string, GeneratedOmod>>();

export function getOmodById(mode: GameMode, id: string): GeneratedOmod | undefined {
  let map = byIdCache.get(mode);
  if (!map) {
    map = new Map(
      omodsByMode[mode].map(o => {
        // Script-computed legendary magnitudes come from the overrides layer.
        const override = legendaryValueOverrides[o.id];
        return [o.id, override ? { ...o, modifiers: override } : o];
      })
    );
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

/** Standard mod slots (receiver/barrel/…) available for a weapon, options sorted by name. */
export function getOmodSlots(mode: GameMode, weapon: Weapon): OmodSlot[] {
  const groups = new Map<string, GeneratedOmod[]>();
  for (const omod of omodsByMode[mode]) {
    if (COSMETIC_SLOT_RE.test(omod.attachPointEdid) || LEGENDARY_SLOT_RE.test(omod.attachPointEdid)) continue;
    if (!isAttachable(omod, weapon)) continue;
    (groups.get(omod.attachPointEdid) ?? groups.set(omod.attachPointEdid, []).get(omod.attachPointEdid)!).push(omod);
  }
  return [...groups.entries()]
    .map(([slot, options]) => ({
      slot,
      label: slotLabel(slot),
      options: options.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Legendary-effect OMODs attachable to a weapon, grouped by star slot (phase 7 picker). */
export function getLegendaryOmodSlots(mode: GameMode, weapon: Weapon): OmodSlot[] {
  const groups = new Map<string, GeneratedOmod[]>();
  for (const omod of omodsByMode[mode]) {
    if (!LEGENDARY_SLOT_RE.test(omod.attachPointEdid)) continue;
    if (!isAttachable(omod, weapon)) continue;
    (groups.get(omod.attachPointEdid) ?? groups.set(omod.attachPointEdid, []).get(omod.attachPointEdid)!).push(omod);
  }
  return [...groups.entries()]
    .map(([slot, options]) => ({
      slot,
      label: slotLabel(slot),
      options: options.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    }))
    .sort((a, b) => a.slot.localeCompare(b.slot));
}
