import type { GameMode, Perk } from '@/types';
import type {
  Bucket,
  Condition,
  CurveInput,
  Modifier,
  StackCounter,
  StaticLoadoutContext,
} from '@/types/modifiers';
import { getPerks, getWeapons } from '@/data';
import { getLegendaryOmodSlots } from '@/data/omods';
import { computePerkBudget } from '@/data/perk-budget';
import { getGeneratedPerk, perkHasEngineEffect } from '@/data/perk-modifiers';
import { legendaryPerkIds } from '@/lib/nukes-dragons';
import { perkCardCostAtRank, type PerkBudget } from '@/lib/player-stats';
import { Special } from '@/data/special';
import {
  LEGENDARY_PERK_SLOTS as LEGENDARY_SLOTS,
  type BuildState,
  type SpecialKey,
} from '@/state/build-reducer';
import type { SuggestionBudget, SuggestionCandidate } from './types';
import { buildStaticLoadoutContext } from './loadout-context';
import { legendaryEffectLabel, perkLabel } from './labels';

/**
 * Combo Suggestions — mechanism-derived pair candidates that open synergy
 * doors the greedy single-step ladder cannot (e.g., Onslaught pairs where
 * no single piece beats alternatives, but a pair does via stacking).
 * See docs/adr/0006-combo-suggestions-are-mechanism-derived-pairs.md.
 * Evaluation cost stays cheap: ~≤100 extra evals (~1 ms on a ~25 ms sweep) —
 * scope is bounded by mechanism (Onslaught, Bullet Storm) and the combo set
 * is compact, perks and legendary effects pairing once.
 */

const SPECIAL_TO_KEY: Record<Special, SpecialKey> = {
  [Special.Strength]: 'strength',
  [Special.Perception]: 'perception',
  [Special.Endurance]: 'endurance',
  [Special.Charisma]: 'charisma',
  [Special.Intelligence]: 'intelligence',
  [Special.Agility]: 'agility',
  [Special.Luck]: 'luck',
};

const LEGAL: SuggestionBudget = { legal: true };

/**
 * A stack mechanism descriptor — the game-data-level configuration that
 * defines how a stack synergy works (counter name, cap bucket, enabler bucket,
 * curve input). Future stack mechanics (Bullet Storm, Concentrated Fire, etc.)
 * are added here, never as hand-curated pair lists.
 */
export interface StackMechanism {
  /** The counter this mechanism tracks (onslaught, bulletStorm, etc.). */
  counter: StackCounter;
  /** Bucket that contributes to the cap (e.g., onslaughtMaxStacks). */
  capBucket: Bucket;
  /** Bucket that enables reverse stacking (e.g., onslaughtReverse). */
  enablerBucket: Bucket;
  /** Curve input for curve-valued payoffs (e.g., onslaughtStacks). */
  curveInput: CurveInput;
}

/**
 * Stack mechanism registry — currently just Onslaught, but extensible.
 * Each entry describes one stack synergy's source signatures.
 */
export const STACK_MECHANISMS: readonly StackMechanism[] = [
  {
    counter: 'onslaught',
    capBucket: 'onslaughtMaxStacks',
    enablerBucket: 'onslaughtReverse',
    curveInput: 'onslaughtStacks',
  },
];

/**
 * A discovered piece (perk or legendary effect option) that participates
 * in a stack mechanism — either as a payoff (reads the counter/curve) or
 * a contributor (raises the cap/enables reverse).
 */
interface Piece {
  /** Unique key: perk:<perkId> or omod:<omodId>. */
  key: string;
  /** Display name for this piece. */
  name: string;
  /** Whether this piece has a payoff (reads stacks or curve). */
  hasPayoff: boolean;
  /** Piece kind: perk or legendary effect option. */
  kind: 'perk' | 'legendary';
  /** For perks: the max rank. For legendary: undefined. */
  maxRank?: number;
  /** For legendary options: the slot indices that offer this omod. */
  slotIndices?: number[];
  /** For legendary options: the omod object itself. */
  omodId?: string;
}

/**
 * Check if any modifier in the array has a payoff condition/curve for
 * the given mechanism.
 */
