import type { ArmorWorn, GameMode } from '@/types';
import type {
  ArmorEffectEntry,
  ArmorPieceClass,
  ArmorSlotUsage,
  ArmorSlotUsageEntry,
  ArmorStarTier,
  FeasibilityFamilyKey,
} from './armor-types';
import { activeClasses, FAMILY_CAPACITIES, MAX_LEGENDARY_COUNT } from './armor-capacities';
import { getArmorEffectById, getArmorEffects, selectedCount } from './armor-roster';

function feasibilityFamilyOf(effect: ArmorEffectEntry): FeasibilityFamilyKey | null {
  if (effect.group === 'legendary') return null;
  if (effect.pieceReach?.has('underarmorStyle')) return 'underarmorStyle';
  if (effect.pieceReach?.has('underarmorLining')) return 'underarmorLining';
  if (effect.group === 'material') return 'bodyArmor:material';
  if (effect.group === 'misc' && effect.armorType === 'powerArmor') return 'powerArmor:misc';
  if (effect.group === 'misc') return 'bodyArmor:misc';
  return null;
}

function allNonEmptySubsets<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  const n = items.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const subset: T[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) subset.push(items[i]);
    }
    out.push(subset);
  }
  return out;
}

function isReachSubsetOf(
  reach: ReadonlySet<ArmorPieceClass>,
  subset: ReadonlySet<ArmorPieceClass>,
): boolean {
  for (const c of reach) {
    if (!subset.has(c)) return false;
  }
  return true;
}

function capacityOfSubset(
  subset: ReadonlySet<ArmorPieceClass>,
  capacities: Readonly<Record<ArmorPieceClass, number>>,
): number {
  let sum = 0;
  for (const c of subset) sum += capacities[c];
  return sum;
}

function usedInSubset(
  items: ReadonlyArray<{ reach: ReadonlySet<ArmorPieceClass>; count: number }>,
  subset: ReadonlySet<ArmorPieceClass>,
): number {
  let sum = 0;
  for (const item of items) {
    if (isReachSubsetOf(item.reach, subset)) sum += item.count;
  }
  return sum;
}

function supersetsOfReach(
  reach: ReadonlySet<ArmorPieceClass>,
  universe: readonly ArmorPieceClass[],
): ReadonlySet<ArmorPieceClass>[] {
  return allNonEmptySubsets(universe)
    .filter((subset) => isReachSubsetOf(reach, new Set(subset)))
    .map((subset) => new Set(subset));
}

function maxFeasibleForReach(
  reach: ReadonlySet<ArmorPieceClass>,
  capacities: Readonly<Record<ArmorPieceClass, number>>,
  others: ReadonlyArray<{ reach: ReadonlySet<ArmorPieceClass>; count: number }>,
  absoluteMax: number,
): number {
  const universe = activeClasses(capacities);
  let max = absoluteMax;
  for (const superset of supersetsOfReach(reach, universe)) {
    const room = capacityOfSubset(superset, capacities) - usedInSubset(others, superset);
    max = Math.min(max, room);
  }
  return Math.max(0, max);
}

/**
 * Sums selected worn-piece counts per legendary star tier (1★–4★) across all
 * legendary effects sharing that tier — the "how full is each tier's
 * budget" readout the per-star-tier cap (reducer clamp, tier UI) is built
 * on. Misc effects, and ids in `selections` that don't match any effect,
 * don't participate.
 */
export function getArmorTierUsage(
  mode: GameMode,
  selections: Readonly<Record<string, number>>,
): Record<ArmorStarTier, number> {
  const usage: Record<ArmorStarTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const effect of getArmorEffects(mode)) {
    if (effect.starTier === undefined) continue;
    usage[effect.starTier] += selectedCount(effect, selections);
  }
  return usage;
}

function familyItemsForClamp(
  mode: GameMode,
  family: FeasibilityFamilyKey,
  armorEffects: Readonly<Record<string, number>>,
): Array<{ id: string; reach: ReadonlySet<ArmorPieceClass>; count: number }> {
  const items: Array<{ id: string; reach: ReadonlySet<ArmorPieceClass>; count: number }> = [];
  for (const effect of getArmorEffects(mode)) {
    if (feasibilityFamilyOf(effect) !== family) continue;
    const count = armorEffects[effect.id] ?? 0;
    if (count <= 0 || !effect.pieceReach) continue;
    items.push({ id: effect.id, reach: effect.pieceReach, count });
  }
  return items;
}

