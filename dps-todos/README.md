# dps-todos/ — Remaining Work Index

Curated 2026-07-12: this folder is scoped to the **dps-76 app** only. Todos for
the separate Rust ESM parser (`~/dev/fo76/FO76-Tools/esm/`) live in
`~/dev/fo76/FO76-Tools/todos/` instead — that crate is far past its original
POC (181 record types, zero raw-fallback records, strings/BA2/VMAD/CTDA/napi/
MCP-server all shipped); only `write-support` (not needed here), `cross-file-
formid` (moot for FO76 — the base ESM is master-less), and `pascal-schema-
extraction` (arguably obsolete) still have anything open, and none of it
blocks dps-76.

Everything below was verified against actual code (not the todo text) as of
the 2026-07-12 dump/build. `docs/assumptions.md` is the canonical record of
every shipped mechanic's assumptions — this README is a priority queue, not a
spec.

## Remaining implementable work, in priority order

1. **Enemy table & mitigation** — [phase-3-enemies.md](phase-3-enemies.md).
   The app's headline gap: everything downstream of enemy data is inert or
   deferred (armor incoming-DR, VATS accuracy relevance, cripple-speed,
   on-kill AP restores). Path: ESM spike (HP/DR/ER/BPTD on NPC_/RACE/TPLT
   chains) → `extract-npcs.ts` + `npcs.json` + fixtures → curated
   `notable-enemies.ts` → `mitigation.ts` (activate the dormant
   `calculateDamageResistMult`, per damage component) + `armorPen` bucket fold
   + `enemyType` conditions via an `EnemyProfile` → per-enemy
   `{perHit, sustainedDps, retainedPct, ttk}` → `ui/table.tsx`, flip
   `ENEMY_TABLE_ENABLED`.
2. **PTS toggle** — [pts-toggle.md](pts-toggle.md). Smallest win: un-disable
   the Header `Switch`, wire it to `setMode`. Low value until a genuinely
   different PTS dump exists (pts re-exports live today).
3. **Popular builds / presets** — [popular-builds.md](popular-builds.md).
   All three dependencies (perk data, VATS crit, sneak) are done; just needs
   the preset-selector UI + the 3 canned N&D configs.
4. **Consumables overhaul** — [consumables-overhaul.md](consumables-overhaul.md).
   Full ALCH extraction (category + dispel-keyword + addiction data) plus a
   sizeable stacking-rule UI. Plan a grill/design pass first — user rules are
   already pinned in the doc.
5. **Melee cadence** — [fire-rate.md](fire-rate.md) +
   [power-attacks.md](power-attacks.md) (one workstream, split across two
   docs by history). Real per-weapon `animDelaySec` for melee replacing the
   1 swing/sec stub, plus a `melee1h`/`melee2h` weaponClass split so
   Gladiator vs Slugger can apply correctly.
6. **Armor mods** — [armor-mods.md](armor-mods.md). Outgoing half
   (Unyielding→SPECIAL, Zealot's) can ship any time; incoming half
   (WWR/Bolstering/Overeater's DR) needs #1's `mitigation.ts` first.
7. **VATS accuracy / hit chance** — [ap-and-accuracy.md](ap-and-accuracy.md).
   Explicitly deferred 2026-07-11; AP economy itself is done. Lowest
   priority — only worth it once enemy mitigation (#1) makes a real
   hit-chance-weighted DPS number meaningful.

## ESM-parser todos (separate repo)

See `~/dev/fo76/FO76-Tools/todos/`: `write-support.md` (not needed by dps-76),
`cross-file-formid.md` (moot — FO76's base ESM has no masters),
`pascal-schema-extraction.md` (schema already at full fidelity another way).

## Known gaps & measurement backlog

Rescued from the resolution logs (`onslaught.md`, `engine-mechanics-push.md`,
`data-quality-review.md`) before their deletion — full derivations live in
`docs/assumptions.md`.

- **Perk-sourced weapon-stat fold gap**: Guerrilla Expert's reload-speed bonus
  extracts correctly but is inert, along with `GHL_GunTricks`, `GroundPounder`,
  and `MartialArtist` — all need perk-sourced weapon-stat buckets wired into
  `buildEffectiveWeapon`'s fold (a pre-existing gap, not specific to any one
  perk).
- **In-game measurement queue** (extraction reads zero modifier, needs a
  measured golden case or a deeper script chase): Feral's, Barbarian,
  Fracturer's, Electrician's, Locked, Glowing, Ghost's, Vampire's,
  Suppressor's, Medic's, Durability, Pick Pocketer's, Nimble, Resilient,
  Steadfast, Defender's, Blocker, Stabilizer's, Lightweight, V.A.T.S.
  Enhanced, Riposting. Utility-only ones stay hidden by the display rule;
  damage-relevant ones are the actual queue.
- **Parked by explicit design decision** (not oversights):
  - Basher's — inert + badged, no bash action modeled; revisit only with a
    melee-flow rework.
  - Combo-Breaker's — badged `pendingMechanic`; its granted perk is a
    probabilistic AP-cost-reduction effect (EP79/EP27 gated by
    `GetRandomPercent`), waits on AP-economy modeling of random effects.
  - Crippling / cripple-speed stat — limb damage is limb-condition only (no
    HP term); waits on enemy limb HP (priority #1 above).
  - On-kill AP restores (Grim Reaper's Sprint, Conductor's kill-half) — wait
    on enemy TTK (priority #1 above).
  - Gunslinger Master's per-stack "gain over time / spend on attack" — engine
    -opaque, no further ESM footprint to chase (max-stack contribution only).
  - N&D Slugger/IronFist Expert/Master import keys are missing from
    `perk-ids.ts`; relevance unclear post-combat-overhaul (base Rifleman/
    Commando/HeavyGunner/Gladiator no longer exist as damage perks either) —
    only fix if a build actually needs them.