function hasPayoff(modifiers: readonly Modifier[], mechanism: StackMechanism): boolean {
  return modifiers.some((mod) => {
    // Check for stack counter condition
    if (
      mod.conditions.some(
        (cond): cond is Condition & { kind: 'stacks' } =>
          cond.kind === 'stacks' && cond.counter === mechanism.counter,
      )
    ) {
      return true;
    }
    // Check for curve-valued modifier with matching curve input
    if (mod.curve && mod.curve.input === mechanism.curveInput) {
      return true;
    }
    return false;
  });
}

/**
 * Check if any modifier in the array contributes to the mechanism
 * (cap builder or enabler).
 */
function isContributor(modifiers: readonly Modifier[], mechanism: StackMechanism): boolean {
  return modifiers.some(
    (mod) => mod.bucket === mechanism.capBucket || mod.bucket === mechanism.enablerBucket,
  );
}

/**
 * Discover all perk and legendary pieces participating in a mechanism
 * within the current build state (excluding already-equipped pieces).
 */
function discoverPieces(
  state: BuildState,
  mode: GameMode,
  weapon: ReturnType<typeof getWeapons>[string],
  mechanism: StackMechanism,
  loadoutCtx: StaticLoadoutContext,
): Piece[] {
  const pieces: Piece[] = [];
  const { player } = state;

  // Exclude pieces already equipped
  const equippedPerkIds = new Set(player.perks.map((p) => p.perkId));
  const equippedLegendaryPerkIds = new Set(player.legendaryPerks.map((p) => p.perkId));
  const equippedLegendaryOmodIds = new Set(
    player.weapon?.legendaryEffects.filter((e) => e !== null && e !== undefined) ?? [],
  );

  // Discover perk pieces
  const perks = getPerks(mode) as Record<string, Perk>;
  for (const [perkId, perk] of Object.entries(perks)) {
    if (!perkHasEngineEffect(mode, perkId, loadoutCtx)) continue;
    if (equippedPerkIds.has(perkId) || equippedLegendaryPerkIds.has(perkId)) continue;

    const generated = getGeneratedPerk(mode, perkId);
    if (!generated) continue;

    // Union modifiers across all ranks
    const allModifiers: Modifier[] = [];
    for (const rank of generated.ranks) {
      allModifiers.push(...rank.modifiers);
    }

    if (hasPayoff(allModifiers, mechanism) || isContributor(allModifiers, mechanism)) {
      pieces.push({
        key: `perk:${perkId}`,
        name: perk.name,
        hasPayoff: hasPayoff(allModifiers, mechanism),
        kind: 'perk',
        maxRank: perk.maxRank,
      });
    }
  }

  // Discover legendary effect pieces
  if (player.weapon) {
    const legendarySlots = getLegendaryOmodSlots(mode, weapon);
    const omodIdToSlotIndices = new Map<string, number[]>();

    // Map each omod to the slot indices that offer it
    for (let i = 0; i < legendarySlots.length; i++) {
      const slot = legendarySlots[i];
      for (const option of slot.options) {
        if (!omodIdToSlotIndices.has(option.id)) {
          omodIdToSlotIndices.set(option.id, []);
        }
        omodIdToSlotIndices.get(option.id)!.push(i);
      }
    }

    // Dedupe by omod id and check for payoff/contribution
    for (const [omodId, slotIndices] of omodIdToSlotIndices.entries()) {
      if (equippedLegendaryOmodIds.has(omodId)) continue;

      // Get the omod object from the first offering slot
      const slot = legendarySlots[slotIndices[0]];
      const option = slot.options.find((o) => o.id === omodId);
      if (!option) continue;

      if (hasPayoff(option.modifiers, mechanism) || isContributor(option.modifiers, mechanism)) {
        pieces.push({
          key: `omod:${omodId}`,
          name: option.name,
          hasPayoff: hasPayoff(option.modifiers, mechanism),
          kind: 'legendary',
          slotIndices,
          omodId,
        });
      }
    }
  }

  return pieces;
}

/**
 * Compute the perk-budget legality for a set of perk additions,
 * aggregating SPECIAL costs before checking the budget.
 */
