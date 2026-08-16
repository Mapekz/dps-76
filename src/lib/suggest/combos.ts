import type { GameMode, Perk } from '@/types';
import type { Bucket, Condition, Modifier, StaticLoadoutContext } from '@/types/modifiers';
import { getPerks, getWeapons } from '@/data';
import { getLegendaryOmodSlots, getOmodSlots } from '@/data/omods';
import { computePerkBudget } from '@/data/perk-budget';
import { getGeneratedPerk, getLoadoutModifiers, perkHasEngineEffect } from '@/data/perk-modifiers';
import { allocationOf } from '@/lib/build-rules';
import { legendaryPerkIds } from '@/lib/nukes-dragons';
import {
  perkCardCostAtRank,
  SPECIAL_ALLOCATION_POOL,
  SPECIAL_POINTS_CAP,
  type PerkBudget,
} from '@/lib/player-stats';
import { Special } from '@/data/special';
import {
  LEGENDARY_PERK_SLOTS as LEGENDARY_SLOTS,
  type BuildAction,
  type BuildState,
  type ScenarioKey,
  type SpecialKey,
} from '@/state/build-reducer';
import type { SuggestionCandidate } from './types';
import { buildStaticLoadoutContext } from './loadout-context';
import { legendaryEffectLabel, perkLabel } from './labels';
import { firstEmptyLegendarySlot, perkAddAction } from './variants';

/**
 * Combo suggestions — mechanism-derived bundles that open synergy doors the
 * greedy single-step ladder cannot (Onslaught stacks, crit cadence, Bullet Storm).
 */

export interface ComboMechanism {
  id: string;
  displayName: string;
  metric?: ScenarioKey;
}

export const COMBO_MECHANISMS: readonly ComboMechanism[] = [
  { id: 'onslaught-forward', displayName: 'Full Onslaught' },
  { id: 'onslaught-reverse', displayName: 'Full Reverse Onslaught' },
  { id: 'crit-cadence', displayName: 'Full Crit Cadence', metric: 'vats' },
  { id: 'bullet-storm', displayName: 'Full Bullet Storm' },
];

const SPECIAL_TO_KEY: Record<Special, SpecialKey> = {
  [Special.Strength]: 'strength',
  [Special.Perception]: 'perception',
  [Special.Endurance]: 'endurance',
  [Special.Charisma]: 'charisma',
  [Special.Intelligence]: 'intelligence',
  [Special.Agility]: 'agility',
  [Special.Luck]: 'luck',
};

const CRIT_PAYOFF_BUCKETS: ReadonlySet<Bucket> = new Set([
  'critDmgBase',
  'critDmgBonus',
  'critDmgBonusScale',
]);
const CRIT_CONTRIBUTOR_BUCKETS: ReadonlySet<Bucket> = new Set([
  'critFill',
  'critConsumption',
  'specialLuck',
]);

interface Piece {
  key: string;
  displayName: string;
  actions: BuildAction[];
  perkPointCost: number;
  isPayoff: boolean;
  kind: 'perk' | 'legendary' | 'mod' | 'special';
  perk?: Perk;
  modifiers?: readonly Modifier[];
}

function allocationPoolFree(allocation: Record<SpecialKey, number>): number {
  let sum = 0;
  for (const v of Object.values(allocation)) sum += v;
  return SPECIAL_ALLOCATION_POOL - sum;
}

function unionPerkModifiers(mode: GameMode, perkId: string): Modifier[] {
  // Union via getLoadoutModifiers, not generated.ranks directly: the override
  // overlay (extraPerkModifiers — e.g. Gunslinger Master's hand-authored
  // `onslaughtReverse` marker) only exists on that accessor's output.
  const generated = getGeneratedPerk(mode, perkId);
  if (!generated) return [];
  const maxRank = generated.card ? generated.card.rankSources.length : generated.maxRank;
  const all: Modifier[] = [];
  for (let rank = 1; rank <= maxRank; rank++) {
    all.push(...getLoadoutModifiers(mode, [{ perkId, rank }]));
  }
  return all;
}

function hasOnslaughtPayoff(modifiers: readonly Modifier[]): boolean {
  return modifiers.some(
    (mod) =>
      mod.conditions.some(
        (cond): cond is Condition & { kind: 'stacks' } =>
          cond.kind === 'stacks' && cond.counter === 'onslaught',
      ) || mod.curve?.input === 'onslaughtStacks',
  );
}

function hasOnslaughtCap(modifiers: readonly Modifier[]): boolean {
  return modifiers.some((mod) => mod.bucket === 'onslaughtMaxStacks');
}

function hasOnslaughtReverse(modifiers: readonly Modifier[]): boolean {
  return modifiers.some((mod) => mod.bucket === 'onslaughtReverse');
}

