/**
 * The memoized sub-steps `loadout.ts`'s `assemble()`/`resolveLoadout()` are
 * composed from — moved out of `loadout.ts` itself so that file reads as
 * pure domain composition (which 9 modifier sources get gathered, in what
 * order) without the ~400 lines of caching plumbing that exist solely to
 * serve `src/lib/suggest/evaluate.ts`'s ~600-candidate-per-edit suggestion
 * sweep interleaved into it. See `loadout.ts`'s own module doc-comment for
 * why `resolveLoadout` takes an opt-in `scope` at all.
 *
 * Each `scoped()`-wrapped function below mirrors ONE call `assemble()` used
 * to make directly: with no `scope` (every caller except the suggestions
 * sweep) it's a plain passthrough to the wrapped computation. With a `scope`
 * (`evaluateSuggestions`), it's a `Map` lookup keyed on the call's own
 * argument tuple — see docs/adr/0001: this composition/caching lives here in
 * src/lib, the engine (src/lib/engine/**) stays untouched and
 * data-adapter-free.
 *
 * A "leaf" wraps one data-layer read directly. A "composing" function
 * (plain, not itself `scoped`) gathers several leaves' results and hands
 * them to its OWN `scoped()`-wrapped aggregator — so the aggregator's
 * parameter list IS its cache key, with no separately maintained list to
 * fall out of sync.
 */

import type { PlayerConfig, EnemyConfig, GameMode, Weapon } from '@/types';
import type { PlayerConditionContext, PlayerInput } from '@/types/player';
import { CONSUMED_BEFORE_BUCKETS, type Modifier } from '@/types/modifiers';
import type { GeneratedOmod } from '@/types/generated';
import { getSpecialClamp } from '@/data';
import { getEquippedPerkFamilyRanks, getLoadoutModifiers } from '@/data/perk-modifiers';
import { getArmorEffectModifiers, getArmorEffectWornPieceCounts } from '@/data/armor-modifiers';
import { getDefaultOmods, getOmodById } from '@/data/omods';
import { getAddictionModifiers, getBuffModifiers, getSuppressedAddictions } from '@/data/buffs';
import { consumablesById } from '@/lib/consumable-rules';
import { getManualUptimeModifiers } from '@/data/manual-uptime';
import { getPlayerBaselineModifiers } from '@/data/player-baseline';
import { getTargetDebuffModifiers } from '@/data/target-debuffs';
import { getPublicTeamModifiers } from '@/data/public-teams';
import {
  buildEffectiveWeapon,
  SUSTAIN_CHANCE_BUCKETS,
  WEAPON_STAT_BUCKETS,
} from '@/lib/engine/effective-weapon';
import { legendaryBonusOf } from '@/data/perk-budget';
import { resolveTargetBodyPart, getEnemyTypeIds } from '@/data/bodyparts';
import { getNpc } from '@/data/npcs';
import { getEnemyDefenses } from '@/lib/enemy-defenses';
import {
  deriveClassFreakRank,
  deriveHungerThirstTier,
  derivePlayerStats,
  deriveStrangeInNumbers,
  SPECIAL_KEYS,
  type DerivedPlayerStats,
  type SpecialKey,
} from '@/lib/player-stats';
import {
  createArrayInterner,
  createRecordInterner,
  scoped,
  type MemoScope,
} from '@/lib/loadout-memo';

// getPlayerBaselineModifiers() takes no arguments and its result never
// varies (see that function's doc-comment) — hoisted to a module-level
// constant rather than a per-call allocation, unconditionally (this is safe
// for every caller, not just the memoized sweep path).
const PLAYER_BASELINE_MODIFIERS: Modifier[] = getPlayerBaselineModifiers();

/**
 * Base SPECIAL fed to the stat folds: the user-defined allocation stored in
 * conditions + Legendary SPECIAL card bonuses (+1/+2/+3/+5 by rank, on top of
 * base — they raise the stat as well as the perk-point budget). Not itself
 * `scoped()` (cheap, pure arithmetic over already-resolved inputs), but
 * exported here rather than from `loadout.ts` since `derivedPlayerStatsFor`
 * below needs it and `loadout.ts`'s own `resolveStats` is its only other
 * caller — keeping it in this file avoids a circular import between the two.
 */
