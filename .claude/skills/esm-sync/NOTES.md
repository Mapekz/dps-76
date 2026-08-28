# esm-sync campaign notes (working file — becomes SKILL.md in Phase 5)

## Sign-off gate outcomes (2026-08-28, user decisions of record)

- **Auras: model all three** (Tesla Coils ESM-proven 20/tick ×5 curve area 10;
  Miasma behind measured-pending flag; Plague Walker + disease input). New
  parallel stream per ADR-0020 precedent → needs its own ADR.
- **Retaliation family: keep unmodeled** → issue #88 (wontfix/tracking).
- **New state approved**: standing-still toggle (IsMoving()=0, 13 modifiers);
  Gun Fu target index. Blitz NOT selected. AP-refund procs (Grim Reaper's,
  Combo-Breaker, bulletStormOnKill) + Gun Fu UI shape PENDING RESEARCH:
  user asked how established DPS calcs treat on-kill procs (sim vs stack
  sliders) and multi-target sequences — web-research agent dispatched.
- **Scope adds approved**: LGN legendary SPECIAL cards, ghoul-race perk
  family, grenade damage axis (STAT_DmgGrenade).
- Pile-1 mechanical fixes pre-approved and in flight (task F): Quick Hands,
  range perks, DamageResist Value-Modifier widening, unarmed AVs, 4LC
  crit-fill, Brawler/IgnoreArmor linings, Voice of Set (contradiction
  resolved: Target Type 1 = touch, enemy-directed; "self-targeted" note was
  a misread), LGN SPECIAL, LGN_Retribution, V63 penetrating, trivial ench
  gates.

Running log of the 2026-08-27… full-audit campaign (plan:
`~/.claude/plans/update-the-dps-calc-flickering-yao.md`). Capture traps as hit,
not from memory. Untracked until the skill ships.

## Phase 0 — sync 20260814 → 20260821 (2026-08-27)

Sequence run:

```bash
cp src/data/live/generated/_meta.json <scratch>/meta-<old>.json   # gitignored — only baseline
bun run audit:inert --mode live > <scratch>/inert-before.txt
bun run extract --mode live          # --esm omitted; FO76_ESM_PATH already new snapshot
# review: _meta.json esmDate/counts/unresolved vs baseline
bun run extract:diff                 # weapons+omods only; pair with git diff --stat
git diff --stat src/data/live/generated/ src/data/live/curvetables/
bun run vet:weapons                  # exit 1 = roster delta needs adjudication
bun run wire-dict:build -- --dry-run # exit 1 = RENAMED/MISSING needs decision
bun run audit:inert --mode live > <scratch>/inert-after.txt && diff them
```

Outcome: **byte-identical generated output**; no commit made (do not manufacture
a sync commit when the diff is empty — provenance lives in gitignored _meta.json).

Observations worth keeping:

- Full 12-pass extraction wall-clock: **~3.5 min** with a warm
  `Data/<snapshot>/esm_cache/` (nothing in repo documents this; measured
  2026-08-27, ~11k records).
- The patch-notes artifacts (`Data/notes/<old>_to_<new>/diff.json`) predicted the
  no-op exactly — reading them FIRST scoped the entire sync in minutes. Census
  the record types in `diff.json` yourself (WEAP/PERK/MGEF/OMOD/CURV/GLOB/GMST…)
  rather than trusting the prose.
- Source-side RACE records permuted bone-scale/attack arrays with identical
  values; extracted `bodyparts.json` came out byte-identical anyway — the
  extractor's output is order-stable for that class of churn. Don't pre-emptively
  add sorting.
- `_meta.json.unresolved` was **set-identical** (3441) across the two dumps —
  it's a deterministic function of ESM content, so it doubles as a regression
  fingerprint.
- Baseline `counts` (20260821): weapons 282, perks 769, armor 1830, omods 2480,
  armorOmods 5569, uniques 93, mutations 19, consumables 444, addictions 12,
  bodypartRaces 83, healingItems 5, curvetables 315, npcs 83, constants 1,
  dfobs 18. Extractor stderr also prints: unknown entry points 112, unmapped
  AVIFs 1, unresolved conds 132, unresolved cards 1, omod unknown properties 1,
  weak-evidence review 673, consumable notes 1423, npc unresolved 1.

## Phase 1 — audit tooling (done; commits 4d258f8, 01adc65, b5cc7d7)

Traps for the skill:
- A fresh-from-this-ESM extraction is the auditor's calibration input: ANY
  tier-1/2 mismatch is then a comparison bug by construction. Tier-2 must
  compare against extractor RE-DERIVATION, never raw ESM fields.
