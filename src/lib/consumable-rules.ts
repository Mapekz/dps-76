import type { GameMode } from '@/types';
import type { GeneratedBuff } from '@/types/generated';
import { getConsumables } from '@/data/buffs';

/**
 * The ONE stacking-rules implementation for consumables — used by the build
 * reducer (selection), the persistence codec (sanitizing share-URL
 * payloads), and the picker UI ("replaces X" preview). Pure functions over a
 * buffsById lookup so callers can pass real data (`consumablesById`) or
 * synthetic fixtures in tests.
 *
 * Binding rules (user-specified 2026-07-10; recorded in docs/assumptions.md
 * "Consumable stacking & addictions"):
 * - Only one CHEM active at a time.
 * - Only one ALCOHOL active at a time (independent of chem).
 * - FOOD and non-alcohol DRINK stack UNLESS they grant the "same bonus" —
 *   the new item displaces the old one.
 * - Only one MAGAZINE and one BOBBLEHEAD active at a time (2026-07-13,
 *   each independent of the other and of chem/alcohol/food/drink) — the
 *   in-game buff-duration slots, same category-only collision as chem/alcohol.
 *
 * "Same bonus" is derived from ESM data, never hand-authored. Each
 * dispel-flagged MGEF effect resolves to one `GeneratedBuff.dispelKeys`
 * entry: the effect's own resolved KYWD edids, sorted and joined with '|'.
 * Two buffs share a bonus iff they carry an IDENTICAL key — exact
 * keyword-SET equality, NOT any-keyword intersection. Intersection is
 * provably wrong: every food effect carries the same broad,
 * non-discriminating `FoodEffect` (+`SURV_EffectTypeFoodBuff`) keywords
 * regardless of what it actually buffs, so an intersection test would
 * collide a Strength food with an Endurance food. Each dispel-flagged effect
 * ALSO carries exactly one discriminating keyword
 * (`FoodDispelEffect_Strength`, `StackBuffStrength`, `StackPsychoStrength`,
 * `StackAlcoholStrength`, ...) — the exact-set test is what actually
 * isolates same-bonus pairs. See docs/assumptions.md "Consumable stacking &
 * addictions" for the full derivation and the cross-category proof point
 * (`FortifyStrengthFood` shared by both food AND drink records).
 *
 * Collision is ITEM-level, not per-effect: a collision on any single
 * `dispelKeys` entry evicts the WHOLE colliding item, not just the matching
 * effect — a deliberate simplification of the game's real per-effect dispel
 * (documented tradeoff in docs/assumptions.md, not an oversight).
 *
 * Chem-vs-chem and alcohol-vs-alcohol collisions are enforced by category
 * ALONE, independent of dispelKeys — some chems/alcohols carry no
 * dispel-flagged effect at all (e.g. flat-HP-only items), but "one at a
 * time" still applies to them.
 */

export interface SelectionResult {
  /** The new active consumable list. */
  consumables: string[];
  /** Ids evicted by this selection (empty on a plain toggle-off). */
  replaced: string[];
}

function sharesBonus(a: GeneratedBuff, b: GeneratedBuff): boolean {
  if (a.category === 'chem' && b.category === 'chem') return true;
  if (a.category === 'alcohol' && b.category === 'alcohol') return true;
  // Magazines and bobbleheads: only one of each held at a time (2026-07-13),
  // same category-only collision as chem/alcohol — independent of each
  // other and of food/chems.
  if (a.category === 'magazine' && b.category === 'magazine') return true;
  if (a.category === 'bobblehead' && b.category === 'bobblehead') return true;
  if (!a.dispelKeys || !b.dispelKeys) return false;
  const bKeys = new Set(b.dispelKeys);
  return a.dispelKeys.some((key) => bKeys.has(key));
}

/**
 * Adds `id`, displacing every currently-active item it collides with
 * (item-level: chem-vs-chem, alcohol-vs-alcohol, or a shared `dispelKeys`
 * entry). An unknown `id` (not in `buffsById`) is a no-op — it is neither
 * added nor does it displace anything.
 */
export function applySelection(
  buffsById: ReadonlyMap<string, GeneratedBuff>,
  active: readonly string[],
  id: string,
): SelectionResult {
  const incoming = buffsById.get(id);
  if (!incoming) return { consumables: [...active], replaced: [] };

  const replaced: string[] = [];
  const kept: string[] = [];
  for (const activeId of active) {
    const activeBuff = buffsById.get(activeId);
    if (activeBuff && sharesBonus(incoming, activeBuff)) replaced.push(activeId);
    else kept.push(activeId);
  }
  return { consumables: [...kept, id], replaced };
}

/** Active → plain removal. Inactive → `applySelection` (auto-displaces collisions). */
export function toggleConsumable(
  buffsById: ReadonlyMap<string, GeneratedBuff>,
  active: readonly string[],
  id: string,
): SelectionResult {
  if (active.includes(id)) return { consumables: active.filter((x) => x !== id), replaced: [] };
  return applySelection(buffsById, active, id);
}

/**
 * Normalizes an arbitrary (possibly legacy or adversarial) id list into a
 * legal selection: replays each id through `applySelection` in order — later
 * ids win collisions with earlier ones — dropping unknown ids and duplicates
 * along the way. Used by the persistence codec on decode to normalize
 * share-URL payloads that predate (or bypassed) the stacking rules.
 */
export function sanitizeConsumables(
  buffsById: ReadonlyMap<string, GeneratedBuff>,
  ids: string[],
): string[] {
  let active: string[] = [];
  for (const id of ids) {
    if (!buffsById.has(id) || active.includes(id)) continue;
    active = applySelection(buffsById, active, id).consumables;
  }
  return active;
}

let idCache: Map<GameMode, Map<string, GeneratedBuff>> | null = null;

/**
 * Memoized id→buff map over `getConsumables(mode)` — the dataset is static
 * after module load, so this is safe to cache for the app's lifetime.
 */
export function consumablesById(mode: GameMode): Map<string, GeneratedBuff> {
  if (!idCache) idCache = new Map();
  let byId = idCache.get(mode);
  if (!byId) {
    byId = new Map(getConsumables(mode).map((b) => [b.id, b]));
    idCache.set(mode, byId);
  }
  return byId;
}
