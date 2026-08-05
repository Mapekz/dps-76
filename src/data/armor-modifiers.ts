import type { GameMode } from '@/types';
import type { GeneratedOmod } from '@/types/generated';
import type { Modifier } from '@/types/modifiers';
import { hasAnyEngineEffect } from '@/types/modifiers';
import { getDataset } from './dataset';
import { isRecordVisible } from './overlay';
import { describeBuffModifiers } from '@/lib/buff-description';
import { armorPieceOverrides } from './overrides/armor-piece-overrides';

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

const LEGENDARY_ATTACH_POINT_RE = /^ap_Legendary([1-4])$/;
/** Per-star-tier budget: sum of worn-piece counts for all legendary effects sharing a tier must stay ≤ this. */
export const MAX_LEGENDARY_COUNT = 5;

const GROUP_ORDER: readonly ArmorSlotGroup[] = ['lining', 'material', 'misc', 'legendary'];

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

const BODY_ARMOR_CAPACITIES: Readonly<Record<ArmorPieceClass, number>> = {
  torso: 1,
  arm: 2,
  leg: 2,
  helmet: 0,
  underarmorStyle: 0,
  underarmorLining: 0,
};

const POWER_ARMOR_CAPACITIES: Readonly<Record<ArmorPieceClass, number>> = {
  torso: 1,
  arm: 2,
  leg: 2,
  helmet: 1,
  underarmorStyle: 0,
  underarmorLining: 0,
};

const UNDERARMOR_STYLE_CAPACITIES: Readonly<Record<ArmorPieceClass, number>> = {
  torso: 0,
  arm: 0,
  leg: 0,
  helmet: 0,
  underarmorStyle: 1,
  underarmorLining: 0,
};

const UNDERARMOR_LINING_CAPACITIES: Readonly<Record<ArmorPieceClass, number>> = {
  torso: 0,
  arm: 0,
  leg: 0,
  helmet: 0,
  underarmorStyle: 0,
  underarmorLining: 1,
};

const FAMILY_CAPACITIES: Readonly<
  Record<FeasibilityFamilyKey, Readonly<Record<ArmorPieceClass, number>>>
> = {
  'bodyArmor:material': BODY_ARMOR_CAPACITIES,
  'bodyArmor:misc': BODY_ARMOR_CAPACITIES,
  'powerArmor:misc': POWER_ARMOR_CAPACITIES,
  underarmorStyle: UNDERARMOR_STYLE_CAPACITIES,
  underarmorLining: UNDERARMOR_LINING_CAPACITIES,
};

/**
 * Non-legendary attach points admitted to the armor picker, and which slot
 * group each belongs to — an explicit include-list (like omods.ts's
 * DEAD_MECHANIC_SLOT_EDIDS / SLOT_LABEL_OVERRIDES), not a heuristic, so a
 * new cosmetic attach point in a future ESM dump is excluded by default
 * rather than silently appearing. Verified against the 20260803 dump via
 * `jq` census over armor-omods.json (see docs/adr/0008).
 */
function nonLegendaryGroup(omod: GeneratedOmod): ArmorSlotGroup | null {
  switch (omod.attachPointEdid) {
    case 'ap_armor_Tier':
      return 'material';
    case 'ap_underarmor_style':
      return 'lining';
    case 'ap_armor_Lining':
      // Underarmor lining effects (Shielded/Treated/Protective/Resistant
      // Lining) and non-PA functional mods (Sleek, Cushioned, Jetpack…)
      // share this one attach point in the ESM — the `_UnderArmor_` id
      // token is the only discriminator.
      return omod.id.includes('_UnderArmor_') ? 'lining' : 'misc';
    case 'ap_PowerArmor_Misc':
      return 'misc';
    default:
      return null;
  }
}

/** True for jetpack cosmetic reskins (Nuka-Cola Jetpack, MothMan Jet Pack, …) that must collapse into the base "Jetpack"/"Jet Pack" entry. */
function isJetpackReskin(name: string): boolean {
  return /jet ?pack/i.test(name) && name !== 'Jetpack' && name !== 'Jet Pack';
}

function armorTypeOfRecord(omod: GeneratedOmod): ArmorType {
  if (omod.attachPointEdid === 'ap_underarmor_style') return 'both';
  if (omod.attachPointEdid === 'ap_armor_Lining' && omod.id.includes('_UnderArmor_')) return 'both';
  if (omod.attachPointEdid.startsWith('ap_PowerArmor_')) return 'powerArmor';
  if (omod.attachPointEdid === 'ap_armor_Tier') return 'bodyArmor';
  if (omod.attachPointEdid === 'ap_armor_Lining') return 'bodyArmor';
  return 'bodyArmor';
}