function computeMultiPerkBudget(
  budget: PerkBudget,
  perks: Perk[],
  extraCostsPerPerk: number[],
): SuggestionBudget {
  // Aggregate costs per SPECIAL
  const costBySpecial: Record<SpecialKey, number> = {
    strength: 0,
    perception: 0,
    endurance: 0,
    charisma: 0,
    intelligence: 0,
    agility: 0,
    luck: 0,
  };

  for (let i = 0; i < perks.length; i++) {
    const perk = perks[i];
    const extraCost = extraCostsPerPerk[i];
    if (perk.special) {
      const key = SPECIAL_TO_KEY[perk.special];
      costBySpecial[key] += extraCost;
    }
  }

  // Find the first (largest) deficit
  let maxDeficit = 0;
  let deficitSpecial: SpecialKey | undefined;
  for (const [special, cost] of Object.entries(costBySpecial) as Array<[SpecialKey, number]>) {
    const deficit = budget.cardPoints[special] + cost - budget.budgetPerStat[special];
    if (deficit > maxDeficit) {
      maxDeficit = deficit;
      deficitSpecial = special;
    }
  }

  return maxDeficit > 0 ? { legal: false, special: deficitSpecial, deficit: maxDeficit } : LEGAL;
}

/**
 * Enumerate combo pair candidates for the current build.
 * Returns [] if no weapon is selected or the weapon is unknown.
 */
export function enumerateCombos(state: BuildState, mode: GameMode): SuggestionCandidate[] {
  const out: SuggestionCandidate[] = [];
  const { player } = state;

  const weapon = player.weapon ? getWeapons(mode)[player.weapon.weaponId] : undefined;
  if (!weapon || !player.weapon) return out;

  const allocation = Object.fromEntries(
    Object.values(SPECIAL_TO_KEY).map((key) => [key, player.conditions[key]]),
  ) as Record<SpecialKey, number>;
  const cardBudget = computePerkBudget(mode, player.perks, player.legendaryPerks, allocation);
  const loadoutCtx = buildStaticLoadoutContext(mode, player, weapon);

  for (const mechanism of STACK_MECHANISMS) {
    const pieces = discoverPieces(state, mode, weapon, mechanism, loadoutCtx);

    // Generate unordered pairs where at least one has payoff
    for (let i = 0; i < pieces.length; i++) {
      for (let j = i + 1; j < pieces.length; j++) {
        const pieceA = pieces[i];
        const pieceB = pieces[j];

        // At least one must have payoff
        if (!pieceA.hasPayoff && !pieceB.hasPayoff) continue;

        // Determine placement variants
        const familyKey = `combo:${[pieceA.key, pieceB.key].sort().join('+')}`;
        const variants = buildPlacementVariants(state, mode, pieceA, pieceB, familyKey, cardBudget);

        out.push(...variants);
      }
    }
  }

  return out;
}

/**
 * Build placement variants for a piece pair, handling both perk and legendary
 * placements with proper slot-filling logic.
 */