export function baseSpecialOf(
  legendaryPerks: PlayerConfig['legendaryPerks'],
  conditions: PlayerInput,
): Record<SpecialKey, number> {
  const legendaryBonus = legendaryBonusOf(legendaryPerks);
  return Object.fromEntries(
    SPECIAL_KEYS.map((key) => [key, conditions[key] + legendaryBonus[key]]),
  ) as Record<SpecialKey, number>;
}

export const equippedOmodsFor = scoped(
  (
    mode: GameMode,
    baseWeapon: Weapon,
    weaponConfig: NonNullable<PlayerConfig['weapon']>,
  ): GeneratedOmod[] => {
    const chosenMods = weaponConfig.mods ?? {};
    const equippedOmodIds = [
      ...Object.values(chosenMods),
      ...(weaponConfig.legendaryEffects ?? []),
    ].filter((id): id is string => !!id);
    return [
      ...equippedOmodIds.map((id) => getOmodById(mode, id)).filter((o) => o !== undefined),
      // Undecided slots carry the weapon's real standard parts (no weapon
      // instance has an empty slot) — getDefaultOmods skips decided slots,
      // so an explicitly chosen mod is never double-counted.
      ...getDefaultOmods(mode, baseWeapon, chosenMods),
    ];
  },
);

export const strangeInNumbersFor = scoped(
  (perks: PlayerConfig['perks'], conditions: PlayerConfig['conditions']): boolean =>
    deriveStrangeInNumbers(perks, conditions),
);

export const classFreakRankFor = scoped((perks: PlayerConfig['perks']): number =>
  deriveClassFreakRank(perks),
);

export const underAlcoholEffectFor = scoped((mode: GameMode, consumables: string[]): boolean =>
  consumables.some((id) => consumablesById(mode).get(id)?.category === 'alcohol'),
);

export const equippedPerkFamilyRanksFor = scoped(
  (
    mode: GameMode,
    perks: PlayerConfig['perks'],
    legendaryPerks: PlayerConfig['legendaryPerks'],
  ): Record<string, number> => getEquippedPerkFamilyRanks(mode, [...perks, ...legendaryPerks]),
);

const wornPieceCountsRaw = scoped(
  (mode: GameMode, armorEffects: Record<string, number>): Record<string, number> =>
    getArmorEffectWornPieceCounts(mode, armorEffects),
);
/** Interns the raw counts (same trick as `internNonWeaponStatModifiers` below, for a Record instead of an array) so two candidates with the same worn-piece counts collapse to the SAME reference despite `getArmorEffectWornPieceCounts` allocating fresh each time. */
const internWornPieceCounts = createRecordInterner<Record<string, number>>();

export function wornPieceCountsFor(
  scope: MemoScope | undefined,
  mode: GameMode,
  armorEffects: Record<string, number>,
): Record<string, number> {
  return internWornPieceCounts(scope, wornPieceCountsRaw(scope, mode, armorEffects));
}

export const suppressedAddictionsFor = scoped(
  (mode: GameMode, consumables: string[]): Set<string> =>
    getSuppressedAddictions(mode, consumables),
);

/** The aggregation step of `countedAddictionsFor` — keyed on `addictions` and the (already-memoized, so referentially stable) `suppressed` set, not on `consumables` directly. */
const countedAddictionsAgg = scoped((addictions: string[], suppressed: Set<string>): string[] =>
  addictions.filter((id) => !suppressed.has(id)),
);

export function countedAddictionsFor(
  scope: MemoScope | undefined,
  mode: GameMode,
  addictions: string[],
  consumables: string[],
): string[] {
  const suppressed = suppressedAddictionsFor(scope, mode, consumables);
  return countedAddictionsAgg(scope, addictions, suppressed);
}