function hasBulletStormPayoff(modifiers: readonly Modifier[]): boolean {
  return modifiers.some(
    (mod) =>
      mod.conditions.some(
        (cond): cond is Condition & { kind: 'stacks' } =>
          cond.kind === 'stacks' && cond.counter === 'bulletStorm',
      ) || mod.curve?.input === 'bulletStormStacks',
  );
}

function hasPositiveAmmoCapacity(modifiers: readonly Modifier[]): boolean {
  return modifiers.some((mod) => {
    if (mod.bucket !== 'ammoCapacity') return false;
    if (mod.curve) return mod.curveScale > 0;
    return mod.value > 0;
  });
}

function ammoCapacityScore(modifiers: readonly Modifier[]): number {
  let best = 0;
  for (const mod of modifiers) {
    if (mod.bucket !== 'ammoCapacity') continue;
    const v = mod.curve ? mod.curveScale : mod.value;
    if (v > best) best = v;
  }
  return best;
}

function discoverUnequippedPerkPieces(
  state: BuildState,
  mode: GameMode,
  loadoutCtx: StaticLoadoutContext,
  classify: (modifiers: readonly Modifier[]) => {
    payoff: boolean;
    contributor: boolean;
    reverseOnly: boolean;
  },
): Piece[] {
  const pieces: Piece[] = [];
  const { player } = state;
  const equipped = new Set([
    ...player.perks.map((p) => p.perkId),
    ...player.legendaryPerks.map((p) => p.perkId),
  ]);
  const registry = getPerks(mode) as Record<string, Perk>;

  for (const [perkId, perk] of Object.entries(registry)) {
    if (equipped.has(perkId)) continue;
    if (!perkHasEngineEffect(mode, perkId, loadoutCtx)) continue;
    const modifiers = unionPerkModifiers(mode, perkId);
    const roles = classify(modifiers);
    if (!roles.payoff && !roles.contributor && !roles.reverseOnly) continue;

    const isLegendary = legendaryPerkIds.has(perkId);
    const rank = perk.maxRank;
    const cost = isLegendary ? rank : perkCardCostAtRank(perk, rank);
    pieces.push({
      key: `perk:${perkId}`,
      displayName: perkLabel(perk.name, rank),
      actions: [perkAddAction(perkId, rank, isLegendary)],
      perkPointCost: cost,
      isPayoff: roles.payoff,
      kind: 'perk',
      perk,
      modifiers,
    });
  }
  return pieces;
}

function discoverUnequippedLegendaryPieces(
  state: BuildState,
  mode: GameMode,
  weapon: ReturnType<typeof getWeapons>[string],
  classify: (modifiers: readonly Modifier[]) => { payoff: boolean; contributor: boolean },
): Piece[] {
  const pieces: Piece[] = [];
  const { player } = state;
  if (!player.weapon) return pieces;

  const equippedOmods = new Set(
    player.weapon.legendaryEffects.filter((e) => e !== null && e !== undefined),
  );
  const slots = getLegendaryOmodSlots(mode, weapon);
  const byOmod = new Map<string, { name: string; modifiers: Modifier[]; slotIndices: number[] }>();

  for (let i = 0; i < slots.length; i++) {
    for (const option of slots[i].options) {
      if (equippedOmods.has(option.id)) continue;
      const entry = byOmod.get(option.id);
      if (entry) entry.slotIndices.push(i);
      else
        byOmod.set(option.id, {
          name: option.name,
          modifiers: option.modifiers,
          slotIndices: [i],
        });
    }
  }

  for (const [omodId, entry] of byOmod) {
    const roles = classify(entry.modifiers);
    if (!roles.payoff && !roles.contributor) continue;
    const slotIdx = firstEmptyLegendarySlot(player, entry.slotIndices);
    if (slotIdx === -1) continue;
    pieces.push({
      key: `omod:${omodId}`,
      displayName: legendaryEffectLabel(entry.name, slotIdx),
      actions: [{ type: 'weapon/legendary', slotIndex: slotIdx, omodId }],
      perkPointCost: 0,
      isPayoff: roles.payoff,
      kind: 'legendary',
      modifiers: entry.modifiers,
    });
  }
  return pieces;
}

function discoverMagazinePiece(
  state: BuildState,
  mode: GameMode,
  weapon: ReturnType<typeof getWeapons>[string],
): Piece | undefined {
  const { player } = state;
  if (!player.weapon) return undefined;

  let best: { slot: string; omodId: string; name: string; score: number } | undefined;
  for (const slot of getOmodSlots(mode, weapon)) {
    const equipped = player.weapon.mods[slot.slot] ?? null;
    for (const option of slot.options) {
      if (option.id === equipped) continue;
      const score = ammoCapacityScore(option.modifiers);
      if (score <= 0) continue;
      if (!best || score > best.score) {
        best = { slot: slot.slot, omodId: option.id, name: option.name, score };
      }
    }
  }
  if (!best) return undefined;
  return {
    key: `omod:${best.omodId}`,
    displayName: `Mod: ${best.name}`,
    actions: [{ type: 'weapon/mod', slot: best.slot, omodId: best.omodId }],
    perkPointCost: 0,
    isPayoff: false,
    kind: 'mod',
  };
}

