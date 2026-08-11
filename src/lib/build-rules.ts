import type { GameMode, Perk, PerkLoadout, PlayerConditions, PlayerConfig } from '@/types';
import { getPerks } from '@/data';
import type { PerkId } from '@/data/perk-ids';
import { Special } from '@/data/special';
import { computePerkBudget, perkCardCostDelta, perkSpecialKey } from '@/data/perk-budget';
import { perkRaceRestriction } from '@/data/perk-race';
import {
  canSlotCardPoints,
  perkCardCostAtRank,
  SPECIAL_ALLOCATION_POOL,
  SPECIAL_KEYS,
  SPECIAL_POINTS_CAP,
  type PerkBudget,
  type SpecialKey,
} from '@/lib/player-stats';
import { CARNIVORE_MUTATION_ID, HERBIVORE_MUTATION_ID } from '@/lib/diet-mutations';
import {
  clampArmorPieceCapacities,
  clampArmorTierBudgets,
  getArmorEffectById,
  getArmorTierUsage,
  maxFeasibleArmorEffectCount,
  MAX_LEGENDARY_COUNT,
  wrongArmorTypeEffects,
} from '@/data/armor-modifiers';
import { getBodyPartRace, getCrippablePartCount } from '@/data/bodyparts';
import {
  ENEMY_HEALTH_PERCENT_STOPS,
  PLAYER_HEALTH_PERCENT_STOPS,
  snapHealthPercent,
} from '@/lib/health-percent';
import { consumablesById, sanitizeConsumables } from '@/lib/consumable-rules';
import type { BuildState } from '@/state/build-reducer';
import type { SuggestionBudget } from '@/lib/suggest/types';

export type { SpecialKey };

const SPECIAL_TO_KEY: Record<Special, SpecialKey> = {
  [Special.Strength]: 'strength',
  [Special.Perception]: 'perception',
  [Special.Endurance]: 'endurance',
  [Special.Charisma]: 'charisma',
  [Special.Intelligence]: 'intelligence',
  [Special.Agility]: 'agility',
  [Special.Luck]: 'luck',
};

/** The user-defined base SPECIAL allocation stored in conditions, as a plain record. */
export function allocationOf(player: PlayerConfig): Record<SpecialKey, number> {
  return Object.fromEntries(SPECIAL_KEYS.map((k) => [k, player.conditions[k]])) as Record<
    SpecialKey,
    number
  >;
}

/**
 * Follow Through / Taking One for the Team both apply a TARGET debuff any
 * player's card can proc — equipping/re-ranking/removing the card seeds the
 * manual Target-section knobs to match the card's own rank.
 */
export function syncTargetDebuffConditions(
  conditions: PlayerConditions,
  perkId: string,
  rank: number,
): PlayerConditions {
  const clamped = Math.max(0, Math.min(4, rank)) as 0 | 1 | 2 | 3 | 4;
  if (perkId === 'FollowThrough') {
    return { ...conditions, followThroughPct: clamped * 10 };
  }
  if (perkId === 'TakingOneForTheTeam') {
    return { ...conditions, ...takingOneForTheTeamFields(clamped) };
  }
  return conditions;
}

/** Rank → paired Taking One for the Team manual knobs (ESM ranks pair 1:1). */
export function takingOneForTheTeamFields(
  rank: number,
): Pick<PlayerConditions, 'takingOneForTheTeamPct' | 'takingOneForTheTeamDrRank'> {
  const clamped = Math.max(0, Math.min(4, rank)) as 0 | 1 | 2 | 3 | 4;
  return {
    takingOneForTheTeamPct: clamped * 10,
    takingOneForTheTeamDrRank: clamped,
  };
}

/** Drop equipped perks locked to the race being left behind. */
export function keepForRace(list: PerkLoadout[], isGhoul: boolean, mode: GameMode): PerkLoadout[] {
  const target = isGhoul ? 'ghoul' : 'human';
  return list.filter((p) => {
    const race = perkRaceRestriction(mode, p.perkId);
    return race === null || race === target;
  });
}

/**
 * Would moving `perkId` from `fromRank` to `toRank` break its stat's
 * perk-point budget? Legendary cards never consume card points.
 */
export function regularSlotBlocked(
  player: PlayerConfig,
  perkId: string,
  fromRank: number,
  toRank: number,
  mode: GameMode,
): boolean {
  const stat = perkSpecialKey(mode, perkId);
  if (!stat) return false;
  const delta = perkCardCostDelta(mode, perkId, fromRank, toRank);
  if (delta <= 0) return false;
  const budget = computePerkBudget(mode, player.perks, player.legendaryPerks, allocationOf(player));
  return !canSlotCardPoints(budget, stat, delta);
}

