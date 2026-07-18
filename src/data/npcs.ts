import type { GameMode } from '@/types';
import type { GeneratedNpc } from '@/types/generated';
import { getDataset } from './dataset';

/**
 * Curated-enemy NPC stats (Health + resists + level-scaling window,
 * npcs.json — scripts/extract/extract-npcs.ts). Joins
 * GeneratedBodyPartRace (src/data/bodyparts.ts) by `id`. Curve-tier values
 * on each row resolve through src/lib/creature-curves.ts
 * (getCreatureHealth/getCreatureResist), not here — this module is data
 * lookup only.
 */

export function getNpcs(mode: GameMode): GeneratedNpc[] {
  return getDataset(mode).npcs;
}

export function getNpc(mode: GameMode, id: string): GeneratedNpc | undefined {
  return getDataset(mode).npcs.find(n => n.id === id);
}
