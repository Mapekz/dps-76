import type { Modifier } from '@/types/modifiers';

/** Legendary star tier (1★–4★), parsed off the representative record's `ap_LegendaryN` attach point. */
export type ArmorStarTier = 1 | 2 | 3 | 4;

/** In-game armor workbench slot group — Material, Lining, Misc, or Legendary (split by star tier in the UI). */
export type ArmorSlotGroup = 'material' | 'lining' | 'misc' | 'legendary';

/** Body-piece classes for non-legendary slot-exclusivity and maxCount derivation. */
export type ArmorPieceClass =
  | 'torso'
  | 'arm'
  | 'leg'
  | 'helmet'
  | 'underarmorStyle'
  | 'underarmorLining';

/** Which armor chassis an effect can mount on. Legendary derives from record presence per display name. */
export type ArmorType = 'bodyArmor' | 'powerArmor' | 'both';

export interface ArmorEffectEntry {
  /** Stable id — the representative OMOD's edid (armor variant wins over power-armor when both exist, alphabetically). */
  id: string;
  name: string;
  /** ESM description when non-empty, else a data-derived summary (describeBuffModifiers) of the PER-PIECE base modifiers. */
  description: string | null;
  group: ArmorSlotGroup;
  /** Representative record's `attachPointEdid` — for tests/UI inspection of which slot an entry came from. */
  attachPointEdid: string;
  /** Present when the representative record has no engine-effective modifiers — shown in the picker, not hidden. */
  badge?: 'inert';
  /** 1 = single checkbox; >1 = a 0..maxCount stepper (worn-piece count). */
  maxCount: number;
  /** True when `modifiers` already carry their own wornPieceCount tiers (Battle-Loader's, Limit-Breaking) — see module header. */
  selfScaling: boolean;
  /** Present iff selfScaling — the keyword `PlayerConditions.wornPieceCounts` is keyed by for this effect. */
  wornPieceKeyword?: string;
  /** PER-PIECE (count=1) base modifiers, as extracted (+ armor-values.ts overrides). */
  modifiers: Modifier[];
  /** Present iff `group === 'legendary'` — derived from the representative record's `attachPointEdid` (ap_LegendaryN). */
  starTier?: ArmorStarTier;
  /** Body armor, power armor, or both (underarmor). */
  armorType: ArmorType;
  /** Non-legendary piece reach — undefined for legendary (star-tier budget only). */
  pieceReach?: ReadonlySet<ArmorPieceClass>;
}

/** Cross-effect slot-exclusivity pools (material vs misc never share a family). */
export type FeasibilityFamilyKey =
  | 'bodyArmor:material'
  | 'bodyArmor:misc'
  | 'powerArmor:misc'
  | 'underarmorStyle'
  | 'underarmorLining';

export type ArmorSlotUsageEntry = { used: number; capacity: number };
export type ArmorSlotUsage = Partial<
  Record<FeasibilityFamilyKey, Partial<Record<ArmorPieceClass, ArmorSlotUsageEntry>>>
>;
