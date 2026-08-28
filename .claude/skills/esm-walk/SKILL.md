---
name: esm-walk
description: Walk SeventySix.esm records to verify an item/effect is real and player-obtainable, decode what a perk/OMOD/legendary actually does, and decide where a fix belongs in dps-76. Use when a user questions whether an item/mod exists in game, when reviewing _meta.json unresolved reports, or when chasing a mechanic's ESM footprint.
---

# ESM record walking (dps-76)

The walker and the mechanics-chaser are native `esm` subcommands now:

```bash
esm walk <formid|edid> [--refs] [--depth N] [--ref-limit N]   # the interactive tool: digest + chain following; OMOD mechanisms classified inline
esm chase <selector> [--depth N] [--ref-limit N]              # pipeline JSON evidence contract (OMOD/PERK/SPEL/ALCH/ENCH only) — interactively just walk
```

`bun run esm:walk` remains as a thin alias for `esm walk`. Generic CLI
mechanics — path resolution, bulk `get`, `refs` flags, how to read the walk
digest (GLOB flat-wins rule, curves, conditions), generic obtainability
guidance, curve-table conventions, field-name churn — live in the `esm-cli`
skill that ships with the binary: `esm skill` prints it, and it's checked in
at `../FO76-Tools/.claude/skills/esm-cli/`. Read that first for anything
about driving the CLI itself. What follows is only the dps-76-specific
judgment layer.

## Digest → extractor mapping

- **Entry points**: `"Mod X" fn <Function> value <Float>` — bucket routes live
  in `scripts/extract/normalize/mgef.ts` (`ENTRY_POINT_BUCKETS`). EP 189/190
  are the Onslaught pair.
- **Curve inputs**: the digest's `curve INPUT axis: AV <name>` maps to a
  `CurveInput` via `CURVE_INPUT_AVS` (mgef.ts).
- **GLOB magnitudes**: trust the digest's annotations — the generic
  flat-wins rule is in the `esm-cli` skill, not repeated here.
- **PERK with "NO effects"**: model via `overrides/perk-overrides.ts` with a
  description-sourced comment (dps-76 example: Lifegiver ranks 2/3).

## Perk rank verification (PCRD)