/** Shared by perk-family and legendary-perk-family loadout modifiers — one wrapper, two call sites distinguished by their own arguments. */
export const perkFamilyModifiersFor = scoped(
  (mode: GameMode, loadouts: PlayerConfig['perks']): Modifier[] =>
    getLoadoutModifiers(mode, loadouts),
);

export const buffModifiersFor = scoped(
  (mode: GameMode, mutations: string[], consumables: string[]): Modifier[] =>
    getBuffModifiers(mode, mutations, consumables),
);

const addictionModifiersAgg = scoped((mode: GameMode, counted: string[]): Modifier[] =>
  getAddictionModifiers(mode, counted),
);

export function addictionModifiersFor(
  scope: MemoScope | undefined,
  mode: GameMode,
  addictions: string[],
  consumables: string[],
): Modifier[] {
  const counted = countedAddictionsFor(scope, mode, addictions, consumables);
  return addictionModifiersAgg(scope, mode, counted);
}

// These three take only the 1-2 specific PRIMITIVE fields their data-layer
// function actually reads off `conditions` — not the whole object — so a
// candidate that replaces `conditions` wholesale (any perk/armor/consumable
// change routes through `deriveConditionsFor`, which — even after its own
// interning below — legitimately produces a new reference whenever e.g.
// `equippedPerkRanks` really changes) still hits these caches as long as its
// OWN couple of fields didn't move. `getManualUptimeModifiers`/
// `getTargetDebuffModifiers` are themselves narrowed to `Pick<...>` those
// same fields (manual-uptime.ts, target-debuffs.ts) so this isn't a
// standalone convention to keep in sync by hand — the data-layer function's
// own signature is the narrowing.

export const manualUptimeModifiersFor = scoped(
  (followThroughPct: number | undefined, takingOneForTheTeamPct: number | undefined): Modifier[] =>
    getManualUptimeModifiers({ followThroughPct, takingOneForTheTeamPct }),
);

export const publicTeamModifiersFor = scoped(
  (publicTeamType: PlayerInput['publicTeamType'], teammateCount: number): Modifier[] =>
    getPublicTeamModifiers(publicTeamType, teammateCount),
);

export const targetDebuffModifiersFor = scoped(
  (takingOneForTheTeamDrRank: PlayerInput['takingOneForTheTeamDrRank']): Modifier[] =>
    getTargetDebuffModifiers({ takingOneForTheTeamDrRank }),
);

export const armorEffectModifiersFor = scoped(
  (mode: GameMode, armorEffects: Record<string, number>): Modifier[] =>
    getArmorEffectModifiers(mode, armorEffects),
);

/**
 * The aggregation step of `deriveConditionsFor` — keyed on the raw
 * `playerConfig.conditions` reference plus the 5 already-independently-
 * memoized DERIVED values, not on the 4 upstream slice references
 * (perks/legendaryPerks/consumables/armorEffects) those derivations read: a
 * perk-rank-up candidate always replaces the `perks` array reference
 * (`build-reducer.ts`'s `bump()`), which would blow this cache every time if
 * keyed upstream, even on the (common) rank change that doesn't touch
 * StrangeInNumbers/ClassFreak/equippedPerkRanks... except `equippedPerkRanks`
 * DOES genuinely change value on almost every real perk-rank candidate
 * (that's its whole job — see `equippedPerkFamilyRanksFor`), so this mainly
 * pays off for the 'mod'/'legendary'/'mutation'/most-'armor'/most-'consumable'
 * groups, where the 5 derived values collapse back to the same
 * primitives/references as the baseline and this returns the SAME
 * `PlayerInput` object — which is itself the cache key every downstream
 * `conditions`-keyed consumer (`buildEffectiveWeapon`'s memo below) needs to
 * also hit.
 */
