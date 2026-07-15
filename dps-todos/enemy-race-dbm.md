# Enemy-race DBM wiring (vs-race legendary effects fire against the picked target)

Deferred from the 2026-07-15 player/target UI polish pass (user decision).

## Problem

The Target section's enemy picker resolves body parts (BPTD) only. The
selected race is never threaded into the engine's enemy context, so the
vs-race 1★ legendary mods (Hunter's, Ghoul Slayer's, Mutant Slayer's,
Zealot's, Exterminator's, Troubleshooter's) stay inert and show the
"needs enemy DR" badge even when the picked target is exactly the race they
counter. The DPS panel also doesn't surface the picked enemy + part.

## Worked design (verified against the ESM 2026-07-15)

- RACE records carry the ActorType keywords the vs-race conditions test:
  verified `MirelurkQueenRace` → `ActorTypeMirelurk` / `Arthropods` /
  `Aquatic`. So the data is one extractor field away.
- Extend `scripts/extract/extract-bodyparts.ts` to emit
  `GeneratedBodyPartRace.actorTypes: string[]` (the RACE record's ActorType*
  keywords, resolved to edids).
- Thread the selected race's `actorTypes` into the engine's enemy context
  where `resolveLoadout` builds it (`src/lib/loadout.ts` — the
  `enemyConfig.conditions` handoff around the body-part mult resolution).
- Evaluate `enemyType` / `enemyTypeAny` conditions in
  `src/lib/engine/resolve.ts` (~lines 127-130) against that actorTypes set
  instead of whatever stub they currently read.
- Update `classifyOmodDisplay` (`src/data/omods.ts` ~lines 137-161) so
  vs-race conditions are no longer classified inert — Berserker's
  (`enemyDamageResist` curve) and Anti-Armor (`armorPen`) keep the
  "needs enemy DR" badge; the pure vs-race dbm ones lose it.
- Surface the picked enemy + body part in the DPS panel.
- Re-extract bodyparts (`pnpm extract --only bodyparts` if/when that
  `--only` key exists; otherwise the full run) and review `extract:diff`.
