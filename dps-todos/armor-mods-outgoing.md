# TODO: Armor Mods — Outgoing Damage (P1)

## What
Armor mods/legendary effects that boost the *player's* outgoing damage, as
distinct from incoming-damage mitigation ([armor-mods-incoming.md](armor-mods-incoming.md),
which is blocked on enemy mitigation landing).

## Corrected assumption (2026-07-13): this is not actually unblocked
The original scope note here read "No blockers — armor types already exist,
just unpopulated and unwired." Verified against code 2026-07-13: **no armor
OMOD/legendary extraction exists at all**. `scripts/extract/extract-omods.ts`
hardcodes `formType !== 'Weapon'` (~line 268) to skip everything but
WEAP-attached mods, so armor legendaries and 2-star SPECIAL mods have never
been chased from the ESM — `src/data/live/armor.ts` and
`src/data/live/power-armor.ts` are both flat placeholder resist tables (no
mod slots modeled at all). Building an armor-omod extraction path (new
`extract-armor-omods.ts`, or extending `extract-omods.ts`'s attach-point
matching to `ARMO`/`ARMA` records) is now a prerequisite for most of this
doc's scope — shared with [ap-regen.md](ap-regen.md)'s "Powered" chase and
with `armor-mods-incoming.md`.

## Scope — narrowed to specific mods (user priority call, 2026-07-13)

- **Unyielding**: +1 to all SPECIAL except Endurance when below ~20% HP.
  Feeds the existing STR melee-scaling term (`strengthTerm()` in
  `paper-damage.ts`) and the SPECIAL fold (`derivePlayerStats`,
  `src/lib/loadout.ts:105-115`) the same way consumable SPECIAL buffs already
  do — likely a new `scaledByMissingHealth`-gated SPECIAL-bucket modifier,
  reusing the `scaledByMissingHealth` condition kind already used for
  Bloodied. Not yet located in extracted data — needs the armor-omod
  pipeline above, then `esm-walk` to confirm the exact HP threshold.
- **Nocturnal**: CAUTION — a weapon legendary already named "Nocturnal" IS
  extracted (`mod_Legendary_Weapon1_DamageNight`,
  `src/data/live/generated/omods.json`, attach point `ap_Legendary1`): flat
  `+50% dbm` ADD, gated by an `unresolved` condition
  `GetValue(Invisibility)=0`. Before building an *armor* "Nocturnal", confirm
  via `esm-walk` whether this weapon effect is what's meant, whether a
  separate armor effect shares the name, or both — don't assume. Either way,
  the `Invisibility` gate needs resolving (check `resolve.ts` for an
  existing stealth/detection condition kind first; this may actually be a
  time-of-day check rather than a sneak-state check — confirm before
  modeling).
- **2-star SPECIAL armor bonuses** (flat +1 to a SPECIAL stat, any armor
  piece's 2-star mod slot): not yet located; needs the armor-omod pipeline.
  Once found, likely reuses the same SPECIAL-bucket fold as Unyielding.
- **Optimized Bracers**: FOUND — power-armor intrinsic perk family
  `PA_OptimizedBracers` (`src/data/live/generated/perks.json:19954`, formId
  `0x00183549`), description "Power attacks cost 25% less" (an AP-cost
  reduction on power-attack, not a `dbm` modifier — feeds `vatsApCost`/
  power-attack AP cost). `modifiers: []`, `hasCard: false` (granted by a
  power-armor piece/mod, not a chosen perk card), completely unwired —
  `power-armor.ts` has no mod-slot modeling at all. Needs: figure out which
  PA torso mod grants this perk (likely also needs the armor-omod pipeline,
  scoped to power-armor `ARMA` records specifically), then wire the AP-cost
  reduction the same way OMOD-sourced `vatsApCost` modifiers already fold.
- **Auto-Stim legendary / Medic Pump**: user-named HP-regen sources for a
  "blood sacrifice" VATS build (spends HP instead of AP for VATS shots).
  Not yet located in any generated data — `esm-walk` from scratch to confirm
  exact names/mechanics. Note this interacts with AP economy
  ([ap-regen.md](ap-regen.md)) more than pure damage — likely needs an
  HP-regen concept in the engine that doesn't exist yet, not just a `dbm`
  bucket. Scope narrowly to the DPS-relevant angle (does HP-for-AP spending
  change sustained DPS); a full HP-pool/regen model is out of scope unless
  it gates a damage number.
- "A handful of other legendary mods" (unnamed by the user): sweep broadly
  once the armor-omod pipeline exists rather than hand-picking beyond the
  above blind — see what else falls out of the same extraction pass for
  free before deciding what's in scope.
- **Zealot's** (+damage vs Scorched/Scorchbeast, carried over from the
  original scope): needs an `enemyType`/`enemyTypeAny` condition value for
  these two factions — same condition kind `phase-3-enemies.md` plans to
  activate via `EnemyProfile`. Could ship with a manual "vs
  Scorched/Scorchbeast" checkbox in the interim (matching the project's
  pattern of shipping a manual toggle before the full enemy-aware condition
  system lands elsewhere, e.g. `isSneaking`) — lower priority than the
  items above per the user's 2026-07-13 reprioritization.

## Where to implement
1. Armor-omod extraction (new prerequisite — see "Corrected assumption"
   above).
2. Bucket/condition wiring per the CLAUDE.md new-mechanic checklist per
   effect: SPECIAL-bucket reuse + `scaledByMissingHealth` for Unyielding and
   the 2-star bonuses; a new condition kind for Nocturnal's invisibility/
   time-of-day gate if `resolve.ts` doesn't already have one; `vatsApCost`
   fold extension for Optimized Bracers; likely new engine concept for
   Auto-Stim/Medic Pump (design after `esm-walk` confirms the mechanic).
3. Populate `src/data/live/armor.ts` / `power-armor.ts` for real (both are
   currently ~3-12 line placeholder resist tables with no mod slots).
4. Wire `playerConfig.armor` into `resolveLoadout` (`src/lib/loadout.ts`) —
   currently never read.
5. UI: an armor + power-armor picker component (none exists yet — closest
   precedent is the weapon-mod pickers in `src/components/build/WeaponSection.tsx`).
6. `docs/assumptions.md` entry per effect with a source comment (form IDs
   above where already known; Nocturnal's actual mechanic once confirmed).

## Verification
Golden case or in-game measurement for at least: Unyielding active below the
HP threshold, Optimized Bracers' power-attack AP-cost reduction, and one
2-star SPECIAL bonus. Zealot's vs. a Scorched enemy if it ships in this pass.
