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

**DBM** (Damage Bonus Mult):
Shorthand for the family of additively-stacked bonus modifiers feeding the
`dbm` parenthesis of the paper-damage formula, and its per-mechanic flavors —
CritDBM, SneakDBM, PowerAttackDBM, WeakptDBM — each a Bucket in its own right.
Defined once in `src/types/modifiers.ts`'s `Bucket` doc-comment; a conditioned
DBM entry (Down Ranger's Far-range bonus) is an ordinary `dbm` ADD gated by a
condition, not a separate mechanism.
_Avoid_: damage bonus, multiplier (too generic — say which DBM flavor).

**Bucket Regime**:
Which fold mechanism consumes a Bucket (`damageFold`, `dot`, `weaponStat`,
`critEconomy`, `apEconomy`, `playerStat`, `bootstrap`, or `unfolded`), and
whether the fold's result reaches anything (`hasEngineEffect`) — one table,
`BUCKET_REGISTRY` (`src/types/modifiers.ts`), answering both. `true` = modeled
end-to-end even when no shipped content moves DPS yet; `false` = NYI (the
picker's "no effect yet" badge means not implemented, not "0 with your build").
Its optional
`foldBase` and `deBased` fields also own non-default fold-output conventions
(defaults: 0 and false). `WEAPON_STAT_BUCKETS` and `INERT_ENGINE_BUCKETS` are
both defined in `src/types/modifiers.ts` alongside `BUCKET_REGISTRY` itself,
derived from it rather than hand-maintained — `effective-weapon.ts` and
`omods.ts` (the OMOD/consumable picker's "no engine effect" badge) only
consume them, so the picker can't silently drift from what the engine
actually wires.
_Avoid_: routing, dispatch.

**Fold**:
Combining all active modifiers on one bucket over an intrinsic base. The
arithmetic lives once in `foldOps` (`src/lib/engine/resolve.ts`) — additive,
not multiplicative — except the `spellMagnitude` regime (Field Surgeon &c.'s
Stimpak-healing multipliers), which composes multiplicatively via the
separate `foldBucketProduct`, since it models Bethesda perk entry points that
multiply rather than the additive damage-pool convention every other bucket
uses. See `docs/assumptions.md`'s "Formula structure" for the exact
expression — not repeated here to keep this file from becoming a third copy.
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
sustained`, NOT blended with Free Aim the way the scenario's canonical DPS
is — see `docs/adr/0007` for why.
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

**Resolved Player**:
The engine-ready player view produced by `playerAgg` in `resolveLoadout`
(`src/lib/loadout.ts`): buff-folded effective SPECIAL, folded
`playerDamageResist`, and every derived stat (`maxHealth`, `addictionCount`,
`strangeInNumbers`, …). Consumed by `ResolveContext.player` and
`PLAYER_STATE_READERS` (`src/lib/engine/resolve.ts`). Distinct from
`PlayerInput`, which is what the user configures and what persists.
_Avoid_: player conditions, resolved conditions.

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
TargetSection), computed by `src/lib/build-delta.ts`. In the codec, the
encode-side diff baseline and the decode-side seed **must be the same
object** (`createDefaultBuildState()`) — a field a user set to a value that
happens to equal a *different* default gets omitted from the wire and
silently comes back as the decode seed's value instead.
_Avoid_: diff, delta count (say Build Delta).

**Knob**:
One entry in `PLAYER_KNOB_REGISTRY` or `ENEMY_KNOB_REGISTRY`
(`src/types/knob-registry.ts`) — the UI-facing metadata (label, section,
clamp range, badge behavior) for one `ResolvedPlayer`/`EnemyConditions`
field. The registry is what lets
`ConditionsSection`/`TargetSection` compute their "N active" badges
data-driven, from the same source `codec.ts`'s `DERIVED_PLAYER_CONDITION_KEYS`
reads, rather than each section hand-maintaining its own non-default
checklist. A Knob is UI/persistence metadata about a field, not the field's
value — see **Build Delta** for the value-level "is this non-default" question
the badges ultimately answer.
_Avoid_: field, setting (too generic — Knob specifically means a
knob-registry entry).

**Loadout**:
The resolved, engine-ready view of a player build — weapon + OMODs + perks +
legendary perks + mutations + consumables assembled into the engine's
`ScenarioInput` by `resolveLoadout` (`src/lib/loadout.ts`).
_Avoid_: build (that's the user-facing config, `PlayerConfig`), config.

**Star Tier**:
The legendary-slot class (1★–4★) of an armor legendary effect, given by its
`ap_Legendary1-4` attach point. Each tier has a **Tier Budget** enforced in
the model, not just advice — see `docs/adr/0004`.
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
A bundle Structural Suggestion applying one whole stack-mechanism package (all
discovered payoff + contributor pieces that fit budget/slots) in one action
list, displayed under a succinct mechanism name ("Full Onslaught"), constituents
in the row tooltip, gated by the configurable combo gate policy — see
`docs/adr/0006` for the gate and the endogenous-vs-exogenous criterion.
_Avoid_: synergy pair, package, archetype (reserved for future playstyle
suggestions).

**Allocation Suggestion**:
A compound suggestion that spends free SPECIAL pool points to make a perk
slottable — `[special/set, perk action]`, labeled like `Better Criticals 2
(+1 LCK)`. Only emitted when the pool covers the deficit within the 15/stat cap;
the "over-budget suggestion" concept (unevaluated placeholder rows) is
deleted.
_Avoid_: over-budget suggestion, respec suggestion (changing allocation by
TAKING points from another stat is future playstyle-suggestion territory, not
this).

### Data pipeline

**Mode**:
The game-data variant, `live` or `pts`. One ESM is extracted today, so both
resolve to the same data. Mode is a comparison axis a build is evaluated *at*
(a parameter to `resolveLoadout`, every `@/data` accessor), never a property
a build *has* — lives in `GameModeContext`, not `BuildState`, never
persisted. See `docs/adr/0002` for why.
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
— VALUE and VISIBILITY overlay semantics are documented on that function's
own doc-comment (`src/data/dataset.ts`), not repeated here.
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

## Flagged ambiguities

- **Effective Stacks** vs raw stack sliders — resolved: **Effective Stacks** is
  the clamped value the engine reads (manual pin or **Sustained Stacks** average);
  the sliders store the raw/auto sentinel.
- **`playerDamageResist` base vs folded** — on `PlayerInput` it is the manual
  Berserker's knob (also the `damageResistGain` fold base in
  `derivePlayerStats`); on `ResolvedPlayer` the same key holds the folded output
  written back by `playerAgg`.
- **SPECIAL base vs effective** — on `PlayerInput` the seven SPECIAL keys are
  budget-enforced base allocation (1–15); on `ResolvedPlayer` they are
  buff-folded effective stats consumed by curve inputs and conditions.
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
  mechanics — see `docs/adr/0009` for the other, non-Adrenal readers of that
  same counter and why the field is named generically.
