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

export function resolveTargetLevelBounds(npc: GeneratedNpc | undefined): { min: number; max: number } {
  return { min: npc?.levelMinGlobal ?? FALLBACK_LEVEL_MIN, max: npc?.levelMaxGlobal ?? FALLBACK_LEVEL_MAX };
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
export function resolveTargetLevel(npc: GeneratedNpc | undefined, storedLevel: number | null | undefined): number {
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
 * `epicRank`: OPTIONAL, unused by any current caller — see
 * `src/data/overrides/epic-creature.ts` for why (no UI control ships this
 * phase; the parameter exists so one can slot in later without another
 * data-layer change). When passed AND the npc's `epicAllowed` is true, scales
 * `hp` by the rank's `healthMult`; a rank passed against an `epicAllowed:
 * false` npc is silently ignored (defensive — that npc is structurally
 * excluded from ever rolling epic in-game).
 */
export function getEnemyDefenses(
  mode: GameMode,
  raceId: string | null | undefined,
  level: number,
  epicRank?: EpicCreatureRank
): EnemyDefenses | null {
  if (!raceId) return null;
  const npc = getNpc(mode, raceId);
  if (!npc) return null;

  const baseHp = npc.healthCurveTier != null ? getCreatureHealth(mode, npc.healthCurveTier, level) : npc.healthFlatValue;
  const hp = epicRank && npc.epicAllowed ? baseHp * EPIC_CREATURE_RANK_MULTS[epicRank].healthMult : baseHp;

  const resists: EnemyDefenses['resists'] = {};
  for (const r of npc.resists) {
    resists[r.damageType] = r.curveTier != null ? getCreatureResist(mode, r.curveTier, level) : r.flatValue;
  }

  return { hp, resists };
}