- Tier-3 crediting must credit notes describing the CHASED mechanism (not the
  carrier's edid) and Include-derived output on child records.
- 2926 findings → 82 real across two fix rounds; the 82 became the sweep worklist.

## Phase 4 round 1 (done; commit ded3ad0) — lessons

- **Fixture-pass/live-fail split**: fixture tests exercised translateGrantedPerk
  while live perks flow through extract-perks.ts, which bypassed new routes.
  Any new EP route MUST be wired through the shared
  resolveDirectEntryPointModifiers and tested via BOTH paths.
- Chance-fold shape: GetRandomPercent must fold INTO the value (EP-198/199
  pattern); `SET 1 + unresolved condition` is a landmine (drops to 100%).
- Unknown EPs: report the dedup `unknown entry point:` line ONLY — dumping
  per-record condition leftovers for unroutable EPs ballooned unresolved +516.
- Live re-extract after every extractor change round; the unresolved set-diff
  (baseline vs new) is the fastest truth about what a change actually did.
- unresolved: 3441 → 3337 (classified 2294 / unclassified 1043) after round 1.

## Browser verify pass (2026-08-28) — GREEN, 2 findings

Verified live in the app (claude-in-chrome; chrome-devtools MCP was held by a
peer session — fallback works fine): standing-still toggle renders with
correct helper text; Gun Fu ±0% in picker at default, selector chips appear
only when equipped, 2nd target moved VATS 1,604→1,616 with Free Aim untouched,
"Why these numbers" itemizes Gun Fu +30%, state round-trips through the share
URL (ordinal 62); Tesla Coils aura renders "+5.0/s" as its own results line
(magnitude confirms curve-overrides-magnitude); Plague Walker badges honestly
inert (disease gate); zero console errors across the whole interaction.

Findings → fixed/filed: armor-effect badge ignored auraChase (fixed 9f07f92 +
invariant test updated for ADR-0023); pre-existing Base UI slider max<=min
warning at load (filed #90, cosmetic).

Verify-skill traps: a11y `find` can return stale refs across accordion
re-renders — re-find after any section toggle; the accordion trigger rows are
tall, click the label text not the row edge.

## Aura stream (ADR-0023, H+H2) — lessons

- Tesla per-tick = **5**, not 20 or 100: multi-point curve OVERRIDES Effect Item
  magnitude per the shared ModifierValue contract; auraChase must emit curve-only,
  never ambiguous amount+curve. The 20×5 alternative documented as unverified.
- Plague Walker: the CLOAK spell's magnitudes (10/12) are NOT the damage — the
  real rows live one hop deeper (Mutation_PlagueWalkerDamage[Super]), disease-
  count-scaled 5→25 / 6.25→31.25. Walk to the actual Damage-archetype MGEF
  before trusting any cloak-level magnitude.
- Miasma-style perk-mediated chains need Ability-branch aura bubbling; the
  ENCH-mediated (Tesla) and perk-mediated (Miasma) chains are distinct shapes.
- Aura conditions: constant-fold IsHostileToActor/PvE OR-groups with
  subjectIsTarget; remaining unresolved gates → present-but-inert stream
  (auraHasEngineEffect), never silent drop.
- Choo-Choo supersession: PainTrainWeapon is the PA sprint-ram pseudo-weapon,
  never in the roster — the earlier "needs GetIsID modeling" note is void;
  classified out-of-scope in batch 4.
- Backlog after batches 1-4 + rounds F/F2/G/H/H2: total 3296, classified 2836
  (57 rules), unclassified 460.

## Phase 2 worklist — structural census of the 3441 (2026-08-27)

Message-pattern census (not record-prefix — the same record spreads across classes):

| class | n | shape / dominant members |
|---|---|---|
| MGEF no-route-for-AV | ~800 | `MGEF X: no route for AV Y — needs map`. Rads-eating 221, SURV_Hunger 180, SURV_Thirst 136, AddictionAlcohol 43, GHL_SURV_Feral 29, MutationCount 19, CarryWeight 13, STAT_XPMult 11, HealRate 10 — survival/QoL AVs, mostly out-of-scope for a DPS calc |
| ActorValues unmapped | ~500 | `ActorValues on X — unmapped`. Excavator-PA 143, CarryWeight 59, ArmorShadowHide 17, ReflectMeleeDamage 14, FallingDamageMod 13, **Mod_IgnoreArmor_AV 12 (armor pen!)**, STAT_LimbDamageResistance 11, **Mod_Brawler_AV 11, Mod_Stabilized_AV 11, UnarmedDamage 10, Mod_ReducedPowerAttack_AV 22** — the bolded ones are damage-relevant and need real adjudication |
| MGEF archetype | 628 | Jetpack 315, Script 197, Cloak 55, Unknown 22, Light 19, Absorb 12 — Jetpack/Cloak/Light = out-of-scope; Script = case-by-case (AlienDisintegration lives here) |
| conditions (non-ench) | 437 | `HasPerk(PA_RadScrubbers)=0` ×221, Spotlight_BrewHaha ×43, VaultFed ×29, RustyKnuckles AV ×34, IsMoving ×17, IsWeaponMagicOut ×10, GetRandomPercent ×~90 total (proc chances — damage-relevant) |
| unknown entry point | 112 | ~110 distinct, one each: mostly QoL (Mod Item Weight, Mod Detection …); damage-adjacent few: **Mod VATS Penetration Min Visibility, Apply Combat Melee Spell, Apply Weapon Swing Spell** |
| zero-magnitude/no-curve | 88 | Recon scopes ×~40, PA APRegen legs — script/scaled effects |
| weap-ench conditions | 49 | IsEssential/GetDead/DailyOps gates (NPC-facing), PaddleBall GetRandomPercent procs |
| weap-ench MGEF archetype | 15 | Script 11, Stagger 4 (RailwayRifle/PaddleBall stagger) |
| modeled-elsewhere skips | ~100 | `PerkHappyGoLucky*FortifyLuck skipped — modeled by Happy-…` 78, LiveLove 19 — already-accounted markers, classify as such |
| misc singletons | rest | BlackWidow/LadyKiller GetIsSex, crDeathclaw NPC perks (GetCombatGroupMemberCount — enemy-side perks), SheepsquatchShard DoT input AV 0x32C, CompoundBow no-default-combo |

Adjudication order (leverage-first): damage-relevant AV unmappeds → GetRandomPercent
procs → entry-point shortlist → then the mass out-of-scope rules (survival AVs,
Jetpack/Cloak, PA QoL, NPC-only gates), which clear ~2500 entries via ~a dozen
classification rules.

Two distinct backlogs — don't conflate (learned 2026-08-27): `_meta.json.unresolved`
= extractor DROPPED it (nothing in generated data); `audit:inert`'s "unresolved
condition raw strings" = extractor KEPT the modifier but its condition is
`kind:'unresolved'` (modifier exists, never fires). dn_VaultSuitLining/Luck-ladder/
IsMoving gates are the second pile, adjudicated in the conditions triage, not via
classification rules.

### Tier-3 audit residue adjudication (2026-08-27)

The 1133 tier-3 findings collapse to a handful of real gaps. Root cause of the
bulk: **auditor note-crediting bug** — it looks for the source property's literal
formid/edid inside notes[], but real notes describe the chased deeper mechanism;
it also doesn't credit Include-derived output back to the child record (all 240
DamageTypeValues findings — extract-omods.ts lines ~926-980 handles them fine,
verified all 240 have matching baseDamage+damageTypeScope modifiers). TOOLING
TODO: teach audit-records.ts note/Include crediting.

Real gaps, ranked:
1. **HIGH enchArmorIgnoreArmorMod** — flat −5 enemy DR melee/unarmed (DLC03 Marine
   lining), obtainable, self-flagged "needs override", never written.
2. **HIGH enchArmorBrawlerMod** — flat unarmed/H2H DBM, same lining family, same gap.
   ⚠ Brawler + IgnoreArmor linings confirmed via TWO routes (AV write per-piece
   scaling AND enchantment flat add) — implement ONE, don't double-count.
3. **HIGH FourLeafClover** — AbPerkFortifyVATSCritFillOnMiss, LCK-scaled crit-meter
   fill on VATS miss; feeds existing crit-meter.ts; currently zero output.
4. MED ench_LegendaryArmor_{Toxic,Burning,Frozen,Electrified} — 5% on-hit elemental
   DoT (melee/unarmed legendary armor); scope call (retaliation-adjacent but fires
   on player hit? — verify direction when implementing).
5. LOW Sawbones/PainKiller/Rushing sustain enchs — genuinely silent, non-damage;
   note-only fix.
6. Pre-existing self-flagged, scope questions for user: STAT_DmgGrenade (grenade
   damage — GHL_BombScientist), ghoul-race perk family modeling, 7
   LGN_Legendary<SPECIAL>_Perk legendary-card SPECIAL bonuses.

Confirmed benign: all 47 OverrideProjectile (no Explosion flag or zero-damage
EXPL — game-accurate no-ops; Thirst Zapper picker-visibility is a separate
display-rule question, NOT a damage gap); Pounder's consecutive-hits (already
modeled via onslaughtMaxStacks +10, EP is a deliberate duplicate of EP189/190).