function clampOneFamily(
  mode: GameMode,
  family: FeasibilityFamilyKey,
  armorEffects: Readonly<Record<string, number>>,
  out: Record<string, number>,
  insertionOrder: readonly string[],
): boolean {
  const capacities = FAMILY_CAPACITIES[family];
  const entries = familyItemsForClamp(mode, family, armorEffects);
  entries.sort((a, b) => insertionOrder.indexOf(a.id) - insertionOrder.indexOf(b.id));

  const accepted: Array<{ reach: ReadonlySet<ArmorPieceClass>; count: number }> = [];
  let changed = false;

  for (const { id, reach, count: requested } of entries) {
    const maxFeasible = maxFeasibleForReach(reach, capacities, accepted, requested);
    const trimmed = Math.max(0, Math.min(requested, maxFeasible));
    if (trimmed !== requested) changed = true;
    if (trimmed > 0) {
      out[id] = trimmed;
      accepted.push({ reach, count: trimmed });
    } else {
      delete out[id];
      if (requested > 0) changed = true;
    }
  }

  return changed;
}

/**
 * Trims worn-piece-count selections so no legendary star tier's combined
 * total (across every effect sharing that tier) exceeds `MAX_LEGENDARY_COUNT`
 * — a cross-effect budget layered on top of each effect's own per-piece
 * `maxCount` clamp. Walks `Object.entries(armorEffects)` in insertion order
 * (first-set-wins), NOT the `getArmorEffects()` roster order, so which
 * effect(s) absorb the trim depends on selection order — matching how a
 * user experiences incrementally hitting the budget rather than an
 * arbitrary alphabetical tiebreak. Misc effects and unknown ids pass
 * through untouched; entries trimmed to 0 are omitted from the result
 * rather than kept as explicit zeroes.
 */
export function clampArmorTierBudgets(
  mode: GameMode,
  armorEffects: Readonly<Record<string, number>>,
): { armorEffects: Record<string, number>; changed: boolean } {
  const tierTotals: Record<ArmorStarTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const out: Record<string, number> = {};
  let changed = false;

  for (const [id, rawCount] of Object.entries(armorEffects)) {
    const effect = getArmorEffectById(mode, id);
    if (!effect || effect.starTier === undefined) {
      out[id] = rawCount;
      continue;
    }
    const clampedToMax = Math.max(0, Math.min(effect.maxCount, rawCount));
    const remaining = MAX_LEGENDARY_COUNT - tierTotals[effect.starTier];
    const trimmed = Math.max(0, Math.min(clampedToMax, remaining));
    tierTotals[effect.starTier] += trimmed;
    if (trimmed !== rawCount) changed = true;
    if (trimmed > 0) out[id] = trimmed;
  }

  return { armorEffects: out, changed };
}

/**
 * Trims non-legendary selections so every slot-exclusivity family stays
 * feasible (Hall's subset test). Walks `Object.entries(armorEffects)` in
 * insertion order within each family — first-set-wins, matching tier-budget
 * semantics.
 */
export function clampArmorPieceCapacities(
  mode: GameMode,
  armorEffects: Readonly<Record<string, number>>,
): { armorEffects: Record<string, number>; changed: boolean } {
  const out: Record<string, number> = { ...armorEffects };
  const insertionOrder = Object.keys(armorEffects);
  let changed = false;

  const families: FeasibilityFamilyKey[] = [
    'bodyArmor:material',
    'bodyArmor:misc',
    'powerArmor:misc',
    'underarmorStyle',
    'underarmorLining',
  ];

  for (const family of families) {
    const familyOut: Record<string, number> = {};
    for (const effect of getArmorEffects(mode)) {
      if (feasibilityFamilyOf(effect) === family && out[effect.id] !== undefined) {
        familyOut[effect.id] = out[effect.id];
      }
    }
    if (clampOneFamily(mode, family, armorEffects, familyOut, insertionOrder)) {
      changed = true;
      for (const effect of getArmorEffects(mode)) {
        if (feasibilityFamilyOf(effect) === family) {
          if (familyOut[effect.id] !== undefined) out[effect.id] = familyOut[effect.id];
          else delete out[effect.id];
        }
      }
    }
  }

  return { armorEffects: out, changed };
}

