# DPS-76

A Fallout 76 outgoing-DPS calculator. This glossary fixes the vocabulary for the
damage engine and its data pipeline so code, tests, and docs use one word per
concept.

## Language

### Damage engine

**Paper Damage**:
Outgoing damage before any enemy mitigation (DR/ER). The whole engine computes
paper damage only.
_Avoid_: raw damage, base damage (that means something narrower — a component's
pre-modifier value).

**Modifier IR**:
The single normalized shape every damage source (perk, OMOD, legendary effect,
mutation, consumable) is reduced to — `{ bucket, op, value | curveScale, conditions }`.
_Avoid_: stat mod, effect, adjustment.

**Bucket**:
The term of the paper-damage formula a modifier feeds (`dbm`, `critDmgBase`,
`sneakBonus`, `weakpointBonus`, `fireRateSpeed`, …).
_Avoid_: category, slot (slot means an OMOD attach point).

**Bucket Regime**:
Which fold mechanism consumes a Bucket (`damageFold`, `dot`, `weaponStat`,
`critEconomy`, `apEconomy`, `playerStat`, `bootstrap`, or `unfolded`), and
whether the fold's result reaches anything (`hasEngineEffect`) — one table,
`BUCKET_REGISTRY` (`src/types/modifiers.ts`), answering both. Its optional
`foldBase` and `deBased` fields also own non-default fold-output conventions
(defaults: 0 and false). `WEAPON_STAT_BUCKETS` (`effective-weapon.ts`) and
`INERT_ENGINE_BUCKETS` (the OMOD/consumable picker's "no engine effect" badge,
`omods.ts`) are derived from it, not hand-maintained, so the picker can't
silently drift from what the engine actually wires.
_Avoid_: routing, dispatch.

**Fold**:
Combining all active modifiers on one bucket over an intrinsic base:
`(last SET ?? base) + ΣMUL_ADD×base + ΣADD`. The arithmetic lives once in `foldOps`.
_Avoid_: reduce, aggregate, sum.

**Scenario**:
One of the three displayed attack contexts — Manual Aim, VATS, VATS+Sneak — each
computed from one resolved config via per-attack `ScenarioFlags`.
_Avoid_: mode (that means Live/PTS), case.

**Effective Weapon**:
A weapon with its equipped OMODs applied (merged keywords, rewritten speed/auto
state) — the shape the engine actually reads.
_Avoid_: modded weapon, final weapon.

**Effective Stacks**:
The resolved, clamped Onslaught or Bullet Storm count shared by the engine's
`PLAYER_STATE_READERS` and the ConditionsSection display via
`src/lib/engine/stacks.ts`.
_Avoid_: displayed stacks, raw stacks.

**Loadout**:
The resolved, engine-ready view of a player build — weapon + OMODs + perks +
legendary perks + mutations + consumables assembled into the engine's
`ScenarioInput` by `resolveLoadout` (`src/lib/loadout.ts`).
_Avoid_: build (that's the user-facing config, `PlayerConfig`), config.

### Data pipeline

**Mode**:
The game-data variant, `live` or `pts`. One ESM is extracted today, so both
resolve to the same data. The switcher holds a build FIXED and varies Mode to
compare how a formula/calculation change affects that same build — Mode is a
comparison axis a build is evaluated *at* (a parameter to `resolveLoadout`,
`makeBuildReducer`, every `@/data` accessor), never a property a build *has*.
It lives in `GameModeContext`, not `BuildState`, and is never persisted
(`docs/adr/0002`).
_Avoid_: version, environment, scenario.

**OMOD**:
A weapon mod (game term / ESM record). Contributes Modifier IR and may add
keywords or rewrite weapon stats.
_Avoid_: attachment, mod (ambiguous — say OMOD).

**Plumbing Perks**:
The hidden engine perks (`STAT_DamagePerk`, `STAT_CritDamagePerk`,
`STAT_DamageVsPerk`) whose entry points data-drive which `STAT_*` actor value
routes to which bucket. Extraction reads these instead of hardcoding routing.
_Avoid_: routing perks, stat perks.

**Overlay** (a.k.a. the overrides layer):
The hand-maintained layer (`src/data/overrides/*`) that patches wrong or
missing generated values and survives re-extraction.
_Avoid_: patch, fixup, corrections (that's one specific overlay file).

**Merged Dataset**:
The single mode-resolved view of all game data, produced by `getDataset(mode)`
(`src/data/dataset.ts`). VALUE overlays (legendary/buff/omod modifier
overrides) are folded in right there, so every accessor reads already-merged
modifiers. VISIBILITY overlay sets (hidden/forceVisible) are also reachable
through `getDataset(mode)`, but apply downstream, in each collection's own
accessor — by design: a build that already selected a since-hidden
omod/consumable must keep computing, only the picker should stop offering it,
while a hidden weapon record (never real player content) is dropped from the
dataset entirely. `dataset.ts` stays the one home for the Overlay *contract*
even where it isn't the one applying it.
_Avoid_: combined data, resolved data.

## Relationships

- A **Loadout** is assembled from a `PlayerConfig` and produces an **Effective
  Weapon** plus a list of **Modifier IR**, which the engine folds per **Bucket**
  into **Paper Damage** for each **Scenario**.
- Each **Modifier IR** targets exactly one **Bucket**; each **Bucket** is combined
  by one **Fold**.
- The **Merged Dataset** = generated (ESM-extracted) data + the **Overlay**,
  resolved once per **Mode**. **Plumbing Perks** drive how extraction assigns
  Modifier IR to **Buckets**.

## Example dialogue

> **Dev:** "When I equip a Powerful Automatic Receiver, where does the −30%
> show up?"
> **Domain expert:** "That OMOD becomes part of the **Effective Weapon** and
> emits **Modifier IR** on the `baseDamage` **Bucket**. `resolveLoadout` puts it
> in the **Loadout**, and the engine **folds** it before the dbm parenthesis."
> **Dev:** "And the −30% value itself?"
> **Domain expert:** "Extracted from the OMOD's include chain into the **Merged
> Dataset** — not hand-authored. Only the script-computed legendary magnitudes
> live in the **Overlay**."

## Flagged ambiguities

- "mod" meant both **OMOD** and a **Modifier IR** entry — resolved: OMOD is the
  game record, Modifier is the normalized IR it produces.
- "mode" meant both **Mode** (Live/PTS) and **Scenario** (Manual/VATS/Sneak) —
  resolved: these are distinct axes.