export function isPerkRaceBlocked(perk: Perk, isGhoul: boolean): boolean {
  return perk.raceRestriction !== null && isGhoul !== (perk.raceRestriction === 'ghoul');
}

/**
 * Perk picker: would the next add/rank-up be refused by the reducer?
 * `equippedRank` is undefined when unequipped.
 */
export function isPerkPickerBlocked(
  budget: PerkBudget,
  perk: Perk,
  equippedRank: number | undefined,
  isLegendary: boolean,
  legendarySlotsFull: boolean,
): boolean {
  if (isLegendary) return equippedRank === undefined && legendarySlotsFull;
  if (equippedRank !== undefined && equippedRank >= perk.maxRank) return false;
  if (!perk.special) return false;
  const fromRank = equippedRank ?? 0;
  const delta = perkCardCostAtRank(perk, fromRank + 1) - perkCardCostAtRank(perk, fromRank);
  return !canSlotCardPoints(budget, SPECIAL_TO_KEY[perk.special], delta);
}

/** Legality under the perk-budget rules for suggestion enumeration. */
export function perkMoveBudget(
  budget: PerkBudget,
  perk: Perk,
  extraCost: number,
): SuggestionBudget {
  if (!perk.special) return { legal: true };
  const key = SPECIAL_TO_KEY[perk.special];
  const deficit = budget.cardPoints[key] + extraCost - budget.budgetPerStat[key];
  return deficit > 0 ? { legal: false, special: key, deficit } : { legal: true };
}

/** Clamped count for one armor effect — mirrors `armorEffect/setCount` in the reducer. */
export function clampArmorEffectCount(
  mode: GameMode,
  armorEffects: Readonly<Record<string, number>>,
  effectId: string,
  requestedCount: number,
): number {
  const effect = getArmorEffectById(mode, effectId);
  const maxCount = effect?.maxCount ?? 5;
  let count = Math.max(0, Math.min(maxCount, requestedCount));
  if (effect?.starTier !== undefined) {
    const currentOwnCount = armorEffects[effectId] ?? 0;
    const tierUsage = getArmorTierUsage(mode, armorEffects)[effect.starTier];
    const remaining = MAX_LEGENDARY_COUNT - (tierUsage - currentOwnCount);
    count = Math.max(0, Math.min(count, remaining));
  }
  if (effect && effect.group !== 'legendary') {
    const withoutSelf = { ...armorEffects };
    delete withoutSelf[effectId];
    count = Math.min(count, maxFeasibleArmorEffectCount(mode, effectId, withoutSelf));
  }
  return count;
}

/** UI stepper/combobox max — mirrors reducer refusal semantics (non-legendary piece caps only). */
export function maxAllowedArmorEffectCount(
  mode: GameMode,
  armorEffects: Readonly<Record<string, number>>,
  effectId: string,
): number {
  const effect = getArmorEffectById(mode, effectId);
  if (!effect) return 0;
  const current = armorEffects[effectId] ?? 0;
  const withoutSelf = { ...armorEffects };
  delete withoutSelf[effectId];

  let max = effect.maxCount;
  if (effect.group !== 'legendary') {
    max = Math.min(max, maxFeasibleArmorEffectCount(mode, effectId, withoutSelf));
  }
  if (effect.starTier !== undefined) {
    const tierUsage = getArmorTierUsage(mode, armorEffects)[effect.starTier];
    max = Math.min(max, current + Math.max(0, MAX_LEGENDARY_COUNT - tierUsage));
  }
  return max;
}

export function armorEffectIncrementBlocked(
  mode: GameMode,
  armorEffects: Readonly<Record<string, number>>,
  effectId: string,
): boolean {
  const current = armorEffects[effectId] ?? 0;
  return current >= maxAllowedArmorEffectCount(mode, armorEffects, effectId);
}

/** Stored count for an armor effect, clamped to its per-piece maxCount. */
export function storedArmorEffectCount(
  effect: { id: string; maxCount: number },
  armorEffects: Readonly<Record<string, number>>,
): number {
  return Math.max(0, Math.min(effect.maxCount, armorEffects[effect.id] ?? 0));
}

export function clampCrippledLimbCount(
  mode: GameMode,
  targetRace: string | null | undefined,
  count: number,
): number {
  const max = getCrippablePartCount(mode, targetRace);
  return Math.max(0, Math.min(count, max));
}

export function clampSpecialStat(value: number): number {
  return Math.max(1, Math.min(SPECIAL_POINTS_CAP, value));
}