### Override hand-verification vs 20260821 (2026-08-27) — ALL CLEAN

- `weaponCorrections` (14): 10 INNR-baked names — FULLs still bare stems, dn_CommonGun
  still referenced; ProtestSign FULL still sign-text variant; Unarmed renames still
  apply; GatlingGun Speed still 1.0 (animDurationSec 0.5 is in-game-measured).
  No entry removed, none introduces error.
- `forceVisibleWeaponIds` (2) + `forceVisibleOmodIds` (13): all 15 still
  obtainable:false in the fresh extraction — every rescue still needed.
- Verification method for the skill: batch `esm get <ids> --json` + grep FULL/INNR/
  Speed; rescue redundancy = check `obtainable` in fresh generated JSON.
- Side-find: omod-corrections.ts's Thirst Zapper comment already documents the
  projectile-swap extraction blindness that the auditor's OverrideProjectile
  class (47 findings) quantifies — fixing that class surfaces the Nuka-Cola
  magazine conversions in the picker.

### Proc + entry-point adjudications (ESM-walked, 2026-08-27)

GetRandomPercent (98 lines → 44 records): most already modeled (Unstoppables via
buff-overrides, EP-172/198/199 buckets) or out-of-scope (P62 cut, POST_/CUT_ melee
shock tree, Dogmeat, loot/economy, Ghost's cloak, plasma disintegrate VFX).
Genuinely open:
- **Combo-Breaker's** (`mod_Legendary_Weapon4_Melee_ComboBreaker`): 50%/10% chance
  to not consume VATS/PA AP — real legendary, 0 modifiers today; ap-economy shape.
- **PaddleBall stagger** 30/25/15/10% — CC rider, model only if CC ever modeled.
- Elemental armor legendaries (Toxic/Burning/Frozen/Electrified ×8): retaliation
  damage on being hit — scope call for the user (enemy-facing damage output but
  triggered defensively).
- **Voice of Set / Eye of Ra**: +35 (70 + 25% paralyze) electric vs robots on hit,
  obtainable, dropped by the EP51 chase (duration:1 DoT misses the duration===0
  instant branch). CONTRADICTION to resolve first: extractor note says
  "self-targeted damage" but Contact delivery reads enemy-directed. Walk before fixing.

Unknown entry points (112 distinct): **the headline finds — real, obtainable,
mainline perks with 0 modifiers, 0 notes (silent inert):**

| perk(s) | EPs | note |
|---|---|---|
| **Gun Fu 1-3** | Mod VATS Gun-Fu 2nd/3rd/4th+ Target Dmg Mult | needs per-target-index VATS condition |
| **Blitz** | VATS Blitz Max Distance / Dmg Bonus Dist / Max Dmg Mult | distance-scaled VATS melee dmg |
| **Bandito, Crack Shot, Long Shot, Scoped-up, Love the Spread** | Mod Gun Range Mult | feeds the ALREADY-MODELED range-falloff input — cheapest big win |
| **Hack and Slash** | Mod VATS Splash Damage (+Radius) | melee AOE in VATS |
| **Grim Reaper's Sprint** | Mod VATS Player AP On Kill Chance | AP refund on VATS kill → crit-meter/sustain |
| **Quick Hands** | Auto Fill Weapon Clip | CONFIRMED (esm refs + generated: 0 mods): map EP into `reloadSkipChance` in ENTRY_POINT_BUCKETS — one-line-ish |
| Pin-Pointers | Mod Attack Damage On Striking Appendage (+50%) | DEAD CONTENT (USER-CAUGHT 2026-08-28): the whole grant chain (ench_LegendaryWeapon_PinPointers 0x007ACA02 → AddPerk → SPEL → ApplyPerk 0x007ACA08) is an orphan island — the ENCH has zero references, the shipped OMOD carries only the keyword add + STAT_DmgVsWeakSpot AV write. In-game effect = +20% weakpoint only, which IS modeled. |
| Nitro Fortunate | Mod Add Bullet To Clip Chance | same shape as ammoFreeChance |
| Kinetic Lining / Optimized Bracers | Restore Action Cost / Power Attack AP | ap-economy pile |
| Basher | Mod Outgoing Limb Bash Damage | blocked on known bash-NYI, not a new gap |

QoL remainder = 69 EPs in 7 named classes (social/event 17, crafting/economy 16,
survival misc 13, lockpick/hack 7, detection/stealth 7, item-condition 5, XP 3,
movement 1) — one classification rule per class sweeps them.

### Unmapped-AV adjudications (ESM-walked, 2026-08-27)

Ranked by the investigator's confidence/effort; dispositions pending user sign-off
at the triage gate:

| AV | mechanism | verdict |
|---|---|---|
| SheepsquatchShard `DamageDamageResistEffect` | on-hit target-DR shred 0.5/5s, identical mechanic to the armorPenFlat Contact routing (45f5fe1) — unrouted ONLY because archetype is `Value Modifier` not `Peak Value Modifier` (mgef.ts ~1337 + FALLBACK_AVIF_ROUTES DamageResist ~635 both hard-restrict) | **model, armorPenFlat** — widen archetype accept; verify 0.5 = total vs per-second first |
| Mod_Brawler_AV | armor-lining set: +0.1/piece private AV → `Mod Weapon DMG Bonus Mult`/Add AV Mult ⇒ **+10% unarmed DBM per piece** (5-6pc ≈ +50-60%), COBJ-craftable | **model, dbm** ADD 0.1 scoped unarmed/H2H; existing per-piece armor scaling fits |
| UnarmedDamage / UnarmedEnergyDamage | native STAT_WeaponDamageKeyword AVs; PA Hydraulic/Tesla Bracers flat point ADDs on top of unarmed WEAP base | **model, baseDamage** flat, scoped WeaponTypeUnarmed; needs 2 explicit FALLBACK_AVIF_ROUTES entries (no STAT_Dmg* prefix so the catch-all misses) |
| Mod_IgnoreArmor_AV | melee armor-pen lining: +0.1/piece → target DR ×(1−0.1·pieces); SAME perk also has flat −5/−10 ADD rows already routed to armorPen | model, armorPen % arm — **AMBIGUOUS double-dip** (flat rows + % row simultaneously?) — needs in-game verification before wiring |
| SheepsquatchShard poison DoT | curve keyed on AV 0x32C = **PlayerLevel** (engine-hardcoded, no AVIF), 34→112 dmg over lvl 1→50 | model eventually — needs new `CurveInput: 'playerLevel'` axis; biggest lift, single niche weapon |
| Mod_Stabilized_AV | scope sway/stability (`Mod Actor Scope Stability`) | out-of-scope: accuracy QoL |
| Mod_ReducedPowerAttack_AV | power-attack AP cost mult | out-of-scope for paper damage (future ap-economy candidate) |
| STAT_LimbDamageResistance | wearer limb-crippling resistance (≠ STAT_DmgLimbs/Crippling!) | out-of-scope: defense |
| ReflectMeleeDamage | Punishing reflect — already deliberately excluded (armor-corrections.ts comment) | out-of-scope, already dispositioned |

### Cluster adjudications (ESM-walked, 2026-08-27)

| cluster | n | verdict |
|---|---|---|
| P62 Ruiner's (both ids) | 44 | out-of-scope: unreleased Drifter-season content, `obtainable:false`, zero reverse refs. **TRAP**: extractor emitted `wholeDamage ADD 500` with all four gates parked `kind:'unresolved'` — a forceVisible rescue without an extractor fix ships an unconditional +500. |
| Mutation_Chameleon | 14 | out-of-scope: pure stealth/invisibility plumbing, nothing offensive |
| HTO_crFortifyDamage_* | 35 | out-of-scope: NPC-side event buff (67 HTO boss NPC reverse refs); rule already seeded |
| Lucid legendary armor | 16 | out-of-scope: incoming-damage reduction (EHP), engine models offense only |
| RelicReaper Can-Do/CapCollector/PharmaFarma | 27 | out-of-scope: Luck-scaled loot-quantity mods on the unique Shovel |
| Brews (all families) | ~100 | out-of-scope: thirst/addiction/rads/AP-cost plumbing; alcohol-gated OFFENSE already modeled via underAlcoholEffect. Gulpershine's ToxicGin enemy -15% dmg debuff = enemy-output, still out of scope |
| Bloodpack Glowing/Irradiated | 16 | out-of-scope: ghoul-feral survival consumable plumbing |
| mod_Description_MoM_VoiceofSet | 8 | **extraction-fix candidate**: robot-only on-hit shock proc (35, or 70+25% paralyze with Eye of Ra) dropped — `chaseGrantedSpell` (normalize/mgef.ts) instant-damage branch requires `duration===0`, this DoT has duration:1. Base +20% ballistic already modeled. enemyType condition machinery already exists. |