/**
 * Legendary armor-type classification is by record presence per display
 * name, not an override list: verified 2026-08-04 against granting COBJs —
 * all 9 obtainable Armor-only names carry `Workbench_Crafting_Armor`
 * (0x001F6062), all 8 PA-only names carry `Workbench_Crafting_PowerArmor`
 * (0x004EA39F), so presence is the restriction with no authoring gaps
 * (docs/adr/0010). Don't infer PA-exclusivity from the `ma_PowerArmorMod`
 * keyword instead — it appears on every dual-availability legendary's
 * PA-flavored record too (`.claude/skills/esm-walk/SKILL.md`, "Power-armor
 * exclusivity").
 */
function legendaryArmorType(records: readonly GeneratedOmod[]): ArmorType {
  let hasArmor = false;
  let hasPA = false;
  for (const r of records) {
    if (/mod_Legendary_Armor/.test(r.id)) hasArmor = true;
    if (/mod_Legendary_PowerArmor/.test(r.id)) hasPA = true;
  }
  if (hasArmor && hasPA) return 'both';
  if (hasPA) return 'powerArmor';
  return 'bodyArmor';
}

function tokensFromTexts(texts: readonly string[]): string[] {
  const tokens: string[] = [];
  for (const text of texts) {
    for (const token of text.split('_')) tokens.push(token);
  }
  return tokens;
}

function derivePieceReachFromTokens(texts: readonly string[]): ReadonlySet<ArmorPieceClass> {
  const reach = new Set<ArmorPieceClass>();
  for (const token of tokensFromTexts(texts)) {
    if (token === 'Torso') reach.add('torso');
    else if (token === 'Helmet') reach.add('helmet');
    else if (token === 'LimbArm' || token === 'Arm') reach.add('arm');
    else if (token === 'LimbLeg' || token === 'Leg') reach.add('leg');
    else if (token === 'Limb') {
      reach.add('arm');
      reach.add('leg');
    }
  }
  return reach;
}

/**
 * Piece reach is the plain union of ESM piece tags — deliberately no
 * "specific tags beat generic `Limb`" tie-break, so Muffled (targets the
 * generic `Limb` lining keyword) reaches arms wherever a set's arm ARMO
 * genuinely carries that keyword: BOS Infantry (`ma_armor_BOSInfantry_
 * Lining_Limb` 0x005DD33E) and Robot (`ma_armor_Lining_Robot_Limb`
 * 0x00508D82), verified 2026-08-04 (docs/adr/0010). The union reading is
 * correct — Muffled genuinely fits arms on those sets.
 */
function derivePieceReach(
  name: string,
  records: readonly GeneratedOmod[],
  armorType: ArmorType,
): ReadonlySet<ArmorPieceClass> {
  const override = armorPieceOverrides[name];
  if (override) return new Set(override);

  const representative = records[0];
  if (representative.attachPointEdid === 'ap_underarmor_style') return new Set(['underarmorStyle']);
  if (representative.id.includes('_UnderArmor_')) return new Set(['underarmorLining']);

  const texts: string[] = [];
  for (const r of records) {
    texts.push(r.id);
    if (r.targetKeywords) texts.push(...r.targetKeywords);
  }
  const reach = derivePieceReachFromTokens(texts);
  if (reach.size > 0) return reach;

  // Records with only set-wide keywords and no piece suffix (Shrouded/Wood:
  // ma_armor_Wood + ma_armor_lining) attach anywhere on the chassis — the
  // set-wide keyword sits on every piece, so full reach IS the data-driven
  // reading. The `*_Null` empty-slot placeholders that also matched here are
  // hidden via `hiddenArmorOmodIds` instead.
  if (armorType === 'powerArmor') return new Set(['torso', 'arm', 'leg', 'helmet']);
  if (armorType === 'bodyArmor') return new Set(['torso', 'arm', 'leg']);
  return reach;
}

function maxCountFromReach(reach: ReadonlySet<ArmorPieceClass>, armorType: ArmorType): number {
  if (reach.has('underarmorStyle')) return UNDERARMOR_STYLE_CAPACITIES.underarmorStyle;
  if (reach.has('underarmorLining')) return UNDERARMOR_LINING_CAPACITIES.underarmorLining;

  const capacities = armorType === 'powerArmor' ? POWER_ARMOR_CAPACITIES : BODY_ARMOR_CAPACITIES;
  let sum = 0;
  for (const cls of reach) sum += capacities[cls];
  return sum > 0 ? sum : 1;
}