function luckAllocationPiece(allocation: Record<SpecialKey, number>): Piece | undefined {
  const poolFree = allocationPoolFree(allocation);
  if (poolFree <= 0 || allocation.luck >= SPECIAL_POINTS_CAP) return undefined;
  const raise = Math.min(SPECIAL_POINTS_CAP - allocation.luck, poolFree);
  return {
    key: 'special:luck',
    displayName: `+${raise} LCK`,
    actions: [{ type: 'special/set', stat: 'luck', value: allocation.luck + raise }],
    perkPointCost: raise,
    isPayoff: false,
    kind: 'special',
  };
}

function tryAddPiece(
  piece: Piece,
  ctx: {
    actions: BuildAction[];
    pieceKeys: string[];
    displays: string[];
    totalCost: number;
    cardPoints: Record<SpecialKey, number>;
    cardBudget: PerkBudget;
    budgetPerStat: Record<SpecialKey, number>;
    allocation: Record<SpecialKey, number>;
    poolFree: number;
    legendarySlotsUsed: number;
    legendarySlotsMax: number;
  },
): boolean {
  if (piece.kind === 'perk' && piece.perk) {
    const perkId = piece.key.split(':')[1];
    const isLegendary = legendaryPerkIds.has(perkId);
    if (isLegendary) {
      if (ctx.legendarySlotsUsed >= ctx.legendarySlotsMax) return false;
    } else if (piece.perk.special) {
      const sk = SPECIAL_TO_KEY[piece.perk.special];
      // Direct deficit against the running spend/budget — an allocation raise
      // grows budgetPerStat (base SPECIAL up, min-15-capped), never cardPoints.
      const need = ctx.cardPoints[sk] + piece.perkPointCost - ctx.budgetPerStat[sk];
      if (need > 0) {
        if (ctx.poolFree < need || ctx.allocation[sk] + need > SPECIAL_POINTS_CAP) return false;
        const raisedBudget = Math.min(SPECIAL_POINTS_CAP, ctx.budgetPerStat[sk] + need);
        // Legendary-SPECIAL bonuses can pin the budget at the 15 cap; a base
        // raise that can't actually grow the budget doesn't fix the deficit.
        if (raisedBudget - ctx.budgetPerStat[sk] < need) return false;
        ctx.actions.push({ type: 'special/set', stat: sk, value: ctx.allocation[sk] + need });
        ctx.allocation[sk] += need;
        ctx.poolFree -= need;
        ctx.totalCost += need;
        ctx.budgetPerStat[sk] = raisedBudget;
      }
      ctx.cardPoints[sk] = (ctx.cardPoints[sk] ?? 0) + piece.perkPointCost;
    }
    ctx.actions.push(...piece.actions);
    if (isLegendary) ctx.legendarySlotsUsed++;
    ctx.totalCost += piece.perkPointCost;
  } else if (piece.kind === 'legendary') {
    ctx.actions.push(...piece.actions);
  } else if (piece.kind === 'mod') {
    ctx.actions.push(...piece.actions);
  } else if (piece.kind === 'special') {
    // The discovered raise assumed the full free pool; clamp to what earlier
    // pieces' allocation fixes left over instead of dropping the piece.
    const raise = Math.min(
      piece.perkPointCost,
      ctx.poolFree,
      SPECIAL_POINTS_CAP - ctx.allocation.luck,
    );
    if (raise <= 0) return false;
    ctx.actions.push({ type: 'special/set', stat: 'luck', value: ctx.allocation.luck + raise });
    ctx.allocation.luck += raise;
    ctx.poolFree -= raise;
    ctx.budgetPerStat.luck = Math.min(SPECIAL_POINTS_CAP, ctx.budgetPerStat.luck + raise);
    ctx.totalCost += raise;
    ctx.pieceKeys.push(piece.key);
    ctx.displays.push(`+${raise} LCK`);
    return true;
  }

  ctx.pieceKeys.push(piece.key);
  ctx.displays.push(piece.displayName);
  return true;
}

