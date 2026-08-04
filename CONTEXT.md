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
One of the two displayed attack contexts — Free Aim or VATS — each computed
from one resolved config via per-attack `ScenarioFlags`. Sneak is a player
condition applied to both, not a third scenario.
_Avoid_: mode (that means Live/PTS), case, Manual Aim (say Free Aim).

**AP Uptime**:
The steady-state fraction of time a VATS build can actually fire before the AP
pool forces a pause; the VATS scenario's canonical DPS is `uptime × VATS sustained + (1 − uptime) × Free Aim sustained` — the pause window is spent free-aiming, not idle (1 when AP never constrains).
_Avoid_: AP efficiency, duty cycle (say AP Uptime).

**VATS-Window DPS**:
The suggestion-ranking objective when VATS is emphasized: `AP Uptime × VATS
sustained`, with the AP-empty pause counted as zero — NOT blended with Free
Aim the way the scenario's canonical DPS is. Emphasizing VATS declares intent;
this objective avoids diluting VATS-only gains (crit damage, Better Criticals)
by the free-aim pause share.
_Avoid_: VATS burst DPS, pure VATS DPS.

**Effective Weapon**:
A weapon with its equipped OMODs applied (merged keywords, rewritten speed/auto
state) — the shape the engine actually reads.
_Avoid_: modded weapon, final weapon.

**Curve-Table Explosion**:
An explosion carrying its own damage curve (launchers, Gamma Gun, Cremator). The
Explosive 2★ boosts it at its own base, before DBM.
_Avoid_: launcher payload, blast.

**Projectile-Scaling Explosion**:
An explosion whose damage is a fraction of the weapon's projectile damage (Gauss
0.15, Tesla Cannon 0.10). The Explosive 2★ adds to that fraction rather than to
a base.
_Avoid_: explosion mult, payload.

**Sustained Stacks**:
The steady-state average a stack counter (Onslaught, Bullet Storm) settles at
during sustained fire, per the engine's mag+reload sawtooth simulations; what
the stack sliders' auto (`−1`) setting resolves to.
_Avoid_: max stacks, full stacks (those are a manual pin or a cap, not the
simulated average).

**Effective Stacks**:
The resolved, clamped Onslaught or Bullet Storm count shared by the engine's
`PLAYER_STATE_READERS` and the ConditionsSection display via
`src/lib/engine/stacks.ts` — from a manual pin, or on auto from **Sustained
Stacks**.
_Avoid_: displayed stacks, raw stacks.

**Modifier Ceiling**:
The range/max value shown for a curve-driven modifier whose input axis a
player has left at its zero/no-benefit default (kill streak, caps on hand,
addiction count, feral tier, …) — computed by `describeBuffModifiers`
(`src/lib/buff-description.ts`), NOT simulated like **Sustained Stacks**.
Display-only: the engine still evaluates the modifier at the player's actual
(often zero) current value; there is no steady-state simulation behind the
shown ceiling.
_Avoid_: max value, potential bonus (those don't distinguish it from a real
simulated average).

**Build Delta**:
The set of non-default fields in a config object, shared by serialization
(`src/lib/persist/codec.ts`) and the "N active" badges (ConditionsSection,
TargetSection), computed by `src/lib/build-delta.ts`.
_Avoid_: diff, delta count (say Build Delta).

**Loadout**:
The resolved, engine-ready view of a player build — weapon + OMODs + perks +
legendary perks + mutations + consumables assembled into the engine's
`ScenarioInput` by `resolveLoadout` (`src/lib/loadout.ts`).
_Avoid_: build (that's the user-facing config, `PlayerConfig`), config.

**Star Tier**:
The legendary-slot class (1★–4★) of an armor legendary effect, given by its
`ap_Legendary1-4` attach point. Each tier has a **Tier Budget**: across all
effects in that tier, summed worn-piece counts never exceed the 5 armor pieces
(2× Limit Breaking + 3× Battle-Loader's is legal; 5 + 5 is not) — enforced in
the model, not just advice (`docs/adr/0004`).
_Avoid_: star level, slot (that's an OMOD attach point), rank (that's perks).

### Suggestions

**Suggestion Family**:
The collapse unit for graduated suggestion candidates — one perk line's ranks,
one armor effect's worn-piece counts, or one same-tier X→Y swap pair. Every
reachable step is evaluated, but at most two rows per family surface: the
cheapest positive step ("next improving step") and the best absolute delta, so
stepwise breakpoints (Crit Savvy 3, Limit Breaking ×5) are visible even when
intermediate steps are worthless.
_Avoid_: group (that's the candidate's kind — perk/mod/armor/…), dedupe key.

**Structural Suggestion / Consumable Boost**:
The two suggestion-panel tiers. Structural suggestions (perks, legendary
perks, OMODs, weapon legendary effects, armor effects, mutations) rank in the
main list; Consumable Boosts rank only in their own smaller section below —
always, with no completeness heuristic. Consumables serve a build; they are
never presented as its basis.
_Avoid_: primary/secondary suggestions, buffs (ambiguous with armor effects).

**Combo Suggestion**:
A two-piece Structural Suggestion pairing stack-mechanism pieces (one stack
enabler/cap source, at least one per-stack payoff) whose joint DPS delta
exceeds either piece alone. A combo surfaces only past the **dominance filter**
— no constituent single may chart on its own (the ladder has no first rung)
AND the pair's delta must beat the best of them by the existing 1% tie
threshold — and applying it dispatches both changes at once.
_Avoid_: synergy pair, joint candidate; archetype is reserved for future
playstyle suggestions and must not be used for pairs.

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
- **VATS-Window DPS** is derived from **AP Uptime** and drives the suggestions
  ranking when VATS is emphasized — it is not the scenario's canonical DPS.

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
- "mode" meant both **Mode** (Live/PTS) and **Scenario** (Free Aim/VATS) —
  resolved: these are distinct axes.
- **Adrenal** referred to four distinct mechanics — resolved: the **Adrenaline
  perk** (+10%/kill-streak stack, `dbm`, max 10), the **Adrenal Reaction
  mutation** (+5%/stack, +6.25% with Strange in Numbers), the **Adrenal** legendary
  weapon mod (+10%/kill-streak stack, curve-driven, max 10), and the Adrenal
  legendary armor mod (scales DR+ER). All four share the kill-streak trigger
  (`p.killStreak` in `resolve.ts`'s `PLAYER_STATE_READERS`), but are separate
  mechanics. Barbarian, Mind Over Matter, and Thrill-Seeker's also read this same
  counter and are NOT part of the Adrenal family — reinforcing why the field is
  named generically (`killStreak`) rather than after any one consumer.