function buildPlacementVariants(
  state: BuildState,
  mode: GameMode,
  pieceA: Piece,
  pieceB: Piece,
  family: string,
  cardBudget: PerkBudget,
): SuggestionCandidate[] {
  const variants: SuggestionCandidate[] = [];
  const { player } = state;

  // Both are perks
  if (pieceA.kind === 'perk' && pieceB.kind === 'perk') {
    const perkA = (getPerks(mode) as Record<string, Perk>)[pieceA.key.split(':')[1]];
    const perkB = (getPerks(mode) as Record<string, Perk>)[pieceB.key.split(':')[1]];
    const isLegendaryA = legendaryPerkIds.has(pieceA.key.split(':')[1]);
    const isLegendaryB = legendaryPerkIds.has(pieceB.key.split(':')[1]);

    const rankA = pieceA.maxRank!;
    const rankB = pieceB.maxRank!;
    const costA = isLegendaryA ? rankA : perkCardCostAtRank(perkA, rankA);
    const costB = isLegendaryB ? rankB : perkCardCostAtRank(perkB, rankB);

    // Check legendary slot budget
    const addedLegendaryPerks = (isLegendaryA ? 1 : 0) + (isLegendaryB ? 1 : 0);
    const hasLegendaryRoom = player.legendaryPerks.length + addedLegendaryPerks <= LEGENDARY_SLOTS;

    let budget = LEGAL;
    if (!isLegendaryA && !isLegendaryB) {
      // Both are normal perks — check SPECIAL budget for both
      budget = computeMultiPerkBudget(
        cardBudget,
        [perkA, perkB],
        [perkCardCostAtRank(perkA, rankA), perkCardCostAtRank(perkB, rankB)],
      );
    } else if (isLegendaryA && isLegendaryB) {
      // Both are legendary perks — check slot budget
      budget = hasLegendaryRoom ? LEGAL : { legal: false, deficit: 1 };
    } else {
      // One legendary, one normal — check slot + SPECIAL budget for the normal one
      const normalPerk = isLegendaryA ? perkB : perkA;
      const normalCost = isLegendaryA ? costB : costA;
      budget = hasLegendaryRoom
        ? computeMultiPerkBudget(cardBudget, [normalPerk], [normalCost])
        : { legal: false, deficit: 1 };
    }

    const labelA = perkLabel(perkA.name, rankA);
    const labelB = perkLabel(perkB.name, rankB);

    variants.push({
      id: `${family}:perk+perk`,
      action: [
        {
          type: 'perk/add',
          perkId: pieceA.key.split(':')[1],
          rank: rankA,
          legendary: isLegendaryA,
        },
        {
          type: 'perk/add',
          perkId: pieceB.key.split(':')[1],
          rank: rankB,
          legendary: isLegendaryB,
        },
      ],
      label: `${labelA} + ${labelB}`,
      group: 'combo',
      budget,
      family,
      cost: costA + costB,
      comboPieces: [pieceA.key, pieceB.key],
    });

    return variants;
  }

  // One perk, one legendary
  if (
    (pieceA.kind === 'perk' && pieceB.kind === 'legendary') ||
    (pieceA.kind === 'legendary' && pieceB.kind === 'perk')
  ) {
    const perkPiece = pieceA.kind === 'perk' ? pieceA : pieceB;
    const legendaryPiece = pieceA.kind === 'legendary' ? pieceA : pieceB;

    const perkId = perkPiece.key.split(':')[1];
    const perk = (getPerks(mode) as Record<string, Perk>)[perkId];
    const isLegendaryPerk = legendaryPerkIds.has(perkId);
    const perkRank = perkPiece.maxRank!;
    const perkCost = isLegendaryPerk ? perkRank : perkCardCostAtRank(perk, perkRank);

    // Slot room for a legendary PERK side (weapon star slots are separate).
    const hasSlotRoom = player.legendaryPerks.length < LEGENDARY_SLOTS;

    const perkSideBudget: SuggestionBudget = isLegendaryPerk
      ? hasSlotRoom
        ? LEGAL
        : { legal: false, deficit: 1 }
      : computeMultiPerkBudget(cardBudget, [perk], [perkCost]);

    // Find first empty legendary slot that offers the omod. Untouched slots
    // read `undefined` (legendaryEffects starts as []), cleared ones `null` —
    // both are empty, so use loose comparison.
    let emptySlotIndex = -1;
    if (legendaryPiece.slotIndices) {
      for (const slotIdx of legendaryPiece.slotIndices) {
        if (player.weapon?.legendaryEffects[slotIdx] == null) {
          emptySlotIndex = slotIdx;
          break;
        }
      }
    }

    const perkSideLabel = perkLabel(perk.name, perkRank);

    if (emptySlotIndex !== -1) {
      // Can place in empty slot
      variants.push({
        id: `${family}:perk+omod:${emptySlotIndex}`,
        action: [
          {
            type: 'perk/add',
            perkId,
            rank: perkRank,
            legendary: isLegendaryPerk,
          },
          {
            type: 'weapon/legendary',
            slotIndex: emptySlotIndex,
            omodId: legendaryPiece.omodId!,
          },
        ],
        label: `${perkSideLabel} + ${legendaryEffectLabel(legendaryPiece.name, emptySlotIndex)}`,
        group: 'combo',
        budget: perkSideBudget,
        family,
        cost: perkCost,
        comboPieces: [perkPiece.key, legendaryPiece.key],
      });
    } else if (legendaryPiece.slotIndices) {
      // No empty slot — generate replace variants for each offering slot
      for (const slotIdx of legendaryPiece.slotIndices) {
        if (player.weapon?.legendaryEffects[slotIdx] != null) {
          variants.push({
            id: `${family}:perk+omod:${slotIdx}:replace`,
            action: [
              {
                type: 'perk/add',
                perkId,
                rank: perkRank,
                legendary: isLegendaryPerk,
              },
              {
                type: 'weapon/legendary',
                slotIndex: slotIdx,
                omodId: legendaryPiece.omodId!,
              },
            ],
            label: `${perkSideLabel} + ${legendaryEffectLabel(legendaryPiece.name, slotIdx)}`,
            group: 'combo',
            budget: perkSideBudget,
            family,
            cost: perkCost,
            comboPieces: [perkPiece.key, legendaryPiece.key],
          });
        }
      }
    }

    return variants;
  }

  // Both legendary
  if (pieceA.kind === 'legendary' && pieceB.kind === 'legendary') {
    // Find first empty slot for each
    let emptyA = -1;
    let emptyB = -1;

    if (pieceA.slotIndices) {
      for (const idx of pieceA.slotIndices) {
        if (player.weapon?.legendaryEffects[idx] == null) {
          emptyA = idx;
          break;
        }
      }
    }

    // For pieceB, find an empty slot different from emptyA
    if (pieceB.slotIndices) {
      for (const idx of pieceB.slotIndices) {
        if (player.weapon?.legendaryEffects[idx] == null && idx !== emptyA) {
          emptyB = idx;
          break;
        }
      }
    }

    // Both fit in empty slots
    if (emptyA !== -1 && emptyB !== -1) {
      variants.push({
        id: `${family}:omod+omod:${emptyA}+${emptyB}`,
        action: [
          {
            type: 'weapon/legendary',
            slotIndex: emptyA,
            omodId: pieceA.omodId!,
          },
          {
            type: 'weapon/legendary',
            slotIndex: emptyB,
            omodId: pieceB.omodId!,
          },
        ],
        label: `${legendaryEffectLabel(pieceA.name, emptyA)} + ${legendaryEffectLabel(pieceB.name, emptyB)}`,
        group: 'combo',
        budget: LEGAL,
        family,
        cost: 0,
        comboPieces: [pieceA.key, pieceB.key],
      });
    } else if (emptyA !== -1 && !pieceB.slotIndices) {
      // pieceA fits in empty, pieceB has no slots (shouldn't happen)
    } else if (emptyA === -1 && emptyB !== -1) {
      // Only pieceB fits in empty — generate replace variants for pieceA
      if (pieceA.slotIndices) {
        for (const slotIdx of pieceA.slotIndices) {
          if (player.weapon?.legendaryEffects[slotIdx] != null && slotIdx !== emptyB) {
            variants.push({
              id: `${family}:omod+omod:${slotIdx}replace+${emptyB}`,
              action: [
                {
                  type: 'weapon/legendary',
                  slotIndex: slotIdx,
                  omodId: pieceA.omodId!,
                },
                {
                  type: 'weapon/legendary',
                  slotIndex: emptyB,
                  omodId: pieceB.omodId!,
                },
              ],
              label: `${legendaryEffectLabel(pieceA.name, slotIdx)} + ${legendaryEffectLabel(pieceB.name, emptyB)}`,
              group: 'combo',
              budget: LEGAL,
              family,
              cost: 0,
              comboPieces: [pieceA.key, pieceB.key],
            });
          }
        }
      }
    } else {
      // No empty slots at all — generate replace variants
      if (pieceA.slotIndices && pieceB.slotIndices) {
        for (const slotA of pieceA.slotIndices) {
          if (player.weapon?.legendaryEffects[slotA] != null) {
            for (const slotB of pieceB.slotIndices) {
              if (player.weapon?.legendaryEffects[slotB] != null && slotA !== slotB) {
                variants.push({
                  id: `${family}:omod+omod:${slotA}+${slotB}:replace`,
                  action: [
                    {
                      type: 'weapon/legendary',
                      slotIndex: slotA,
                      omodId: pieceA.omodId!,
                    },
                    {
                      type: 'weapon/legendary',
                      slotIndex: slotB,
                      omodId: pieceB.omodId!,
                    },
                  ],
                  label: `${legendaryEffectLabel(pieceA.name, slotA)} + ${legendaryEffectLabel(pieceB.name, slotB)}`,
                  group: 'combo',
                  budget: LEGAL,
                  family,
                  cost: 0,
                  comboPieces: [pieceA.key, pieceB.key],
                });
              }
            }
          }
        }
      }
    }

    return variants;
  }

  return variants;
}