/** Can `stat` be raised to `value` without exceeding the 56-point pool? */
export function canRaiseSpecialAllocation(
  conditions: PlayerConditions,
  stat: SpecialKey,
  value: number,
): boolean {
  const clamped = clampSpecialStat(value);
  const next = { ...conditions, [stat]: clamped };
  const total = SPECIAL_KEYS.reduce((sum, k) => sum + next[k], 0);
  return !(clamped > conditions[stat] && total > SPECIAL_ALLOCATION_POOL);
}

/** Trim SPECIAL stats until the 56-point pool is satisfied (hydration/import). */
export function clampSpecialAllocationPool(conditions: PlayerConditions): {
  conditions: PlayerConditions;
  changed: boolean;
} {
  let next = { ...conditions };
  let changed = false;
  for (const k of SPECIAL_KEYS) {
    const clamped = clampSpecialStat(next[k]);
    if (clamped !== next[k]) {
      next[k] = clamped;
      changed = true;
    }
  }
  while (SPECIAL_KEYS.reduce((sum, k) => sum + next[k], 0) > SPECIAL_ALLOCATION_POOL) {
    const key = [...SPECIAL_KEYS].sort((a, b) => next[b] - next[a]).find((k) => next[k] > 1);
    if (!key) break;
    next[key] -= 1;
    changed = true;
  }
  return { conditions: next, changed };
}

export function resolveDietMutations(mutations: string[]): {
  mutations: string[];
  changed: boolean;
} {
  const hasCarnivore = mutations.includes(CARNIVORE_MUTATION_ID);
  const hasHerbivore = mutations.includes(HERBIVORE_MUTATION_ID);
  if (!hasCarnivore || !hasHerbivore) return { mutations, changed: false };
  return {
    mutations: mutations.filter((id) => id !== HERBIVORE_MUTATION_ID),
    changed: true,
  };
}

export function snapPlayerHealthPercent(value: number): number {
  return snapHealthPercent(value, PLAYER_HEALTH_PERCENT_STOPS);
}

export function snapEnemyHealthPercent(value: number): number {
  return snapHealthPercent(value, ENEMY_HEALTH_PERCENT_STOPS);
}

/** Enemy + player updates when the target race changes (TargetSection selectRace). */
export function targetRaceSelection(
  mode: GameMode,
  raceId: string | null,
  currentCrippledLimbCount: number,
): {
  targetRace: string | null;
  targetBodyPart: string | null;
  isAimingAtWeakpoint: boolean;
  crippledLimbCount: number;
} {
  const race = raceId ? getBodyPartRace(mode, raceId) : undefined;
  const best = race ? [...race.parts].sort((a, b) => b.dmgMult - a.dmgMult)[0] : undefined;
  const isAimingAtWeakpoint = (best?.dmgMult ?? 1.0) > 1.0;
  return {
    targetRace: raceId,
    targetBodyPart: best?.name ?? null,
    isAimingAtWeakpoint,
    crippledLimbCount: clampCrippledLimbCount(mode, raceId, currentCrippledLimbCount),
  };
}

/** Body-part picker: arms aiming for a real part, disarms for default/null (keeps stored part). */
export function targetBodyPartSelection(
  part: string | null,
  defaultOption: string,
): {
  targetBodyPart?: string;
  isAimingAtWeakpoint: boolean;
} {
  if (!part || part === defaultOption) {
    return { isAimingAtWeakpoint: false };
  }
  return { targetBodyPart: part, isAimingAtWeakpoint: true };
}

function normalizeArmorEffects(
  mode: GameMode,
  armorEffects: Record<string, number>,
  armorWorn: PlayerConditions['armorWorn'],
  warnings: string[],
): Record<string, number> {
  const wrongType = wrongArmorTypeEffects(mode, armorEffects, armorWorn);
  let next = { ...armorEffects };
  if (wrongType.length > 0) {
    for (const id of wrongType) delete next[id];
    warnings.push(
      'armor effects incompatible with the selected armor type were removed during normalization',
    );
  }

  const perMax: Record<string, number> = {};
  let perMaxChanged = false;
  for (const [id, rawCount] of Object.entries(next)) {
    const effect = getArmorEffectById(mode, id);
    const maxCount = effect?.maxCount ?? 5;
    const clamped = Math.max(0, Math.min(maxCount, rawCount));
    if (clamped !== rawCount) perMaxChanged = true;
    if (clamped > 0) perMax[id] = clamped;
  }
  if (perMaxChanged) {
    next = perMax;
    warnings.push('armor effect counts were clamped to each effect’s maxCount');
  }

  const clampedTiers = clampArmorTierBudgets(mode, next);
  if (clampedTiers.changed) {
    next = clampedTiers.armorEffects;
    warnings.push(
      'armor legendary pieces exceeded the 5-per-star-tier limit — extra pieces were removed',
    );
  }

  const clampedPieces = clampArmorPieceCapacities(mode, next);
  if (clampedPieces.changed) {
    next = clampedPieces.armorEffects;
    warnings.push('armor piece slots exceeded capacity — extra pieces were removed');
  }

  const pieceFeasible: Record<string, number> = { ...next };
  let pieceChanged = false;
  for (const [id, rawCount] of Object.entries(next)) {
    const effect = getArmorEffectById(mode, id);
    if (!effect || effect.group === 'legendary') continue;
    const withoutSelf = { ...next };
    delete withoutSelf[id];
    const clamped = Math.min(rawCount, maxFeasibleArmorEffectCount(mode, id, withoutSelf));
    if (clamped !== rawCount) pieceChanged = true;
    if (clamped > 0) pieceFeasible[id] = clamped;
    else delete pieceFeasible[id];
  }
  if (pieceChanged) {
    next = pieceFeasible;
    warnings.push('armor effect counts were clamped to feasible piece-slot limits');
  }

  return next;
}

