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
spec in `docs/assumptions.md` "OMOD eligibility & recipe chains".

`ap-and-accuracy.md` was renamed to [ap-regen.md](ap-regen.md) and rescoped
2026-07-13: VATS hit-chance/accuracy is now permanently out of scope (closed
box, not just deferred), and the doc's remaining scope is VATS AP regen/sec
sources instead (Conductor's active on-crit regen already ships; Lone
Wanderer's passive solo regen and any armor-sourced passive regen do not).

## Weapon-mod selection sweep (added 2026-07-14, unprioritized)

Six barebones spikes carved from the 2026-07-14 tester bug sweep (~50 mod
picker issues), grouped by root cause. Five of the six completed 2026-07-14
and were removed: `omod-eligibility.md` (COBJ-anchored mod↔weapon matching),
`omod-obtainability-chains.md` (plan/recipe/vendor chases),
`omod-nondps-stats.md` (show-all-mods display policy, inert badges),
`omod-slot-hygiene.md` (dedupe + no-decision slot hiding), and
`omod-slot-naming.md` (KYWD-FULL/global + per-weapon power-tool labels) —
recover via git history; shipped detail in `docs/assumptions.md`. Only one
remains:

- **[unique-cursed-mods.md](unique-cursed-mods.md)** — unique-slot
  completion: missing uniques (Cold Shoulder, Holy Fire, Flatliner, …),
  cursed mods under "Item Description", bogus entries ("The Pipe", Minty
  Breather), Kabloom naming.

One-off deferral: mole-miner-gauntlet Extra Claw damage decrease → noted in
[melee-cadence.md](melee-cadence.md) (likely correct; DoT-refresh math).

## Remaining implementable work, in priority order

1. **wholeDamage legendary perks** — [wholedamage-perks.md](wholedamage-perks.md).
   Follow Through and Taking One for the Team both select in the UI but fold
   to nothing — real ESM perks, zero decoded modifiers, engine's
   `wholeDamage` bucket exists and is tested but has no real data source.
   Model as manual 0-40% sliders → 1.0x-1.4x damage-taken multiplier on the
   enemy. Tenderizer (already correctly modeled as a stacking `dbm` ADD, not
   `wholeDamage`) is NOT part of this gap.
2. **Measurement backlog** — [measurement-backlog.md](measurement-backlog.md).
   Perk weapon-stat fold gap (self-contained engine fix, no blockers) +
   in-game golden-case queue (legendary effects extracting zero modifiers,
   launcher pip-boy summing verification, Carnivore/Herbivore confirmations).
3. **Team mechanics** — [team-mechanics.md](team-mechanics.md). Teammate
   requirement is invisible in the UI, United Ordeal is fully inert
   (unresolved teammate condition + conditional SPECIAL never folds), and
   public team bonuses (Casual +INT / Exploration +END) aren't modeled at
   all. Scoped 2026-07-13; no blockers.
4. **VATS AP regen** — [ap-regen.md](ap-regen.md). Rescoped 2026-07-13:
   VATS hit-chance/accuracy dropped permanently (closed-box formula, not
   worth chasing). Remaining scope is AP regen/sec sources — Conductor's
   (active, on-crit) already ships; Lone Wanderer's passive solo AP regen
   is dead on an unmapped curve AV, and passive armor-sourced regen (e.g. a
   "Powered"-style effect) hasn't been located yet (no armor-omod
   extraction pipeline exists at all — see the doc).
5. **Popular builds / presets** — [popular-builds.md](popular-builds.md).
   All dependencies (perk data, VATS crit, sneak) are done; just needs the
   preset-selector UI + 3 canned N&D configs.
6. **PTS toggle** — [pts-toggle.md](pts-toggle.md). Smallest mechanical win
   whenever picked up: un-disable the Header `Switch`, wire it to
   `setMode`. Low value until a genuinely different PTS dump exists (pts
   re-exports live today).
7. **Melee cadence** — [melee-cadence.md](melee-cadence.md). Real
   per-weapon `animDelaySec` for melee replacing the 1 swing/sec stub.
   (The old 1h/2h weaponClass split is dropped — no perk or OMOD in the
   current dump gates on handedness; see the doc.)
8. **Armor mods — outgoing damage** — [armor-mods-outgoing.md](armor-mods-outgoing.md).
   Narrowed 2026-07-13 to specific mods: Unyielding, Nocturnal (caution — a
   weapon legendary already extracted under this name; confirm it's the
   right target before building an armor one), 2-star SPECIAL armor bonuses,
   Optimized Bracers (found — power-armor intrinsic AP-cost reduction on
   power attacks, fully unwired), Auto-Stim legendary / Medic Pump (for
   HP-for-AP "blood sacrifice" VATS builds), plus a handful more to be swept
   once the pipeline exists. Not actually unblocked as the doc previously
   claimed — no armor OMOD/legendary extraction pipeline exists yet at all;
   building one is now a prerequisite, shared with `ap-regen.md`'s "Powered"
   chase.
9. **Last, tied — Enemy table & mitigation, and Armor mods — incoming damage**:
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
     relevance — that scope is permanently dropped, see `ap-regen.md`.)
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
  - Gunslinger Master's per-stack "gain over time / spend on attack" — engine
    -opaque, no further ESM footprint to chase (max-stack contribution only).
  - N&D Slugger/IronFist Expert/Master import keys are missing from
    `perk-ids.ts`; relevance unclear post-combat-overhaul (base Rifleman/
    Commando/HeavyGunner/Gladiator no longer exist as damage perks either) —
    only fix if a build actually needs them.