const deriveConditionsAgg = scoped(
  (
    raw: PlayerInput,
    strangeInNumbers: boolean,
    classFreakRank: number,
    underAlcoholEffect: boolean,
    equippedPerkRanks: Record<string, number>,
    wornPieceCounts: Record<string, number>,
  ): PlayerConditionContext => ({
    ...raw,
    strangeInNumbers,
    classFreakRank,
    underAlcoholEffect,
    equippedPerkRanks,
    wornPieceCounts,
  }),
);

/** Derived gates over the stored conditions (strangeInNumbers/classFreakRank/underAlcoholEffect/equippedPerkRanks/wornPieceCounts) — see `assemble()`'s own comment for what each field means and why it must be derived here. */
export function deriveConditionsFor(
  scope: MemoScope | undefined,
  mode: GameMode,
  playerConfig: PlayerConfig,
): PlayerConditionContext {
  const strangeInNumbers = strangeInNumbersFor(scope, playerConfig.perks, playerConfig.conditions);
  const classFreakRank = classFreakRankFor(scope, playerConfig.perks);
  const underAlcoholEffect = underAlcoholEffectFor(scope, mode, playerConfig.consumables);
  const equippedPerkRanks = equippedPerkFamilyRanksFor(
    scope,
    mode,
    playerConfig.perks,
    playerConfig.legendaryPerks,
  );
  const wornPieceCounts = wornPieceCountsFor(scope, mode, playerConfig.armorEffects);
  return deriveConditionsAgg(
    scope,
    playerConfig.conditions,
    strangeInNumbers,
    classFreakRank,
    underAlcoholEffect,
    equippedPerkRanks,
    wornPieceCounts,
  );
}

/**
 * The aggregation step of `loadoutModifiersFor` — order matters (`foldOps`,
 * src/lib/engine/resolve.ts, folds SET → ×Π(1+MUL_ADD) → +ΣADD and "last SET
 * wins" is array-order-dependent), so the parameter order below IS the fold
 * order. Keyed on the 9 (already-memoized) piece references — so when every
 * piece is a cache hit (e.g. every 'mod'/'legendary' sweep candidate, which
 * touches only the weapon), this returns the SAME array reference as last
 * time, letting `buildEffectiveWeapon`'s own memoization (below) key on it
 * too.
 */
const loadoutModifiersAgg = scoped(
  (
    perkMods: Modifier[],
    legendaryMods: Modifier[],
    buffMods: Modifier[],
    addictionMods: Modifier[],
    manualUptimeMods: Modifier[],
    publicTeamMods: Modifier[],
    baselineMods: Modifier[],
    targetDebuffMods: Modifier[],
    armorMods: Modifier[],
  ): Modifier[] => [
    ...perkMods,
    ...legendaryMods,
    ...buffMods,
    ...addictionMods,
    ...manualUptimeMods,
    ...publicTeamMods,
    ...baselineMods,
    ...targetDebuffMods,
    ...armorMods,
  ],
);

