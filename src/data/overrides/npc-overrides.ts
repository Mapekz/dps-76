import type { GeneratedNpc } from '@/types/generated';

/**
 * Hand-maintained corrections layered over ESM-extracted NPC stats
 * (scripts/extract/extract-npcs.ts → src/data/live/generated/npcs.json).
 * This file survives regeneration (`bun run extract`) — put anything here the
 * ESM can't express or gets wrong (e.g. a curated row whose representative
 * NPC_ template choice turns out to be a poor stand-in, or a stat that needs
 * an in-game-measured correction — see docs/assumptions.md and
 * docs/assumptions.md "Creature stat curves & NPC extraction", e.g. the open Scorchbeast Queen HP
 * discrepancy).
 *
 * Empty today — no corrections have been needed yet (2026-07-18: the
 * curated-target → representative-NPC_ resolution covered all 83 rows with
 * no unresolved gaps on the 20260710 dump).
 *
 * Every entry should carry a source comment (in-game test, wiki, community).
 * Keyed by GeneratedNpc.id (= the curated target's edid, scripts/extract/
 * curated-targets.ts) — REPLACES the extracted record wholesale (dataset.ts
 * applies it as a full-record override, not a field-level patch), following
 * the applyModifierOverride convention used elsewhere in overrides/.
 */
export const npcOverrides: Readonly<Record<string, GeneratedNpc>> = {};
