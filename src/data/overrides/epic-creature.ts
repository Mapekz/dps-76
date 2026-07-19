/**
 * "Epic Levels" rank → {healthMult, outgoingDamageMult}, hand-authored from
 * QUST `SQ_EpicCreatures` (0x0001C339) Virtual Machine Adapter property
 * `EpicRankData` (esm-walk, coordinator follow-up 2026-07-18 —
 * `esm -p get SQ_EpicCreatures --json`). This is a Papyrus struct-array
 * Property on a singleton quest, not a per-record extractable field — same
 * "script-computed value, hand-transcribed with a source comment" shape as
 * `legendary-values.ts`, not a generic extractor mapping.
 *
 * Eligibility (does a given actor even qualify for the random epic-rank
 * roll) is a REAL per-NPC extracted field instead —
 * `GeneratedNpc.epicAllowed` (scripts/extract/extract-npcs.ts, checked
 * against FLST `EpicCreatureDisallowedKeywords` 0x004FC5B7). For MOST
 * creatures, whether a given encounter actually rolls epic (and at what
 * rank) is a runtime chance roll (region/level-gated Papyrus script) with NO
 * static ESM signal — `epicAllowed: true` only means "not structurally
 * excluded". Three curated bosses are the exception: their summon quest's
 * Virtual Machine Adapter FORCES a specific rank at spawn (100% chance, not
 * a roll) — see `GeneratedNpc.epicRank`'s doc comment and
 * `BOSS_EPIC_RANK_QUESTS` (extract-npcs.ts) for the two ESM-proven VMAD
 * shapes and exactly which bosses qualify (SBQ, Storm Goliath — NOT Earle,
 * despite being a same-family curated boss; its quest was checked and
 * proves no forced rank). See docs/assumptions.md "Creature stat curves &
 * NPC extraction" for how this bears on the open Scorchbeast Queen HP
 * question (short answer: applying the now-proven rank 3 WIDENS the ~10×
 * gap to ~24–41×, not narrows it).
 *
 * Wired into HP (Phase A — epic boss HP mult, 2026-07-19): `src/lib/
 * enemy-defenses.ts`'s `getEnemyDefenses` reads `GeneratedNpc.epicRank`
 * (ESM-proven fixed rank on a curated boss's summon quest —
 * `scripts/extract/extract-npcs.ts`'s `BOSS_EPIC_RANK_QUESTS`) directly —
 * fully data-driven, no caller-supplied rank. Today that's exactly
 * Scorchbeast Queen and Storm Goliath (both rank 3); every other race,
 * including Earle/Wendigo Colossus (checked — its summon quest proves no
 * rank), has no `epicRank` and reads plain curve HP. No manual rank picker
 * ships this phase — extracted ranks only. Enemy OUTGOING damage (the
 * `outgoingDamageMult` column) is out of scope entirely for this DPS
 * calculator (incoming damage to the player isn't modeled) — kept here for
 * completeness/documentation only, no consumer reads it.
 */
export type EpicCreatureRank = 1 | 2 | 3 | 4 | 5;

export interface EpicCreatureRankMult {
  healthMult: number;
  /** Not consumed anywhere — incoming/enemy-outgoing damage is out of scope. Documented for completeness. */
  outgoingDamageMult: number;
}

export const EPIC_CREATURE_RANK_MULTS: Readonly<Record<EpicCreatureRank, EpicCreatureRankMult>> = {
  1: { healthMult: 2.0, outgoingDamageMult: 1.1 },
  2: { healthMult: 2.4, outgoingDamageMult: 1.15 },
  3: { healthMult: 3.2, outgoingDamageMult: 1.2 },
  4: { healthMult: 4.0, outgoingDamageMult: 1.25 },
  5: { healthMult: 4.8, outgoingDamageMult: 1.3 },
};