/** The full loadout (perk/legendary-perk/mutation/consumable/armor/target) modifier list, gathered BEFORE the effective weapon is built — same sourcing as the original inline `assemble()` body. */
export function loadoutModifiersFor(
  scope: MemoScope | undefined,
  mode: GameMode,
  playerConfig: PlayerConfig,
  conditions: PlayerConditionContext,
): Modifier[] {
  const perkMods = perkFamilyModifiersFor(scope, mode, playerConfig.perks);
  const legendaryMods = perkFamilyModifiersFor(scope, mode, playerConfig.legendaryPerks);
  const buffMods = buffModifiersFor(scope, mode, playerConfig.mutations, playerConfig.consumables);
  const addictionMods = addictionModifiersFor(
    scope,
    mode,
    playerConfig.addictions,
    playerConfig.consumables,
  );
  // Follow Through / Taking One for the Team manual damage-multiplier toggles
  // — driven by the Target panel's inputs, not the player's own cards
  // (@/data/manual-uptime), so pushed unconditionally like Tenderizer below.
  const manualUptimeMods = manualUptimeModifiersFor(
    scope,
    conditions.followThroughPct,
    conditions.takingOneForTheTeamPct,
  );
  const publicTeamMods = publicTeamModifiersFor(
    scope,
    conditions.publicTeamType,
    conditions.teammateCount,
  );
  // Hidden survival-ability baselines (hydration AP regen) — gated by the
  // drinkTierExact/playerIsGhoul conditions at resolve time, so pushed unconditionally.
  // Target-side debuffs (Tenderizer stacks, Taking One for the Team's flat DR
  // debuff) — driven by the Target panel's inputs, not the player's own
  // cards, so pushed unconditionally too.
  const targetDebuffMods = targetDebuffModifiersFor(scope, conditions.takingOneForTheTeamDrRank);
  // Armor checklist selections (Unyielding, 2★ SPECIAL, Battle-
  // Loader's, ...) — pushed BEFORE buildEffectiveWeapon like every other
  // source above so their weapon-stat/sustain-chance buckets (Battle-
  // Loader's reloadSkipChanceBash, Propelling's moveSpeedBonus) get folded
  // the same way OMOD/perk modifiers do.
  const armorMods = armorEffectModifiersFor(scope, mode, playerConfig.armorEffects);

  return loadoutModifiersAgg(
    scope,
    perkMods,
    legendaryMods,
    buffMods,
    addictionMods,
    manualUptimeMods,
    publicTeamMods,
    PLAYER_BASELINE_MODIFIERS,
    targetDebuffMods,
    armorMods,
  );
}

/** `assemble()`'s final modifier list drops the weapon-stat/sustain-chance/bootstrap buckets buildEffectiveWeapon already consumed — see `weaponRelevantModifiersFor`'s doc-comment for why every OTHER bucket is exactly this filter's complement. */
const nonWeaponStatModifiersFiltered = scoped((loadoutModifiers: Modifier[]): Modifier[] =>
  loadoutModifiers.filter(
    (m) =>
      !WEAPON_STAT_BUCKETS.has(m.bucket) &&
      !SUSTAIN_CHANCE_BUCKETS.has(m.bucket) &&
      !CONSUMED_BEFORE_BUCKETS.has(m.bucket),
  ),
);
/**
 * Interns the filtered result (same trick as `internWeaponRelevantModifiers`
 * below): `loadoutModifiers` legitimately gets a new reference on almost
 * every non-'mod'/'legendary' candidate (some source genuinely changed), but
 * a damage-IRRELEVANT change (an inert consumable, a mutation with no
 * engine-effective modifiers — `variants.ts`'s mutation/consumable loops
 * emit every one, unfiltered) often leaves this exact filtered SEQUENCE
 * untouched. Collapsing those cases to the same reference is what lets
 * `computeScenarios` itself be skipped for them (see evaluate.ts's
 * `computeSnapshot`).
 */
const internNonWeaponStatModifiers = createArrayInterner<Modifier>();

export function nonWeaponStatModifiersFor(
  scope: MemoScope | undefined,
  loadoutModifiers: Modifier[],
): Modifier[] {
  return internNonWeaponStatModifiers(
    scope,
    nonWeaponStatModifiersFiltered(scope, loadoutModifiers),
  );
}

/**
 * The complement of `nonWeaponStatModifiersFor`'s filter — exactly the
 * `loadoutModifiers` buildEffectiveWeapon can actually see, per its own
 * source (src/lib/engine/effective-weapon.ts): every fold it runs over
 * `loadoutModifiers` (`statModifiers` = the WEAPON_STAT_BUCKETS/
 * SUSTAIN_CHANCE_BUCKETS subset; the 4 CONSUMED_BEFORE_BUCKETS
 * bootstrap folds) goes through `resolve.ts`'s `foldBucket`, which only
 * looks at entries whose OWN `.bucket` matches the bucket being folded — so
 * a modifier whose bucket is in none of these 3 sets can never affect
 * buildEffectiveWeapon's output, regardless of its value or conditions. That
 * makes this filtered subset a drop-in, provably-equivalent substitute for
 * the raw `loadoutModifiers` argument `buildEffectiveWeapon` takes — see
 * `assemble()`, which passes exactly this to it.
 */
