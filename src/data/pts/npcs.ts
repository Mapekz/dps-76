import type { GeneratedNpc } from '@/types/generated';
import generatedNpcs from './generated/npcs.json';

/**
 * NPC stats — ESM-extracted (src/data/pts/generated/npcs.json,
 * scripts/extract/extract-npcs.ts). This is the raw typed read; hand-
 * maintained corrections (src/data/overrides/npc-overrides.ts) are layered
 * on top in src/data/dataset.ts (the merge chokepoint), not here — mirrors
 * pts/weapons.ts's `generatedWeaponsRaw` export (consumed by dataset.ts's
 * overlay-key reviewer, `getUnresolvedOverrideKeys`).
 */
export const generatedNpcsRaw = generatedNpcs as GeneratedNpc[];
