import type { GameMode } from '@/types';
import type { GeneratedNpc } from '@/types/generated';
import { getNpc } from '@/data/npcs';
import { getCreatureHealth, getCreatureResist } from '@/lib/creature-curves';
import { EPIC_CREATURE_RANK_MULTS, type EpicCreatureRank } from '@/data/overrides/epic-creature';
import type { EnemyDefenses } from '@/lib/engine/mitigation';

/**
 * Derived enemy HP/resist math (Phase 2 — Enemy defenses), sitting between
 * `src/data/npcs.ts` (raw per-race stats + curve-tier refs, npc-overrides
 * already applied via `getDataset`) and `src/lib/engine/mitigation.ts` (the
 * pure formula that consumes the result). Mirrors the project's "data
 * accessors in src/data, derived math in src/lib" layering.
 *
 * Fallback level bounds (1-100) apply when a race has no Renorm window
 * (`levelMinGlobal`/`levelMaxGlobal` both null — a fixed-level unique with no
 * scaling at all): 1-100 covers the game's full player-level range, a
 * reasonable "no constraint" default (ASSUMPTION — no ESM signal pins this
 * specific fallback pair; docs/assumptions.md).
 */
const FALLBACK_LEVEL_MIN = 1;
const FALLBACK_LEVEL_MAX = 100;

export function resolveTargetLevelBounds(npc: GeneratedNpc | undefined): {
  min: number;
  max: number;
} {
  return {
    min: npc?.levelMinGlobal ?? FALLBACK_LEVEL_MIN,
    max: npc?.levelMaxGlobal ?? FALLBACK_LEVEL_MAX,
  };
}

/**
 * The effective level to evaluate the creature curves at: the stored
 * selection clamped to the race's window, or — unset — the window's MAX
 * (default = max, an "endgame assumption": a DPS calculator's typical use
 * case is sizing a build against the toughest version of a target a player
 * will actually meet; docs/assumptions.md "Creature stat curves & NPC
 * extraction"). Shared by `getEnemyDefenses` and the level slider
 * (`TargetSection.tsx`) so both read the identical default/clamp.
 */
export function resolveTargetLevel(
  npc: GeneratedNpc | undefined,
  storedLevel: number | null | undefined,
): number {
  const { min, max } = resolveTargetLevelBounds(npc);
  if (storedLevel == null) return max;
  return Math.max(min, Math.min(storedLevel, max));
}

/**
 * HP + per-damage-type resists for a curated target at a given (already
 * bounds-resolved — see `resolveTargetLevel`) effective level. `curveX =
 * effectiveLevel` directly (Phase 2 spike, `creature-curves.ts` header) —
 * this function does no additional clamping of `level` itself, trusting the
 * caller already ran it through `resolveTargetLevel`. Returns `null` when
 * `raceId` is unset or doesn't join to a curated NPC row (no target
 * selected, or a race with no stats-bearing template — see npcs.ts).
 *
 * Epic HP mult (Phase A — epic boss HP mult, 2026-07-19; user-toggle layer
 * added 2026-07-21): a forced `npc.epicRank` (ESM-proven fixed rank on its
 * summon quest — `scripts/extract/extract-npcs.ts`) always wins when
 * present — that's exactly Scorchbeast Queen and Storm Goliath (both rank
 * 3, ×3.2) today. Otherwise, when the race is `epicAllowed`, the caller's
 * `userEpicRank` (the Target section's ★ toggle, `EnemyConditions.epicRank`)
 * applies instead — modeling the runtime chance-rolled Epic Levels upgrade
 * the ESM can't statically confirm for any given encounter. A race that
 * isn't `epicAllowed` never scales, regardless of `userEpicRank` (the UI
 * also hides the toggle in that case, but this function doesn't trust the
 * caller to have done so). DR/ER are never scaled — the epic-rank system
 * does not affect resists.
 */
export function getEnemyDefenses(
  mode: GameMode,
  raceId: string | null | undefined,
  level: number,
  userEpicRank?: number,
): EnemyDefenses | null {
  if (!raceId) return null;
  const npc = getNpc(mode, raceId);
  if (!npc) return null;

  const baseHp =
    npc.healthCurveTier != null
      ? getCreatureHealth(mode, npc.healthCurveTier, level)
      : npc.healthFlatValue;
  // Forced rank (SBQ/Storm) always wins; otherwise fall back to the user's
  // toggle when the race is epic-eligible. Fail open on an out-of-table rank
  // (defensive — every ESM-extracted/user-facing rank is ≤3) rather than throwing.
  const effectiveRank = npc.epicRank ?? (userEpicRank || undefined);
  const rankMult =
    effectiveRank != null ? EPIC_CREATURE_RANK_MULTS[effectiveRank as EpicCreatureRank] : undefined;
  const hp = rankMult && npc.epicAllowed ? baseHp * rankMult.healthMult : baseHp;

  const resists: EnemyDefenses['resists'] = {};
  for (const r of npc.resists) {
    resists[r.damageType] =
      r.curveTier != null ? getCreatureResist(mode, r.curveTier, level) : r.flatValue;
  }

  return { hp, resists };
}
