import type { GameMode } from '@/types';
import type { GeneratedOmod } from '@/types/generated';
import type { Modifier } from '@/types/modifiers';
import { hasAnyEngineEffect } from '@/types/modifiers';
import { getDataset } from './dataset';
import { hiddenArmorOmodIds } from './overrides/corrections';
import { describeBuffModifiers } from '@/lib/buff-description';

/**
 * Armor Effects checklist inventory (Phase 3 armor pipeline, UI + state half)
 * — the armor-omod analogue of `perk-modifiers.ts`. Deliberately
 * CURATED-BY-FILTER, not hand-listed: every armor/PA legendary or craftable
 * mod with at least one engine-effective modifier (`hasAnyEngineEffect`,
 * same predicate the OMOD/perk/consumable pickers badge with) shows up here
 * automatically, deduped by display name (armor and power-armor variants,
 * and same-effect-different-PA-model variants, share a name and an
 * identical modifier payload — verified 2026-07-18). Known-bad records are
 * excluded via `hiddenArmorOmodIds` (data-quality issues, source-commented
 * there) rather than by hand-picking what stays IN.
 *
 * Per-piece scaling model (docs/assumptions.md "Armor effects"):
 * - Most effects (Unyielding, 2★ SPECIAL, Powered, Active, Healthy,
 *   Bruiser's/Ranger's, Propelling, the PA Misc/Lining/underarmor mods) are
 *   flat per-piece bonuses with NO wornPieceCount condition of their own —
 *   the checklist's count multiplies the modifier's `value` (or `curveScale`
 *   for curve-driven ones like Unyielding) directly at assembly time.
 * - A few effects (Battle-Loader's, Limit-Breaking) extract as 5 already-
 *   tiered modifiers, each gated on an EXACT (or ≥5) `wornPieceCount`
 *   condition — these are `selfScaling`: the checklist count feeds
 *   `PlayerConditions.wornPieceCounts` instead (via
 *   `getArmorEffectWornPieceCounts`) and the modifiers pass through
 *   unscaled, letting `resolve.ts`'s condition eval pick the one active tier.
 *   Detected generically (any modifier carrying a `wornPieceCount`
 *   condition), not by name — so any future effect extracted in the same
 *   tiered shape is handled for free.
 */

export interface ArmorEffectEntry {
  /** Stable id — the representative OMOD's edid (armor variant wins over power-armor when both exist, alphabetically). */
  id: string;
  name: string;
  /** ESM description when non-empty, else a data-derived summary (describeBuffModifiers) of the PER-PIECE base modifiers. */
  description: string | null;
  group: 'legendary' | 'misc';
  /** 1 = single checkbox; >1 = a 0..maxCount stepper (worn-piece count). */
  maxCount: number;
  /** True when `modifiers` already carry their own wornPieceCount tiers (Battle-Loader's, Limit-Breaking) — see module header. */
  selfScaling: boolean;
  /** Present iff selfScaling — the keyword `PlayerConditions.wornPieceCounts` is keyed by for this effect. */
  wornPieceKeyword?: string;
  /** PER-PIECE (count=1) base modifiers, as extracted (+ armor-values.ts overrides). */
  modifiers: Modifier[];
}

const LEGENDARY_ATTACH_POINT_RE = /^ap_Legendary[1-4]$/;
const MAX_LEGENDARY_COUNT = 5;

/** Body-slot markers observed in armor-omod ids (Lining: Torso+Limb; PA Misc: Torso or Helmet alone) — data-derived, not a fixed roster. */
const PIECE_TAGS = ['Torso', 'Limb', 'Helmet'] as const;

function countPieceTags(ids: readonly string[]): number {
  const tags = new Set<string>();
  for (const id of ids) {
    for (const tag of PIECE_TAGS) {
      if (new RegExp(`(?:^|_)${tag}(?:_|$)`).test(id)) tags.add(tag);
    }
  }
  return tags.size;
}

function findWornPieceKeyword(modifiers: readonly Modifier[]): string | undefined {
  for (const m of modifiers) {
    const cond = m.conditions.find(c => c.kind === 'wornPieceCount');
    if (cond && cond.kind === 'wornPieceCount') return cond.keyword;
  }
  return undefined;
}

