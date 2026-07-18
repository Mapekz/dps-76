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
 * against FLST `EpicCreatureDisallowedKeywords` 0x004FC5B7). Whether a
 * SPECIFIC curated target (SBQ, Earle, ...) actually spawns at a given epic
 * rank in a given encounter is a runtime chance roll (region/level-gated
 * Papyrus script) with NO static ESM signal — `epicAllowed: true` only means
 * "not structurally excluded", not "always epic" or "always this rank". See
 * docs/assumptions.md "Creature stat curves & NPC extraction" for how this
 * bears on the open Scorchbeast Queen HP question (short answer: it doesn't
 * explain the ~10× gap — max HealthMult here is 4.8×).
 *
 * Not wired into any UI control (out of scope for Phase 2 — Enemy defenses,
 * which only ships a level slider): `src/lib/enemy-defenses.ts`'s
 * `getEnemyDefenses` accepts an optional `epicRank` so a future picker can
 * slot in without another data-layer change, but nothing calls it with a
 * non-undefined rank today. Enemy OUTGOING damage (the `outgoingDamageMult`
 * column) is out of scope entirely for this DPS calculator (incoming damage
 * to the player isn't modeled) — kept here for completeness/documentation
 * only, no consumer reads it.
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