const weaponRelevantModifiersFiltered = scoped((loadoutModifiers: Modifier[]): Modifier[] =>
  loadoutModifiers.filter(
    (m) =>
      WEAPON_STAT_BUCKETS.has(m.bucket) ||
      SUSTAIN_CHANCE_BUCKETS.has(m.bucket) ||
      CONSUMED_BEFORE_BUCKETS.has(m.bucket),
  ),
);
/** Interns the filtered result: two different (by reference) `loadoutModifiers` arrays whose relevant subset is elementwise the SAME sequence of Modifier object references (true whenever every contributing source that changed doesn't touch these 3 bucket sets — e.g. a Rifleman-family perk rank-up, which only emits `dbm`/`critDbm`) collapse to the SAME array reference, letting `buildEffectiveWeapon`'s own cache (keyed on this) skip a rerun whose real inputs didn't change even though the raw `loadoutModifiers` reference did. Never a false hit: distinct object references can only coincide here by actually being the same object. */
const internWeaponRelevantModifiers = createArrayInterner<Modifier>();

export function weaponRelevantModifiersFor(
  scope: MemoScope | undefined,
  loadoutModifiers: Modifier[],
): Modifier[] {
  return internWeaponRelevantModifiers(
    scope,
    weaponRelevantModifiersFiltered(scope, loadoutModifiers),
  );
}

/** Enemy-type identity of the selected target (race edid + ActorType* keywords) — resolved ONCE from bodyparts data and threaded to every ResolveContext, so enemyType/enemyTypeAny gates (Assassin's, Zealot's, Prime receivers, Paranormal Mod) see the same match set everywhere. */
export const enemyTypeIdsFor = scoped(
  (mode: GameMode, targetRace: string | null | undefined): readonly string[] =>
    getEnemyTypeIds(mode, targetRace),
);

/**
 * `buildEffectiveWeapon` itself, memoized. Takes `weaponRelevantModifiersFor`'s
 * interned subset as its `loadoutModifiers` argument, NOT the raw
 * `loadoutModifiers` — see `weaponRelevantModifiersFor`'s doc-comment for why
 * that substitution is exact, not approximate, and buys a much higher
 * cache-hit rate than keying on the raw (frequently-rebuilt) list would.
 */
export const buildEffectiveWeaponFor = scoped(
  (
    baseWeapon: Weapon,
    equippedOmods: GeneratedOmod[],
    itemLevel: number,
    conditions: PlayerConditionContext,
    enemyConditions: EnemyConfig['conditions'],
    weaponRelevantModifiers: Modifier[],
    enemyTypeIds: readonly string[],
  ) =>
    buildEffectiveWeapon(
      baseWeapon,
      equippedOmods,
      itemLevel,
      conditions,
      enemyConditions,
      weaponRelevantModifiers,
      enemyTypeIds,
    ),
);

/**
 * Derived stats (effective SPECIAL + max HP + derived skills), memoized —
 * shared derivation with the Build column's stat summary
 * (src/lib/player-stats.ts). STR feeds the melee term, LCK the crit meter,
 * END the HP formula, maxHealth the healthCurrent curve input (Juggernaut's).
 * `conditions` carries the derived strangeInNumbers/classFreakRank gates the
 * condition-aware SPECIAL folds read. Takes `enemyConditions`/`itemLevel`/
 * `enemyTypeIds`/`mode` as explicit parameters (not closed over) even though
 * they're invariant for the whole sweep — since they're part of the key
 * either way, that costs nothing in cache-hit rate and removes the need to
 * trust a "safe to leave out of the key" comment.
 */
export const derivedPlayerStatsFor = scoped(
  (
    mode: GameMode,
    modifiers: Modifier[],
    legendaryPerks: PlayerConfig['legendaryPerks'],
    rawConditions: PlayerInput,
    conditions: PlayerConditionContext,
    weapon: Weapon,
    itemLevel: number,
    enemyConditions: EnemyConfig['conditions'],
    enemyTypeIds: readonly string[],
  ): DerivedPlayerStats =>
    derivePlayerStats(
      modifiers,
      baseSpecialOf(legendaryPerks, rawConditions),
      conditions,
      enemyConditions,
      weapon,
      itemLevel,
      enemyTypeIds,
      getSpecialClamp(mode),
    ),
);