function buildEntry(name: string, records: GeneratedOmod[]): ArmorEffectEntry {
  const sorted = [...records].sort((a, b) => a.id.localeCompare(b.id));
  const representative = sorted[0];
  const ids = sorted.map(r => r.id);
  const isLegendary = LEGENDARY_ATTACH_POINT_RE.test(representative.attachPointEdid);
  const selfScaling = representative.modifiers.some(m => m.conditions.some(c => c.kind === 'wornPieceCount'));
  const maxCount = isLegendary ? MAX_LEGENDARY_COUNT : Math.max(1, Math.min(MAX_LEGENDARY_COUNT, countPieceTags(ids)));
  const description = representative.description?.trim() || describeBuffModifiers({ modifiers: representative.modifiers });
  return {
    id: representative.id,
    name,
    description: description || null,
    group: isLegendary ? 'legendary' : 'misc',
    maxCount,
    selfScaling,
    wornPieceKeyword: selfScaling ? findWornPieceKeyword(representative.modifiers) : undefined,
    modifiers: representative.modifiers,
  };
}

const effectsCache = new Map<GameMode, ArmorEffectEntry[]>();

/** The full curated checklist inventory for `mode`, grouped and sorted (legendary first, then misc, alphabetical within each). */
export function getArmorEffects(mode: GameMode): ArmorEffectEntry[] {
  const cached = effectsCache.get(mode);
  if (cached) return cached;

  const groups = new Map<string, GeneratedOmod[]>();
  for (const omod of getDataset(mode).armorOmods) {
    if (omod.id.startsWith('_PARENT_') || omod.name.startsWith('TEMPLATE')) continue;
    if (omod.obtainable === false) continue;
    if (hiddenArmorOmodIds.has(omod.id)) continue;
    if (!hasAnyEngineEffect(omod.modifiers)) continue;
    (groups.get(omod.name) ?? groups.set(omod.name, []).get(omod.name)!).push(omod);
  }

  const entries = [...groups.entries()].map(([name, records]) => buildEntry(name, records));
  entries.sort((a, b) => (a.group === b.group ? a.name.localeCompare(b.name) : a.group === 'legendary' ? -1 : 1));

  effectsCache.set(mode, entries);
  return entries;
}

function selectedCount(effect: ArmorEffectEntry, selections: Readonly<Record<string, number>>): number {
  return Math.max(0, Math.min(effect.maxCount, selections[effect.id] ?? 0));
}

/** Scales a per-piece modifier's magnitude ×count — value for plain modifiers, curveScale for curve-driven ones (Unyielding). */
function scaleModifier(m: Modifier, count: number): Modifier {
  return m.curve ? { ...m, curveScale: m.curveScale * count } : { ...m, value: m.value * count };
}

/**
 * The full folded modifier list for the given checklist selections
 * (effectId → worn count). Non-self-scaling effects get value/curveScale
 * ×count; self-scaling effects (Battle-Loader's, Limit-Breaking) pass
 * through unscaled — their own wornPieceCount conditions (paired with
 * `getArmorEffectWornPieceCounts` below) pick the one active tier.
 */
export function getArmorEffectModifiers(mode: GameMode, selections: Readonly<Record<string, number>>): Modifier[] {
  const out: Modifier[] = [];
  for (const effect of getArmorEffects(mode)) {
    const count = selectedCount(effect, selections);
    if (count <= 0) continue;
    if (effect.selfScaling) out.push(...effect.modifiers);
    else out.push(...effect.modifiers.map(m => scaleModifier(m, count)));
  }
  return out;
}

/**
 * `PlayerConditions.wornPieceCounts` derived from the same selections —
 * the single source of truth is the checklist (`PlayerConfig.armorEffects`),
 * resolveLoadout derives both this map and the modifier list from it so the
 * UI never sets wornPieceCounts directly. Only self-scaling effects
 * contribute an entry (others don't consume wornPieceCounts at all).
 */
export function getArmorEffectWornPieceCounts(
  mode: GameMode,
  selections: Readonly<Record<string, number>>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const effect of getArmorEffects(mode)) {
    if (!effect.selfScaling || !effect.wornPieceKeyword) continue;
    out[effect.wornPieceKeyword] = selectedCount(effect, selections);
  }
  return out;
}

/** Looks up one checklist entry by id — build-reducer's clamp, codec's validation. */
export function getArmorEffectById(mode: GameMode, id: string): ArmorEffectEntry | undefined {
  return getArmorEffects(mode).find(e => e.id === id);
}