/**
 * Applies every build invariant once — used by `build/hydrate` and codec decode.
 * Pushes into `warnings` only when a value actually changes.
 */
export function normalizeBuildState(
  mode: GameMode,
  input: BuildState,
): { state: BuildState; warnings: string[] } {
  const warnings: string[] = [];
  const player = { ...input.player, conditions: { ...input.player.conditions } };
  const enemy = { ...input.enemy, conditions: { ...input.enemy.conditions } };

  const special = clampSpecialAllocationPool(player.conditions);
  if (special.changed) {
    player.conditions = special.conditions;
    warnings.push('SPECIAL allocation exceeded the 56-point pool — values were reduced');
  }

  const snappedPlayerHp = snapPlayerHealthPercent(player.conditions.healthPercent);
  if (snappedPlayerHp !== player.conditions.healthPercent) {
    player.conditions.healthPercent = snappedPlayerHp;
    warnings.push('player Health % was snapped to the nearest allowed slider stop');
  }

  if (player.conditions.isGhoul && player.conditions.healthPercent !== 100) {
    player.conditions.healthPercent = 100;
    warnings.push('Health % was reset to 100 for a Ghoul build');
  }

  const isGhoul = player.conditions.isGhoul ?? false;
  const prunedPerks = keepForRace(player.perks, isGhoul, mode);
  const prunedLegendary = keepForRace(player.legendaryPerks, isGhoul, mode);
  if (
    prunedPerks.length !== player.perks.length ||
    prunedLegendary.length !== player.legendaryPerks.length
  ) {
    player.perks = prunedPerks;
    player.legendaryPerks = prunedLegendary;
    warnings.push('perks locked to the other race were removed');
  }

  for (const list of [player.perks, player.legendaryPerks]) {
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      const maxRank = getPerks(mode)[entry.perkId as PerkId]?.maxRank ?? entry.rank;
      if (entry.rank > maxRank) {
        list[i] = { ...entry, rank: maxRank };
        warnings.push(`perk "${entry.perkId}" rank was clamped to its current max`);
      }
    }
  }

  const diet = resolveDietMutations(player.mutations);
  if (diet.changed) {
    player.mutations = diet.mutations;
    warnings.push('Carnivore and Herbivore cannot coexist — one was removed');
  }

  const sanitized = sanitizeConsumables(consumablesById(mode), player.consumables);
  if (sanitized.length !== player.consumables.length) {
    player.consumables = sanitized;
    warnings.push(
      "consumables were removed to satisfy stacking rules (one chem/alcohol at a time; same-bonus food/drink don't stack)",
    );
  }

  player.conditions.isInPowerArmor = player.conditions.armorWorn === 'power';
  player.armorEffects = normalizeArmorEffects(
    mode,
    player.armorEffects,
    player.conditions.armorWorn,
    warnings,
  );

  if (typeof enemy.conditions.healthPercent === 'number') {
    const snappedEnemyHp = snapEnemyHealthPercent(enemy.conditions.healthPercent);
    if (snappedEnemyHp !== enemy.conditions.healthPercent) {
      enemy.conditions.healthPercent = snappedEnemyHp;
      warnings.push('enemy Health % was snapped to the nearest allowed slider stop');
    }
  }

  const clampedLimbs = clampCrippledLimbCount(
    mode,
    enemy.conditions.targetRace,
    enemy.conditions.crippledLimbCount,
  );
  if (clampedLimbs !== enemy.conditions.crippledLimbCount) {
    enemy.conditions.crippledLimbCount = clampedLimbs;
    warnings.push('crippled limb count was clamped to the selected race');
  }

  return {
    state: { ...input, player, enemy },
    warnings,
  };
}