/**
 * Maximum worn-piece count `effectId` can hold given the other selections in
 * the same feasibility family. Legendary effects defer to star-tier budget
 * only (callers layer `getArmorTierUsage` on top).
 */
export function maxFeasibleArmorEffectCount(
  mode: GameMode,
  effectId: string,
  armorEffects: Readonly<Record<string, number>>,
): number {
  const effect = getArmorEffectById(mode, effectId);
  if (!effect) return 0;
  if (effect.group === 'legendary') return effect.maxCount;

  const family = feasibilityFamilyOf(effect);
  if (!family || !effect.pieceReach) return effect.maxCount;

  const capacities = FAMILY_CAPACITIES[family];
  const others: Array<{ reach: ReadonlySet<ArmorPieceClass>; count: number }> = [];
  for (const e of getArmorEffects(mode)) {
    if (e.id === effectId || feasibilityFamilyOf(e) !== family || !e.pieceReach) continue;
    const count = armorEffects[e.id] ?? 0;
    if (count > 0) others.push({ reach: e.pieceReach, count });
  }

  return maxFeasibleForReach(effect.pieceReach, capacities, others, effect.maxCount);
}

function greedyClassUsage(
  capacities: Readonly<Record<ArmorPieceClass, number>>,
  items: ReadonlyArray<{ reach: ReadonlySet<ArmorPieceClass>; count: number; id: string }>,
): Partial<Record<ArmorPieceClass, number>> {
  const used: Partial<Record<ArmorPieceClass, number>> = {};
  for (const cls of activeClasses(capacities)) used[cls] = 0;

  const sorted = [...items].sort((a, b) => {
    const diff = a.reach.size - b.reach.size;
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });

  for (const item of sorted) {
    for (let i = 0; i < item.count; i++) {
      for (const cls of item.reach) {
        if ((used[cls] ?? 0) < capacities[cls]) {
          used[cls] = (used[cls] ?? 0) + 1;
          break;
        }
      }
    }
  }

  return used;
}

/** Per feasibility-family, per-class slot usage for group headers. */
export function getArmorSlotUsage(
  mode: GameMode,
  armorEffects: Readonly<Record<string, number>>,
): ArmorSlotUsage {
  const usage: ArmorSlotUsage = {};
  const families: FeasibilityFamilyKey[] = [
    'bodyArmor:material',
    'bodyArmor:misc',
    'powerArmor:misc',
    'underarmorStyle',
    'underarmorLining',
  ];

  for (const family of families) {
    const capacities = FAMILY_CAPACITIES[family];
    const items: Array<{ reach: ReadonlySet<ArmorPieceClass>; count: number; id: string }> = [];
    for (const effect of getArmorEffects(mode)) {
      if (feasibilityFamilyOf(effect) !== family || !effect.pieceReach) continue;
      const count = armorEffects[effect.id] ?? 0;
      if (count <= 0) continue;
      items.push({ reach: effect.pieceReach, count, id: effect.id });
    }
    const used = greedyClassUsage(capacities, items);
    const familyUsage: Partial<Record<ArmorPieceClass, ArmorSlotUsageEntry>> = {};
    for (const cls of activeClasses(capacities)) {
      familyUsage[cls] = { used: used[cls] ?? 0, capacity: capacities[cls] };
    }
    usage[family] = familyUsage;
  }

  return usage;
}

/** Effect ids incompatible with the target armor-worn state. `both` never mismatches body/power. */
export function wrongArmorTypeEffects(
  mode: GameMode,
  armorEffects: Readonly<Record<string, number>>,
  armorWorn: ArmorWorn,
): string[] {
  const removing: string[] = [];
  for (const [id, count] of Object.entries(armorEffects)) {
    if (count <= 0) continue;
    if (armorWorn === 'none') {
      removing.push(id);
      continue;
    }
    const effect = getArmorEffectById(mode, id);
    if (!effect || effect.armorType === 'both') continue;
    if (armorWorn === 'power' && effect.armorType === 'bodyArmor') removing.push(id);
    if (armorWorn === 'body' && effect.armorType === 'powerArmor') removing.push(id);
  }
  return removing;
}
