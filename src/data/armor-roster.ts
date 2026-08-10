import type { GameMode } from '@/types';
import type { GeneratedOmod } from '@/types/generated';
import type { Modifier } from '@/types/modifiers';
import { getDataset } from './dataset';
import { isRecordVisible } from './overlay';
import {
  buildEntry,
  isJetpackReskin,
  LEGENDARY_ATTACH_POINT_RE,
  nonLegendaryGroup,
} from './armor-derivation';
import { GROUP_ORDER } from './armor-capacities';
import type { ArmorEffectEntry } from './armor-types';

/**
 * Armor checklist inventory (Phase 3 armor pipeline, UI + state half)
 * — the armor-omod analogue of `perk-modifiers.ts`. Deliberately
 * CURATED-BY-ATTACH-POINT, not hand-listed: every obtainable armor/PA mod
 * on an admitted workbench attach point (Material → Lining → Misc → 1★–4★)
 * shows up here automatically, deduped by display name (armor and
 * power-armor variants, and same-effect-different-PA-model variants, share
 * a name and an identical modifier payload — verified 2026-07-18). Cosmetic
 * attach points (paint, limb skins, reroll, etc.) are excluded by an explicit
 * allow-list. Engine-ineffective mods are included and badged `inert` rather
 * than hidden (`hasAnyEngineEffect`, same predicate the OMOD picker uses).
 * Known-bad records are excluded via `hiddenArmorOmodIds` (data-quality
 * issues, source-commented there) rather than by hand-picking what stays IN.
 *
 * Per-piece scaling model (docs/assumptions.md "Armor"):
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

const effectsCache = new Map<GameMode, ArmorEffectEntry[]>();

/** The full curated checklist inventory for `mode`, grouped and sorted (lining → material → misc → 1★–4★, alphabetical within each). */
export function getArmorEffects(mode: GameMode): ArmorEffectEntry[] {
  const cached = effectsCache.get(mode);
  if (cached) return cached;

  const dataset = getDataset(mode);
  const groups = new Map<string, GeneratedOmod[]>();
  for (const omod of dataset.armorOmods) {
    if (omod.id.startsWith('_PARENT_') || omod.name.startsWith('TEMPLATE')) continue;
    if (
      !isRecordVisible(omod, {
        hidden: dataset.hiddenArmorOmodIds,
        forceVisible: dataset.forceVisibleArmorOmodIds,
      })
    )
      continue;
    const isLegendary = LEGENDARY_ATTACH_POINT_RE.test(omod.attachPointEdid);
    if (!isLegendary && nonLegendaryGroup(omod) === null) continue; // cosmetic/unlisted attach point
    if (!isLegendary && isJetpackReskin(omod.name)) continue; // cosmetic jetpack skin
    (groups.get(omod.name) ?? groups.set(omod.name, []).get(omod.name)!).push(omod);
  }

  const entries = [...groups.entries()].map(([name, records]) => buildEntry(name, records));
  entries.sort((a, b) => {
    const groupDiff = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
    if (groupDiff !== 0) return groupDiff;
    if (a.group === 'legendary' && a.starTier !== b.starTier) {
      return (a.starTier ?? 0) - (b.starTier ?? 0);
    }
    return a.name.localeCompare(b.name);
  });

  effectsCache.set(mode, entries);
  return entries;
}

/**
 * Clamps a checklist selection to `[0, effect.maxCount]`. Shared by the
 * roster's modifier folding and the budget's usage accounting — exported
 * rather than private because both modules need it.
 */
export function selectedCount(
  effect: ArmorEffectEntry,
  selections: Readonly<Record<string, number>>,
): number {
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
export function getArmorEffectModifiers(
  mode: GameMode,
  selections: Readonly<Record<string, number>>,
): Modifier[] {
  const out: Modifier[] = [];
  for (const effect of getArmorEffects(mode)) {
    const count = selectedCount(effect, selections);
    if (count <= 0) continue;
    if (effect.selfScaling) out.push(...effect.modifiers);
    else out.push(...effect.modifiers.map((m) => scaleModifier(m, count)));
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
  selections: Readonly<Record<string, number>>,
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
  return getArmorEffects(mode).find((e) => e.id === id);
}