The generic fact — PCRD is the perk-card source of truth, `Perks[]` reflects
the live/rebalanced rank count, and rank chains/ability spells linger as cut
content after a compression — is documented in the `esm-cli` skill ("Perk
rank verification (PCRD)" section; `esm skill` prints it). What follows is
dps-76's own judgment layer: how to apply it before writing an extractor
override. Worked example (Lock and Load, a rank chain with 3 PERK records
where the live PCRD card lists only 1): `extract-perks.ts`'s doc-comment on
its cut-rank-truncation function.

1. Find the PCRD, use its `Perks` array (rank-ordered Male Perk formids) as
   the ground-truth rank list — not the EditorID-numbered chain.
2. `esm refs` any orphaned spell before treating it as engine-attached:
   "orphaned + matches the card's description text" is live-ish, "orphaned +
   referenced only by cut ranks" is dead.
3. Model only description-backed effects; leave undocumented record tiers
   out pending in-game measurement rather than assuming the record graph is
   complete.

## Obtainability verdicts (`--refs`)

1. Check the record's `obtainable` flag in the generated JSON first
   (derivation: `scripts/extract/obtainability.ts`).
2. Signal reading (player-facing referrer types, LVLI chains, NONPLAYABLE,
   and why script/VMAD/ATX grants have no record-level reverse refs) is in
   the `esm-cli` skill. dps-76 specifics: check the rescue lists
   (`forceVisible*Ids` in `overrides/corrections.ts`) before assuming junk.
3. **Shipped ≠ on-record.** P62/"The Drifter" gear looks perfectly obtainable
   on-record but never released. Confirm against release history or ask the
   user before rescuing anything unfamiliar.

## Effect-graph reachability (before modeling ANY effect arm)

An obtainable item does not make every effect arm on it live. Before wiring a
newly-surfaced arm, traverse BOTH directions and refs-check the ends — the
generic mechanics (leaf-refs trap, dead-end AV writes, root-refs recipe) are
in the `esm-cli` skill's reachability section; this is the dps-76 judgment
layer:

1. **Upstream — who grants/attaches this?** Walk the arm to its ROOT (the
   OMOD property, ENCH, or SPEL that starts the chain) and `esm refs` the
   ROOT, not the leaf. Every hop of an orphan chain references the next, so
   refs on any middle node look alive; only the root tells the truth. A
   keyword-gated apply-perk whose gate passes still does nothing unless
   something actually GRANTS the perk.
2. **Downstream — who consumes this?** An AV write needs a reader (a
   perk/MGEF/EP whose Actor Value or curve input is that AV); a keyword add
   needs a gate that reads it AND a live effect behind the gate. A write
   with zero consumers is a native-engine flag or VFX enable, not damage.
3. **Both checks are necessary, neither sufficient.** Zero record-level refs
   can still be live (script/VMAD/ATX grants — the `forceVisible*` rescue
   class; user-confirm in-game), and a perfectly-wired record graph can be
   unshipped (P62). Naming conventions (`CUT_`/`zzz_`/`POST-`/`DEL`) and
   release history break the ties.

Precedents (all 2026-08-28, formids re-walkable):

| case | failure shape |
|---|---|
| Pin-Pointer's +50% appendage arm | orphan ROOT: `ench_LegendaryWeapon_PinPointers` 0x007ACA02 has zero refs — the ENCH→AddPerk→SPEL→ApplyPerk island never fires despite an obtainable carrier and a satisfiable keyword gate; in-game effect is the +20% weakpoint arm only |
| Kinetic Servos / KillStreakPerKillCount / VATSCriticalMultAdjust* / RefractingProjectileChance / BloodyMess* | dead-end AV writes: zero downstream consumers → native-engine/VFX flags |
| Eat The Rich (Anti-Aristocrat's) | fully-specified offense, zero refs on the mod itself → dormant/unreleased |
| Ruiner's (P62) | extractor emitted real modifiers, but the whole record family is unreleased — and its gates parked unresolved, so a naive rescue ships an unconditional +500 |

## Power-armor exclusivity (armor OMODs)

Whether an armor-legendary/misc mod can ONLY be worn on power armor
determines whether its modifiers need an app-supplied `{kind: 'inPowerArmor',
value: true}` gate — the ESM's own enchantment conditions never state this
directly (2026-08-03, Propelling: `esm get`/`esm refs`).

1. **Attach point** (`ap_PowerArmor_Misc`/`Lining`/`Torso`/`Helmet`, etc.):
   PA-body-slot-specific attach points genuinely only exist on power armor —
   safe, general signal. `extract-omods.ts` already gates every OMOD on such
   a point.
2. **`ap_LegendaryN` mods**: legendary-slot mods share attach points across
   armor AND power armor, so attach point alone can't tell PA-exclusive
   legendaries (Propelling) from dual-availability ones (Powered, the
   SPECIAL cards, Bruiser's/Ranger's, Overeater's, Active, Healthy,
   Limit-Breaking, Crusaders).
3. **Do NOT use the `ma_PowerArmorMod` Target OMOD Keyword alone** as a
   PA-exclusivity signal — it's shared by thousands of records including
   every dual-availability legendary's PA-flavored instance; using it
   naively gates effects that are legitimately available on regular armor
   too.
4. **The reliable check for a legendary-slot mod**: does it have a
   plain-armor sibling record under the same display name (no → suspect
   PA-exclusive), and does its granting COBJ (`esm refs <formid>` → the
   `COBJ`) carry `"Workbench Keyword": "Workbench_Crafting_PowerArmor"`
   (`esm get` that COBJ)? Both true → PA-exclusive, verified. Model as a
   single-instance override in `overrides/armor-values.ts` (see Propelling's
   entry) — don't generalize into an extractor rule from one instance.

## Where fixes go

See `CLAUDE.md`'s "Adding / Fixing Game Data" for the full decision tree
(overrides vs. new bucket/condition vs. extractor mapping) — not repeated
here. After any extractor change: `bun run extract … [--only …]`, review
`_meta.json` deltas and `bun run extract:diff`; a mapping change that shifts
UNRELATED values is a regression, not noise.
