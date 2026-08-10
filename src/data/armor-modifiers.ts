/**
 * Armor pipeline barrel — re-exports the split modules without coupling them:
 * - `armor-types` — shared types
 * - `armor-capacities` — static per-slot capacity tables and reach→maxCount
 * - `armor-derivation` — ESM record parsing into `ArmorEffectEntry` fields
 * - `armor-roster` — curated, overlay-filtered checklist inventory
 * - `armor-budget` — tier budget + slot-exclusivity feasibility
 */

export type {
  ArmorEffectEntry,
  ArmorPieceClass,
  ArmorSlotGroup,
  ArmorSlotUsage,
  ArmorSlotUsageEntry,
  ArmorStarTier,
  ArmorType,
  FeasibilityFamilyKey,
} from './armor-types';

export { MAX_LEGENDARY_COUNT } from './armor-capacities';

export {
  armorTypeOfRecord,
  buildEntry,
  derivePieceReach,
  derivePieceReachFromTokens,
  findWornPieceKeyword,
  isJetpackReskin,
  legendaryArmorType,
  LEGENDARY_ATTACH_POINT_RE,
  nonLegendaryGroup,
  tokensFromTexts,
} from './armor-derivation';

export {
  getArmorEffectById,
  getArmorEffectModifiers,
  getArmorEffects,
  getArmorEffectWornPieceCounts,
} from './armor-roster';

export {
  clampArmorPieceCapacities,
  clampArmorTierBudgets,
  getArmorSlotUsage,
  getArmorTierUsage,
  maxFeasibleArmorEffectCount,
  wrongArmorTypeEffects,
} from './armor-budget';
