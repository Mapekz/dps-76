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
Priority order below reflects the user's 2026-07-13 reprioritization
(supersedes the 2026-07-12 ordering, which put armor-mods-outgoing first).

Removed as **completed** on 2026-07-13 (recover via git history; shipped
detail lives in `docs/assumptions.md`): `consumables-overhaul.md`,
`carnivore-herbivore.md`, `launcher-explosives.md`, plus the ranged half of
`fire-rate.md` and the power-attack half of `power-attacks.md` — those two
docs' remaining melee scope merged into
[melee-cadence.md](melee-cadence.md); their measurement leftovers moved to
[measurement-backlog.md](measurement-backlog.md).

Removed as **completed** on 2026-07-14: `omod-eligibility.md` (COBJ-anchored
`isEligible`; empty-`targetKeywords` mods gated by template membership /
explicit rescue) and `omod-obtainability-chains.md` (`cobj-index.ts` forward
index, plan-BOOK + scrap-to-learn chases, weak-evidence review queue) — full
spec in `docs/assumptions.md` "OMOD eligibility & recipe chains". Also
removed 2026-07-14: `wholedamage-perks.md` — Follow Through & Taking One for
the Team wired to `wholeDamage` via manual uptime inputs
(`src/data/manual-uptime.ts`; esm-walk chase + modeling spec in
`docs/assumptions.md` "Follow Through / Taking One for the Team"), UI as
0/10/20/30/40% toggle groups per the 2026-07-14 control-style decision
(toggle groups over sliders for small discrete ranges — also applied to
teammate count 0–3 and enemy group size 1–5+).

Removed as **completed** on 2026-07-15: `team-mechanics.md` (teammate count
moved to a dedicated Team section; United Ordeal wired via the
`GetPlayerTeammateCount ≥ N` extractor branch + condition-aware SPECIAL fold;
public team bonuses — Casual +INT / Exploration +END — modeled in
`public-teams.ts`) and `ap-regen.md` (originally `ap-and-accuracy.md`,
renamed and rescoped 2026-07-13 once VATS hit-chance/accuracy was ruled
permanently out of scope; VATS AP regen, AP cost, max AP, and AP-scaled
damage fully shipped — race-based %-of-max regen model, Conductor's, Lone
Wanderer, Number Cruncher, hydration, and Packin' Light all wired; the five
remaining in-game golden-case measurements moved to
[measurement-backlog.md](measurement-backlog.md)) — recover via git history;
shipped detail lives in `docs/assumptions.md`.

## Weapon-mod selection sweep (added 2026-07-14, CLOSED 2026-07-14)

Six barebones spikes carved from the 2026-07-14 tester bug sweep (~50 mod
picker issues), grouped by root cause. All six completed 2026-07-14 and were
removed: `omod-eligibility.md` (COBJ-anchored mod↔weapon matching),
`omod-obtainability-chains.md` (plan/recipe/vendor chases),
`omod-nondps-stats.md` (show-all-mods display policy, inert badges),
`omod-slot-hygiene.md` (dedupe + no-decision slot hiding),
`omod-slot-naming.md` (KYWD-FULL/global + per-weapon power-tool labels),
`unique-cursed-mods.md` (30+ identity mods restored: instance-only keywords,
unnamed template members, cursed "Item Description" slot, Kabloom/Cold
Shoulder naming, Dom Pedro payload), and the post-sweep addition
`weapon-attach-point-closure.md` (attach-point fixpoint closure — mod-granted
slots restored on 136 weapons) — recover via git history; shipped detail in
`docs/assumptions.md`.

One-off deferral: mole-miner-gauntlet Extra Claw damage decrease → noted in
[melee-cadence.md](melee-cadence.md) (likely correct; DoT-refresh math).

## Remaining implementable work, in priority order

Order re-confirmed by the user 2026-07-14 (wholeDamage perks → measurement
backlog → team mechanics; wholeDamage shipped same day, see the removal note
above). Team mechanics and VATS AP regen — next in that line — both shipped
2026-07-15 (see the removal note above).

1. **Measurement backlog** — [measurement-backlog.md](measurement-backlog.md).
   Perk weapon-stat fold gap (self-contained engine fix, no blockers) +
   in-game golden-case queue (legendary effects extracting zero modifiers,
   launcher pip-boy summing verification, Carnivore/Herbivore confirmations,
   AP regen goldens).
2. **Popular builds / presets** — [popular-builds.md](popular-builds.md).
   All dependencies (perk data, VATS crit, sneak) are done; just needs the
   preset-selector UI + 3 canned N&D configs.
3. **PTS toggle** — [pts-toggle.md](pts-toggle.md). Smallest mechanical win
   whenever picked up: un-disable the Header `Switch`, wire it to
   `setMode`. Low value until a genuinely different PTS dump exists (pts
   re-exports live today).
4. **Melee cadence** — [melee-cadence.md](melee-cadence.md). Real
   per-weapon `animDelaySec` for melee replacing the 1 swing/sec stub.
   (The old 1h/2h weaponClass split is dropped — no perk or OMOD in the
   current dump gates on handedness; see the doc.)
5. **Armor mods — outgoing damage** — [armor-mods-outgoing.md](armor-mods-outgoing.md).
   Narrowed 2026-07-13 to specific mods: Unyielding, Nocturnal (caution — a
   weapon legendary already extracted under this name; confirm it's the
   right target before building an armor one), 2-star SPECIAL armor bonuses,
   Optimized Bracers (found — power-armor intrinsic AP-cost reduction on
   power attacks, fully unwired), Auto-Stim legendary / Medic Pump (for
   HP-for-AP "blood sacrifice" VATS builds), plus a handful more to be swept
   once the pipeline exists. Not actually unblocked as the doc previously
   claimed — no armor OMOD/legendary extraction pipeline exists yet at all;
   building one is now a prerequisite, shared with the armor-sourced AP
   "Powered" chase (moved here from the closed `ap-regen.md`).
6. **Last, tied — Enemy table & mitigation, and Armor mods — incoming damage**:
   - **Enemy table & mitigation** — [phase-3-enemies.md](phase-3-enemies.md).
     Spike partially done 2026-07-12: BPTD body-part/weakpoint extraction +
     the Target section race/body-part picker already shipped. Remaining:
     HP/DR/ER spike (NPC_/RACE/TPLT chains) → `extract-npcs.ts` +
     `npcs.json` + fixtures → curated `notable-enemies.ts` → `mitigation.ts`
     (activate the dormant `calculateDamageResistMult`, per damage component)
     + `armorPen` bucket fold + `enemyType` conditions via an `EnemyProfile` →
     per-enemy `{perHit, sustainedDps, retainedPct, ttk}` → `ui/table.tsx`,
     flip `ENEMY_TABLE_ENABLED`. Unlocks armor incoming-DR, cripple-speed,
     and on-kill AP restores. (No longer motivated by VATS-accuracy
     relevance — that scope is permanently dropped, see the removal note
     above.)
   - **Armor mods — incoming damage** — [armor-mods-incoming.md](armor-mods-incoming.md).
     WWR/Bolstering/Overeater's DR — blocked on the mitigation engine above.

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
  - N&D Slugger/IronFist Expert/Master import keys are missing from
    `perk-ids.ts`; relevance unclear post-combat-overhaul (base Rifleman/
    Commando/HeavyGunner/Gladiator no longer exist as damage perks either) —
    only fix if a build actually needs them.
