# dps-todos/ — Remaining Work Index

Curated 2026-07-13: this folder is scoped to the **dps-76 app** only. Todos for
the separate Rust ESM parser (`~/dev/fo76/FO76-Tools/esm/`) live in
`~/dev/fo76/FO76-Tools/todos/` instead — that crate is far past its original
POC (181 record types, zero raw-fallback records, strings/BA2/VMAD/CTDA/napi/
MCP-server all shipped); only `write-support` (not needed here), `cross-file-
formid` (moot for FO76 — the base ESM is master-less), and `pascal-schema-
extraction` (arguably obsolete) still have anything open, and none of it
blocks dps-76.

Everything below was verified against actual code (not the todo text) as of
2026-07-13. `docs/assumptions.md` is the canonical record of every shipped
mechanic's assumptions — this README is a priority queue, not a spec.
Priority order below reflects the user's 2026-07-12 reprioritization
(supersedes the original enemy-mitigation-first ordering).

Removed as **completed** on 2026-07-13 (recover via git history; shipped
detail lives in `docs/assumptions.md`): `consumables-overhaul.md`,
`carnivore-herbivore.md`, `launcher-explosives.md`, plus the ranged half of
`fire-rate.md` and the power-attack half of `power-attacks.md` — those two
docs' remaining melee scope merged into
[melee-cadence.md](melee-cadence.md); their measurement leftovers moved to
[measurement-backlog.md](measurement-backlog.md).

## Remaining implementable work, in priority order

1. **Armor mods — outgoing damage** — [armor-mods-outgoing.md](armor-mods-outgoing.md).
   Unyielding (SPECIAL-on-low-HP → feeds STR melee term) and Zealot's
   (vs Scorched/Scorchbeast). No blockers — armor types already exist, just
   unpopulated and unwired.
2. **The rest** (no further internal ordering implied):
   - **Enemy table & mitigation** — [phase-3-enemies.md](phase-3-enemies.md).
     Spike partially done 2026-07-12: BPTD body-part/weakpoint extraction +
     the Target section race/body-part picker already shipped. Remaining:
     HP/DR/ER spike (NPC_/RACE/TPLT chains) → `extract-npcs.ts` +
     `npcs.json` + fixtures → curated `notable-enemies.ts` → `mitigation.ts`
     (activate the dormant `calculateDamageResistMult`, per damage component)
     + `armorPen` bucket fold + `enemyType` conditions via an `EnemyProfile` →
     per-enemy `{perHit, sustainedDps, retainedPct, ttk}` → `ui/table.tsx`,
     flip `ENEMY_TABLE_ENABLED`. Unlocks armor incoming-DR, cripple-speed,
     on-kill AP restores, and real VATS-accuracy relevance.
   - **Armor mods — incoming damage** — [armor-mods-incoming.md](armor-mods-incoming.md).
     WWR/Bolstering/Overeater's DR — blocked on the mitigation engine above.
   - **Popular builds / presets** — [popular-builds.md](popular-builds.md).
     All dependencies (perk data, VATS crit, sneak) are done; just needs the
     preset-selector UI + 3 canned N&D configs.
   - **Melee cadence** — [melee-cadence.md](melee-cadence.md). Real
     per-weapon `animDelaySec` for melee replacing the 1 swing/sec stub.
     (The old 1h/2h weaponClass split is dropped — no perk or OMOD in the
     current dump gates on handedness; see the doc.)
   - **Perk weapon-stat fold gap + measurement queue** —
     [measurement-backlog.md](measurement-backlog.md). The fold gap is a
     self-contained engine fix (no blockers); the measurement queue needs
     in-game golden cases per effect — now also holds the launcher pip-boy
     summing verification and the Carnivore/Herbivore confirmations.
   - **PTS toggle** — [pts-toggle.md](pts-toggle.md). Smallest mechanical win
     whenever picked up: un-disable the Header `Switch`, wire it to
     `setMode`. Low value until a genuinely different PTS dump exists (pts
     re-exports live today).
   - **VATS accuracy / hit chance** — [ap-and-accuracy.md](ap-and-accuracy.md).
     Explicitly deferred 2026-07-11; AP economy itself is done. Only worth it
     once enemy mitigation makes a real hit-chance-weighted DPS number
     meaningful.

## ESM-parser todos (separate repo)

See `~/dev/fo76/FO76-Tools/todos/`: `write-support.md` (not needed by dps-76),
`cross-file-formid.md` (moot — FO76's base ESM has no masters),
`pascal-schema-extraction.md` (schema already at full fidelity another way).

## Known gaps & measurement backlog

The perk-sourced weapon-stat fold gap (Guerrilla Expert et al.) and the
in-game measurement queue (legendary effects extracting zero modifiers, plus
the shipped-mechanic confirmations) live in
[measurement-backlog.md](measurement-backlog.md). What remains below is only
the parked-by-design list — full derivations for everything live in
`docs/assumptions.md`.

- **Parked by explicit design decision** (not oversights):
  - Basher's — inert + badged, no bash action modeled; revisit only with a
    melee-flow rework.
  - Combo-Breaker's — badged `pendingMechanic`; its granted perk is a
    probabilistic AP-cost-reduction effect (EP79/EP27 gated by
    `GetRandomPercent`), waits on AP-economy modeling of random effects.
  - Crippling / cripple-speed stat — limb damage is limb-condition only (no
    HP term); waits on enemy limb HP (phase-3-enemies.md).
  - On-kill AP restores (Grim Reaper's Sprint, Conductor's kill-half) — wait
    on enemy TTK (phase-3-enemies.md).
  - Gunslinger Master's per-stack "gain over time / spend on attack" — engine
    -opaque, no further ESM footprint to chase (max-stack contribution only).
  - N&D Slugger/IronFist Expert/Master import keys are missing from
    `perk-ids.ts`; relevance unclear post-combat-overhaul (base Rifleman/
    Commando/HeavyGunner/Gladiator no longer exist as damage perks either) —
    only fix if a build actually needs them.