/**
 * The aggregation step of `resolveLoadout`'s `player` assembly. Keyed on
 * `addictionCount` (a precomputed scalar — see the call site) rather than on
 * `playerConfig.addictions`/`.consumables` separately: `addictionCount` is
 * exactly the value this function reads, so keying on it directly is both
 * precise (no missing-key hazard: a scalar can't be "partially" read) and
 * strictly narrower than keying on both upstream slices would be.
 *
 * Whenever `conditions`, the derived special/maxHealth/skills (bundled
 * together — all miss or all hit as one unit, see `derivedPlayerStatsFor`),
 * `mutations`, and `addictionCount` are all unchanged, this collapses to the
 * SAME `player` reference — which, combined with `modifiers`/`weapon` also
 * being stable (see `assemble()`), lets `evaluateSuggestions` skip
 * `computeScenarios` entirely for a candidate with no real damage effect.
 */
export const playerAgg = scoped(
  (
    conditions: PlayerConditionContext,
    special: Record<SpecialKey, number>,
    maxHealth: number,
    lockpickSkill: number,
    hackingSkill: number,
    damageResistGain: number,
    stimpakHealMult: number,
    stimpakHealMagMult: number,
    stimpakHealDurationMult: number,
    mutations: string[],
    rawConditions: PlayerInput,
    addictionCount: number,
  ) => ({
    // Derived-gate view of the stored conditions (strangeInNumbers,
    // classFreakRank — see assemble()).
    ...conditions,
    ...special,
    maxHealth,
    lockpickSkill,
    hackingSkill,
    playerDamageResist: damageResistGain,
    stimpakHealMult,
    stimpakHealMagMult,
    stimpakHealDurationMult,
    // Mutant's curve input: the selected mutation list IS the mutation count.
    mutationCount: mutations.length,
    // Ghoul Glow meter: clamp to the derived max HP (max Glow = max HP) so a
    // stored value from a since-shrunk build never reads above the cap.
    glow: Math.min(rawConditions.glow ?? 0, maxHealth),
    // Gourmand's curve input: the two meter tiers sum to the HungerThirstTier AV.
    hungerThirstTier: deriveHungerThirstTier(rawConditions),
    addictionCount,
  }),
);

/** Body-part mult + location axis: the Target section's race + part pick resolves through BPTD data; without one the custom multiplier applies and the location axis falls back to the engine's legacy mult-derived category (resolveTargetBodyPart — single source of truth, also used by the aim-point UI readouts). */
export const resolvedTargetFor = scoped(
  (
    mode: GameMode,
    targetRace: string | null | undefined,
    targetBodyPart: string | null | undefined,
    weakpointMult: number,
  ) => resolveTargetBodyPart(mode, targetRace, targetBodyPart, weakpointMult),
);

/** Enemy defenses (Phase 2 — Enemy defenses): resolves the same npc row the body-part picker already joins via `targetRace`. `getEnemyDefenses` returns null without a race selected or a race with no npc data, which threads through as `undefined` on ScenarioInput — scenarios.ts's `effective` field just stays absent. `epicRank` is the Target section's ★ toggle (ignored by getEnemyDefenses for races with a forced rank, and for non-epicAllowed races). */
export const targetNpcFor = scoped((mode: GameMode, targetRace: string | null | undefined) =>
  targetRace ? getNpc(mode, targetRace) : undefined,
);
export const enemyDefensesFor = scoped(
  (
    mode: GameMode,
    targetRace: string | null | undefined,
    resolvedLevel: number,
    epicRank: number | undefined,
  ) => getEnemyDefenses(mode, targetRace, resolvedLevel, epicRank),
);
