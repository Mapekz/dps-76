# Data-Quality Review — Resolution Log & Remaining Queue

The 2026-07-10 user review (artifact:
https://claude.ai/code/artifact/0a55ffb9-16fe-4cb2-b633-7e89b1f75213; plan:
`~/.claude/plans/dps-todos-data-quality-review-md-let-s-curried-stream.md`)
resolved the six open items from the data-quality overhaul. What happened, and
what's still open:

## Resolved 2026-07-10

1. **Exclusion evidence** — signed off with corrections. Verified by esm walk:
   Grand Finale / Meadow Breeze NPC twins correctly hidden (player twins are
   separate obtainable records); Flatliner SpecialEffect is an empty marker
   OMOD (only `crGaussRifle` references it); `TEMPLATE_Mod_Legendary_*` are
   keyword-only authoring templates with zero references; no paints carry
   effect payloads; Nitro 5.56 receiver tier + glow reflex have `zzz_`-disabled
   COBJs (Dom Pedro ships .50); the 10mm SMG `suppressor_Base` is a dead record
   (no refs, no COBJ). RESCUED: the five `mod_Custom_TheVATSUnknown_*` variants
   (each grants real crit-perk ranks; weapon-restricted via
   `omodWeaponRestrictions`, slot patched via `weaponCorrections`).
2. **Two Shot** — golden case filled: 103 × 1.75 = **180.25** (pip-boy rounds
   to 180/181). Extraction's dbm +0.75 confirmed; wiki's +25% was wrong.
3. **Zero-modifier legendaries** — 66 → 35, via three extractor mechanisms:
   - `ActorValues` OMOD properties now route through the STAT_DamageVsPerk
     plumbing + `FALLBACK_AVIF_ROUTES` (DmgVs family, SPECIAL ×7, Stalker's,
     Heavy Hitter's, Pin-Pointer's, Bully's, Crippling, Basher's, Explosive),
     honoring itemLevel curve tables.
   - Curve-input AVs mapped: MutationCount (Mutant's), HungerThirstTier
     (Gourmand's), GHL_FeralTier (Lucid).
   - **Granted-perk chase**: Script MGEFs with "Perk to Apply" translate the
     PERK's entry points (Executioner's +0.5 @ ≤40%, Instigating +0.5 @ ≥60%,
     Pyromaniac's, Viper's, Last Shot, Encircler's, Fencer's...). The
     Instigating hand override was retired — ESM beats its description text.
4. **ATX weapons** — `^atx_` prefix dropped; obtainability admitted 8 shop
   weapons (The Invader, The Black Knight, Turkey Ripper, ...).
5. **Adrenal curve gate** — unchanged, still standing (check printed on every
   `--only buffs` run; the CLI bug persists).
6. **Max HP default** — kept at 300 (editable Conditions field exists).

## Resolved 2026-07-11 (condition kinds + UI inputs)

The "needs a first-class condition kind" group and the "UI inputs not yet
exposed" group both landed:

- **New condition kinds** (`src/types/modifiers.ts` + `resolve.ts` +
  `normalize/conditions.ts`): `lastRound` (Last Shot +100%, UI checkbox;
  Circuit Breaker's `< 1` spelling also translates, though its Apply Combat
  Hit Spell entry point stays unmodeled), `enemyHasActiveEffect` (Pyromaniac's
  fire / Viper's poison, +50%, target burning/poisoned checkboxes),
  `enemyGroupCount` (Encircler's ==1..4 / ≥5 tiers, +10–50%, group-size
  input defaulting to 1), `teammateCount` (Fencer's ==0..3 tiers,
  +12.5–50%, teammate input). Assumption trades documented in
  docs/assumptions.md: Viper's ImmuneToPoison row and Fencer's
  GetDistance<2500 rows are consumed.
- **UI inputs** (`ConditionsSection`): player `hungerThirstTier` (Gourmand's)
  and `feralTier` (Lucid) fields (0–8); a Target subsection with
  `healthPercent` (Executioner's/Instigating), `crippledLimbCount`
  (Bully's/Tormentor), `groupTargetCount` (Encircler's), and
  burning/poisoned checkboxes. The dead "Target at full health" checkbox and
  the `enemyFullHealth` condition kind were retired (Instigating reads
  `healthPercent` since 2026-07-10).
- **`playerIsGhoul` condition kind** (found en route): Gourmand's is gated
  human-only by `GetIsPlayerGhoul()=0`; a "Ghoul character" checkbox drives
  it, and the same kind resolves GHL_GlowingCriticals' `=1` gate.

## Remaining queue

### Needs an engine mechanic → SHIPPED via [engine-mechanics-push.md](engine-mechanics-push.md) (grilled + implemented 2026-07-11; Onslaught/Basher's/cripple-speed still parked per its decisions)
- Explosive: per-component 20% explosive twin through the full fold (Stage A1).
- Crippling: limb-condition only, no HP term — cripple-speed stat waits for
  phase-3 enemy limb HP. Basher's: stays inert + badged (user decision).
- Onslaught family (Furious, Pounder's, Splinter's, Whacker Smacker,
  Gunslinger/Guerrilla Expert+Master) — **RESOLVED 2026-07-12** — see
  [[onslaught]] (now a resolution log) and docs/assumptions.md "Onslaught".
  Combo-Breaker's was REMOVED from this family (corrected 2026-07-12): its
  granted perk uses EP79/EP27 AP-cost entry points gated by a random-percent
  chance, unrelated to the shared stack counter — still badged
  `pendingMechanic` pending the AP-economy work that would model it.
- Charged (4★): cadence model on top of a full power-attack model (Stage C);
  value hunt in AVIF/GMST is part of that stage.
- Thrill-Seeker's: killstreak-scaled reload/melee speed off adrenalineStacks
  (Stage C).
- Conductor's / V.A.T.S. Optimized: full steady-state AP economy with an
  "AP-limited" DPS line (Stage B); on-kill restores wait for enemy TTK.

### Still zero after the chase (Script with no Perk to Apply, or exotic entry points)
- ~~Head Hunter's~~ — NOT a real in-game effect (user-confirmed 2026-07-11;
  likely cut/unreleased record). Stays hidden; off the queue.
- Sniper's (`abPerkFortifyDmgFar` zero-magnitude — distance-scaled script):
  covered by the target-distance input (engine push Stage A3).
- Polished (curve input AV null): covered by the weapon-condition slider
  (engine push Stage A4, with Tarnished).
- Feral's, Barbarian, Fracturer's, Electrician's, Locked, Glowing, Ghost's,
  Vampire's, Suppressor's, Medic's, Durability, Pick Pocketer's, Nimble,
  Resilient, Steadfast, Defender's, Blocker, Stabilizer's, Lightweight,
  Inertial, V.A.T.S. Enhanced, Riposting.
  Utility ones stay hidden by the display rule; damage-ish ones need in-game
  measurement or a deeper script chase.

## Related follow-up plans
[[onslaught]] — RESOLVED 2026-07-12 (now a resolution log, not a deferred
plan). [[consumables-overhaul]] — still deferred by explicit scope decision
during the overhaul grill.