function feasibilityFamilyOf(effect: ArmorEffectEntry): FeasibilityFamilyKey | null {
  if (effect.group === 'legendary') return null;
  if (effect.pieceReach?.has('underarmorStyle')) return 'underarmorStyle';
  if (effect.pieceReach?.has('underarmorLining')) return 'underarmorLining';
  if (effect.group === 'material') return 'bodyArmor:material';
  if (effect.group === 'misc' && effect.armorType === 'powerArmor') return 'powerArmor:misc';
  if (effect.group === 'misc') return 'bodyArmor:misc';
  return null;
}

function activeClasses(capacities: Readonly<Record<ArmorPieceClass, number>>): ArmorPieceClass[] {
  return (Object.keys(capacities) as ArmorPieceClass[]).filter((c) => capacities[c] > 0);
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

function findWornPieceKeyword(modifiers: readonly Modifier[]): string | undefined {
  for (const m of modifiers) {
    const cond = m.conditions.find((c) => c.kind === 'wornPieceCount');
    if (cond && cond.kind === 'wornPieceCount') return cond.keyword;
  }
  return undefined;
}

function buildEntry(name: string, records: GeneratedOmod[]): ArmorEffectEntry {
  // Engine-effective records sort before non-effective ones, then by id —
  // a no-op for every effect that existed before docs/adr/0008 (verified:
  // all 16 pre-existing legendary effect ids unchanged); it only starts
  // mattering once a same-name group can mix an effective and inert record.
  const sorted = [...records].sort((a, b) => {
    const aEff = hasAnyEngineEffect(a.modifiers);
    const bEff = hasAnyEngineEffect(b.modifiers);
    if (aEff !== bEff) return aEff ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
  const representative = sorted[0];
  // "Powered" (+AP regen) has twin records at ap_Legendary1
  // (mod_Legendary_Armor_APRegen) and ap_Legendary2 (mod_Legendary_Armor2_
  // APRegen / mod_Legendary_PowerArmor2_APRegen); the alphabetical
  // representative pick lands on the tier-2 record, so Powered counts
  // against the 2★ budget — pre-existing data ambiguity inherited
  // deliberately, not fixed here.
  const match = LEGENDARY_ATTACH_POINT_RE.exec(representative.attachPointEdid);
  const isLegendary = match !== null;
  const starTier = match ? (Number(match[1]) as ArmorStarTier) : undefined;
  const selfScaling = representative.modifiers.some((m) =>
    m.conditions.some((c) => c.kind === 'wornPieceCount'),
  );

  const armorType = isLegendary ? legendaryArmorType(sorted) : armorTypeOfRecord(representative);
  const pieceReach = isLegendary ? undefined : derivePieceReach(name, sorted, armorType);
  const maxCount = isLegendary
    ? MAX_LEGENDARY_COUNT
    : pieceReach && pieceReach.size > 0
      ? maxCountFromReach(pieceReach, armorType)
      : 1;

  const description =
    representative.description?.trim() ||
    describeBuffModifiers({ modifiers: representative.modifiers });
  return {
    id: representative.id,
    name,
    description: description || null,
    group: isLegendary ? 'legendary' : nonLegendaryGroup(representative)!,
    attachPointEdid: representative.attachPointEdid,
    badge: hasAnyEngineEffect(representative.modifiers) ? undefined : 'inert',
    maxCount,
    selfScaling,
    wornPieceKeyword: selfScaling ? findWornPieceKeyword(representative.modifiers) : undefined,
    modifiers: representative.modifiers,
    starTier,
    armorType,
    pieceReach: pieceReach && pieceReach.size > 0 ? pieceReach : undefined,
  };
}

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

function selectedCount(
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

/** Effect ids whose `armorType` mismatches the target power-armor toggle. `both` never mismatches. */
export function wrongArmorTypeEffects(
  mode: GameMode,
  armorEffects: Readonly<Record<string, number>>,
  isInPowerArmor: boolean,
): string[] {
  const removing: string[] = [];
  for (const [id, count] of Object.entries(armorEffects)) {
    if (count <= 0) continue;
    const effect = getArmorEffectById(mode, id);
    if (!effect || effect.armorType === 'both') continue;
    if (isInPowerArmor && effect.armorType === 'bodyArmor') removing.push(id);
    if (!isInPowerArmor && effect.armorType === 'powerArmor') removing.push(id);
  }
  return removing;
}