function assembleBundle(
  state: BuildState,
  mode: GameMode,
  mechanism: ComboMechanism,
  pieces: Piece[],
): SuggestionCandidate | undefined {
  const { player } = state;
  const allocation = { ...allocationOf(player) };
  const cardBudget = computePerkBudget(mode, player.perks, player.legendaryPerks, allocation);
  const cardPoints = { ...cardBudget.cardPoints };

  const payoffs = pieces.filter((p) => p.isPayoff);
  const contributors = pieces.filter((p) => !p.isPayoff);
  const ordered = [...payoffs, ...contributors];

  const ctx = {
    actions: [] as BuildAction[],
    pieceKeys: [] as string[],
    displays: [] as string[],
    totalCost: 0,
    cardPoints,
    cardBudget,
    budgetPerStat: { ...cardBudget.budgetPerStat },
    allocation,
    poolFree: allocationPoolFree(allocation),
    legendarySlotsUsed: player.legendaryPerks.length,
    legendarySlotsMax: LEGENDARY_SLOTS,
  };

  for (const piece of ordered) {
    tryAddPiece(piece, ctx);
  }

  const payoffCount = ctx.pieceKeys.filter((k) => pieces.find((p) => p.key === k)?.isPayoff).length;
  if (payoffCount < 1 || ctx.pieceKeys.length < 2) return undefined;

  const id = `combo:${mechanism.id}`;
  return {
    id,
    action: ctx.actions,
    label: mechanism.displayName,
    group: 'combo',
    family: id,
    cost: ctx.totalCost,
    detail: ctx.displays.join(' + '),
    comboPieces: ctx.pieceKeys,
  };
}

function onslaughtClassify(modifiers: readonly Modifier[]) {
  const payoff = hasOnslaughtPayoff(modifiers);
  const cap = hasOnslaughtCap(modifiers);
  const reverse = hasOnslaughtReverse(modifiers);
  return {
    payoff,
    contributor: cap || reverse,
    reverseOnly: reverse && !payoff && !cap,
  };
}

function critClassify(modifiers: readonly Modifier[]) {
  const payoff = modifiers.some((m) => CRIT_PAYOFF_BUCKETS.has(m.bucket));
  const contributor = modifiers.some((m) => CRIT_CONTRIBUTOR_BUCKETS.has(m.bucket));
  return { payoff, contributor, reverseOnly: false };
}

function bulletStormClassify(modifiers: readonly Modifier[]) {
  const payoff = hasBulletStormPayoff(modifiers);
  const contributor = hasPositiveAmmoCapacity(modifiers);
  return { payoff, contributor, reverseOnly: false };
}

export function enumerateCombos(
  state: BuildState,
  mode: GameMode,
  metric: ScenarioKey = 'vats',
): SuggestionCandidate[] {
  const out: SuggestionCandidate[] = [];
  const { player } = state;
  const weapon = player.weapon ? getWeapons(mode)[player.weapon.weaponId] : undefined;
  if (!weapon || !player.weapon) return out;

  const loadoutCtx = buildStaticLoadoutContext(mode, player, weapon);
  const allocation = allocationOf(player);

  for (const mechanism of COMBO_MECHANISMS) {
    if (mechanism.metric && mechanism.metric !== metric) continue;

    let pieces: Piece[] = [];

    if (mechanism.id === 'onslaught-forward' || mechanism.id === 'onslaught-reverse') {
      const allPerk = discoverUnequippedPerkPieces(state, mode, loadoutCtx, onslaughtClassify);
      const allLeg = discoverUnequippedLegendaryPieces(state, mode, weapon, (mods) => {
        const c = onslaughtClassify(mods);
        return { payoff: c.payoff, contributor: c.contributor };
      });
      const all = [...allPerk, ...allLeg];
      if (mechanism.id === 'onslaught-forward') {
        // A reverse enabler flips the whole mechanism to reverse mode in-game
        // (Gunslinger Master also carries a cap bucket, but equipping it is
        // never a *forward* build) — exclude any reverse-bucket piece.
        pieces = all.filter((p) => !hasOnslaughtReverse(p.modifiers ?? []));
      } else {
        if (!all.some((p) => hasOnslaughtReverse(p.modifiers ?? []))) continue;
        pieces = all;
      }
    } else if (mechanism.id === 'crit-cadence') {
      pieces = [
        ...discoverUnequippedPerkPieces(state, mode, loadoutCtx, critClassify),
        ...discoverUnequippedLegendaryPieces(state, mode, weapon, critClassify),
      ];
      const luckPiece = luckAllocationPiece(allocation);
      if (luckPiece) pieces.push(luckPiece);
    } else if (mechanism.id === 'bullet-storm') {
      pieces = [
        ...discoverUnequippedPerkPieces(state, mode, loadoutCtx, bulletStormClassify),
        ...discoverUnequippedLegendaryPieces(state, mode, weapon, bulletStormClassify),
      ];
      const mag = discoverMagazinePiece(state, mode, weapon);
      if (mag) pieces.push(mag);
    }

    const bundle = assembleBundle(state, mode, mechanism, pieces);
    if (bundle) out.push(bundle);
  }

  return out;
}
