import type { PlayerConfig, EnemyConfig, GameMode, PlayerConditions, Weapon } from '@/types';
import type { Bucket, Modifier } from '@/types/modifiers';
import type { GeneratedOmod } from '@/types/generated';
import {
  getActionPointConstants,
  getBulletStormConstants,
  getDistanceConstants,
  getMitigationConstants,
  getSpecialClamp,
  getVatsCritConstants,
  getWeapons,
} from '@/data';
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
import { getEnemyDefenses, resolveTargetLevel } from '@/lib/enemy-defenses';
import {
  deriveAddictionCount,
  deriveClassFreakRank,
  deriveHungerThirstTier,
  derivePlayerStats,
  deriveStrangeInNumbers,
  SPECIAL_KEYS,
  type DerivedPlayerStats,
  type SpecialKey,
} from '@/lib/player-stats';
import type { ScenarioInput } from '@/lib/engine/scenarios';
import { cached, type LoadoutMemo, type MemoNode } from '@/lib/loadout-memo';

export const EFFECTIVE_WEAPON_BOOTSTRAP_BUCKETS: ReadonlySet<Bucket> = new Set([
  // Folded by buildEffectiveWeapon into ResolveContext.moveSpeedBonus so
  // Fast Fighter's reload-speed curve can see Speed Demon / fish sandwich.
  // Onslaught bootstrap buckets must stay in ScenarioInput.modifiers:
  // computeScenarios folds and exposes them there.
  'moveSpeedBonus',
  // Bunker Buster radius→damage conversion — fully consumed inside buildEffectiveWeapon,
  // synthesized into a dbm modifier there; must not reach ScenarioInput.modifiers directly.
  'explosionRadiusBonus',
  'explosionRadiusToDamage',
  // Explosive 2★ — buildEffectiveWeapon decides its destiny per weapon (see
  // its doc-comment): left untouched for a Projectile-Scaling Explosion
  // (paper-damage.ts's own fold), rewritten into a baseDamage MUL_ADD for a
  // Curve-Table Explosion, or stripped outright when chain-suppressed. Its
  // only current source is an equipped OMOD (allOmodModifiers), never
  // loadoutModifiers — listed here defensively for symmetry with
  // explosionRadiusBonus/ToDamage, so a future loadout-sourced contribution
  // can't bypass the branch logic and leak into ScenarioInput.modifiers raw.
  'explosivePayload',
]);

// getPlayerBaselineModifiers() takes no arguments and its result never
// varies (see that function's doc-comment) — hoisted to a module-level
// constant rather than a per-call allocation, unconditionally (this is safe
// for every caller, not just the memoized sweep path).
const PLAYER_BASELINE_MODIFIERS: Modifier[] = getPlayerBaselineModifiers();

/**
 * Base SPECIAL fed to the stat folds: the user-defined allocation stored in
 * conditions + Legendary SPECIAL card bonuses (+1/+2/+3/+5 by rank, on top of
 * base — they raise the stat as well as the perk-point budget).
 */
function baseSpecialOf(playerConfig: PlayerConfig): Record<SpecialKey, number> {
  const legendaryBonus = legendaryBonusOf(playerConfig.legendaryPerks);
  return Object.fromEntries(
    SPECIAL_KEYS.map((key) => [key, playerConfig.conditions[key] + legendaryBonus[key]]),
  ) as Record<SpecialKey, number>;
}

// ── Memoized sub-steps of assemble() ───────────────────────────────────────
//
// Each helper below mirrors ONE call `assemble()` used to make directly,
// wrapped in `cached(memo?.<slot>, <keys>, ...)`: with no `memo` (every
// caller except the suggestions sweep) it's a plain passthrough to the
// original computation. With a `memo` (src/lib/suggest/evaluate.ts's
// `evaluateSuggestions`), it's a `Map` lookup keyed on the exact
// `PlayerConfig`/`EnemyConfig` slice reference(s) the computation depends on
// — see docs/adr/0001: this composition/caching lives here in src/lib, the
// engine (src/lib/engine/**) stays untouched and data-adapter-free.

function equippedOmodsFor(
  mode: GameMode,
  baseWeapon: Weapon,
  weaponConfig: NonNullable<PlayerConfig['weapon']>,
  memo?: LoadoutMemo,
): GeneratedOmod[] {
  return cached(memo?.equippedOmods, [weaponConfig], () => {
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
  });
}

function strangeInNumbersFor(playerConfig: PlayerConfig, memo?: LoadoutMemo): boolean {
  return cached(memo?.strangeInNumbers, [playerConfig.perks, playerConfig.conditions], () =>
    deriveStrangeInNumbers(playerConfig.perks, playerConfig.conditions),
  );
}

function classFreakRankFor(playerConfig: PlayerConfig, memo?: LoadoutMemo): number {
  return cached(memo?.classFreakRank, [playerConfig.perks], () =>
    deriveClassFreakRank(playerConfig.perks),
  );
}

function underAlcoholEffectFor(
  mode: GameMode,
  playerConfig: PlayerConfig,
  memo?: LoadoutMemo,
): boolean {
  return cached(memo?.underAlcoholEffect, [playerConfig.consumables], () =>
    playerConfig.consumables.some((id) => consumablesById(mode).get(id)?.category === 'alcohol'),
  );
}

function equippedPerkFamilyRanksFor(
  mode: GameMode,
  playerConfig: PlayerConfig,
  memo?: LoadoutMemo,
): Record<string, number> {
  return cached(
    memo?.equippedPerkFamilyRanks,
    [playerConfig.perks, playerConfig.legendaryPerks],
    () => getEquippedPerkFamilyRanks(mode, [...playerConfig.perks, ...playerConfig.legendaryPerks]),
  );
}

/**
 * Canonicalizes a small `Record<string, number>` the same way
 * `weaponRelevantModifiersFor` canonicalizes an array: flatten to a
 * `[key1, value1, key2, value2, ...]` tuple (sorted so key ORDER can't cause
 * a spurious miss) and use that as the trie key, so two calls whose Record
 * has the same entries — even though each is a freshly-allocated object —
 * collapse to the SAME reference. Cheap here because these Records are tiny
 * (a handful of self-scaling armor-effect keywords at most).
 */
function canonicalizeRecord<T extends Record<string, number>>(
  node: MemoNode | undefined,
  rec: T,
): T {
  const flatKey = Object.keys(rec)
    .sort()
    .flatMap((k) => [k, rec[k]]);
  return cached(node, flatKey, () => rec);
}

function wornPieceCountsFor(
  mode: GameMode,
  playerConfig: PlayerConfig,
  memo?: LoadoutMemo,
): Record<string, number> {
  const raw = cached(memo?.wornPieceCounts, [playerConfig.armorEffects], () =>
    getArmorEffectWornPieceCounts(mode, playerConfig.armorEffects),
  );
  return canonicalizeRecord(memo?.wornPieceCountsCanonical, raw);
}

function suppressedAddictionsFor(
  mode: GameMode,
  consumables: string[],
  memo?: LoadoutMemo,
): Set<string> {
  return cached(memo?.suppressedAddictions, [consumables], () =>
    getSuppressedAddictions(mode, consumables),
  );
}

function countedAddictionsFor(
  mode: GameMode,
  addictions: string[],
  consumables: string[],
  memo?: LoadoutMemo,
): string[] {
  return cached(memo?.countedAddictions, [addictions, consumables], () => {
    const suppressed = suppressedAddictionsFor(mode, consumables, memo);
    return addictions.filter((id) => !suppressed.has(id));
  });
}

function perkFamilyModifiersFor(
  mode: GameMode,
  loadouts: PlayerConfig['perks'],
  memo?: LoadoutMemo,
): Modifier[] {
  return cached(memo?.perkFamilyModifiers, [loadouts], () => getLoadoutModifiers(mode, loadouts));
}

function buffModifiersFor(
  mode: GameMode,
  mutations: string[],
  consumables: string[],
  memo?: LoadoutMemo,
): Modifier[] {
  return cached(memo?.buffModifiers, [mutations, consumables], () =>
    getBuffModifiers(mode, mutations, consumables),
  );
}

function addictionModifiersFor(
  mode: GameMode,
  addictions: string[],
  consumables: string[],
  memo?: LoadoutMemo,
): Modifier[] {
  return cached(memo?.addictionModifiers, [addictions, consumables], () =>
    getAddictionModifiers(mode, countedAddictionsFor(mode, addictions, consumables, memo)),
  );
}

// These three read only 1-2 specific PRIMITIVE fields off `conditions` (see
// each source function's own signature) — keyed on those primitives directly
// rather than on `conditions`'s object reference, so a candidate that
// replaces `conditions` wholesale (any perk/armor/consumable change routes
// through `deriveConditionsFor`, which — even after its own canonicalization
// below — legitimately produces a new reference whenever e.g.
// `equippedPerkRanks` really changes) still hits these caches as long as
// its OWN couple of fields didn't move.

function manualUptimeModifiersFor(conditions: PlayerConditions, memo?: LoadoutMemo): Modifier[] {
  return cached(
    memo?.manualUptimeModifiers,
    [conditions.followThroughPct, conditions.takingOneForTheTeamPct],
    () => getManualUptimeModifiers(conditions),
  );
}

function publicTeamModifiersFor(conditions: PlayerConditions, memo?: LoadoutMemo): Modifier[] {
  return cached(
    memo?.publicTeamModifiers,
    [conditions.publicTeamType, conditions.teammateCount],
    () => getPublicTeamModifiers(conditions.publicTeamType, conditions.teammateCount),
  );
}

function targetDebuffModifiersFor(conditions: PlayerConditions, memo?: LoadoutMemo): Modifier[] {
  return cached(memo?.targetDebuffModifiers, [conditions.takingOneForTheTeamDrRank], () =>
    getTargetDebuffModifiers(conditions),
  );
}

function armorEffectModifiersFor(
  mode: GameMode,
  armorEffects: Record<string, number>,
  memo?: LoadoutMemo,
): Modifier[] {
  return cached(memo?.armorEffectModifiers, [armorEffects], () =>
    getArmorEffectModifiers(mode, armorEffects),
  );
}

/**
 * Derived gates over the stored conditions — see `assemble()`'s original
 * inline comment for what each field means and why it must be derived here
 * (strangeInNumbers/classFreakRank/underAlcoholEffect/equippedPerkRanks/
 * wornPieceCounts).
 *
 * Keyed on the 5 already-independently-memoized DERIVED values (plus the raw
 * `playerConfig.conditions` reference they spread from) rather than on the 4
 * upstream slice references (perks/legendaryPerks/consumables/armorEffects)
 * those derivations read: a perk-rank-up candidate always replaces the
 * `perks` array reference (`build-reducer.ts`'s `bump()`), which would blow
 * this cache every time if keyed upstream, even on the (common) rank change
 * that doesn't touch StrangeInNumbers/ClassFreak/equippedPerkRanks... except
 * `equippedPerkRanks` DOES genuinely change value on almost every real
 * perk-rank candidate (that's its whole job — see
 * `equippedPerkFamilyRanksFor`), so this mainly pays off for the
 * 'mod'/'legendary'/'mutation'/most-'armor'/most-'consumable' groups, where
 * the 5 derived values collapse back to the same primitives/references as
 * the baseline and this returns the SAME `PlayerConditions` object — which
 * is itself the cache key every downstream `conditions`-keyed consumer
 * (`buildEffectiveWeapon`'s memo below) needs to also hit.
 */
function deriveConditionsFor(
  mode: GameMode,
  playerConfig: PlayerConfig,
  memo?: LoadoutMemo,
): PlayerConditions {
  const strangeInNumbers = strangeInNumbersFor(playerConfig, memo);
  const classFreakRank = classFreakRankFor(playerConfig, memo);
  const underAlcoholEffect = underAlcoholEffectFor(mode, playerConfig, memo);
  const equippedPerkRanks = equippedPerkFamilyRanksFor(mode, playerConfig, memo);
  const wornPieceCounts = wornPieceCountsFor(mode, playerConfig, memo);

  return cached(
    memo?.conditions,
    [
      playerConfig.conditions,
      strangeInNumbers,
      classFreakRank,
      underAlcoholEffect,
      equippedPerkRanks,
      wornPieceCounts,
    ],
    () => ({
      ...playerConfig.conditions,
      strangeInNumbers,
      classFreakRank,
      underAlcoholEffect,
      equippedPerkRanks,
      wornPieceCounts,
    }),
  );
}

/**
 * The full loadout (perk/legendary-perk/mutation/consumable/armor/target)
 * modifier list, gathered BEFORE the effective weapon is built — same order
 * and same sourcing as the original inline `assemble()` body (order matters:
 * `foldOps`, src/lib/engine/resolve.ts, folds SET → ×Π(1+MUL_ADD) → +ΣADD
 * and "last SET wins" is array-order-dependent). Each of the 9 pieces is its
 * own cache slot; the concatenation itself is ALSO memoized, keyed on the 9
 * (already-memoized) piece references — so when every piece is a cache hit
 * (e.g. every 'mod'/'legendary' sweep candidate, which touches only the
 * weapon), this returns the SAME array reference as last time, letting
 * `buildEffectiveWeapon`'s own memoization (below) key on it too.
 */
function loadoutModifiersFor(
  mode: GameMode,
  playerConfig: PlayerConfig,
  conditions: PlayerConditions,
  memo?: LoadoutMemo,
): Modifier[] {
  const perkMods = perkFamilyModifiersFor(mode, playerConfig.perks, memo);
  const legendaryMods = perkFamilyModifiersFor(mode, playerConfig.legendaryPerks, memo);
  const buffMods = buffModifiersFor(mode, playerConfig.mutations, playerConfig.consumables, memo);
  const addictionMods = addictionModifiersFor(
    mode,
    playerConfig.addictions,
    playerConfig.consumables,
    memo,
  );
  // Follow Through / Taking One for the Team manual damage-multiplier toggles
  // — driven by the Target panel's inputs, not the player's own cards
  // (@/data/manual-uptime), so pushed unconditionally like Tenderizer below.
  const manualUptimeMods = manualUptimeModifiersFor(conditions, memo);
  const publicTeamMods = publicTeamModifiersFor(conditions, memo);
  // Hidden survival-ability baselines (hydration AP regen) — gated by the
  // hydrated/playerIsGhoul conditions at resolve time, so pushed unconditionally.
  // Target-side debuffs (Tenderizer stacks, Taking One for the Team's flat DR
  // debuff) — driven by the Target panel's inputs, not the player's own
  // cards, so pushed unconditionally too.
  const targetDebuffMods = targetDebuffModifiersFor(conditions, memo);
  // Armor checklist selections (Unyielding, 2★ SPECIAL, Battle-
  // Loader's, ...) — pushed BEFORE buildEffectiveWeapon like every other
  // source above so their weapon-stat/sustain-chance buckets (Battle-
  // Loader's reloadSkipChanceBash, Propelling's moveSpeedBonus) get folded
  // the same way OMOD/perk modifiers do.
  const armorMods = armorEffectModifiersFor(mode, playerConfig.armorEffects, memo);

  return cached(
    memo?.loadoutModifiers,
    [
      perkMods,
      legendaryMods,
      buffMods,
      addictionMods,
      manualUptimeMods,
      publicTeamMods,
      PLAYER_BASELINE_MODIFIERS,
      targetDebuffMods,
      armorMods,
    ],
    () => [
      ...perkMods,
      ...legendaryMods,
      ...buffMods,
      ...addictionMods,
      ...manualUptimeMods,
      ...publicTeamMods,
      ...PLAYER_BASELINE_MODIFIERS,
      ...targetDebuffMods,
      ...armorMods,
    ],
  );
}

/**
 * `assemble()`'s final modifier list drops the weapon-stat/sustain-chance/
 * bootstrap buckets buildEffectiveWeapon already consumed. Memoized by
 * `loadoutModifiers`'s own reference first (cheap check), then the FILTERED
 * result is itself canonicalized elementwise (same trick as
 * `weaponRelevantModifiersFor`): `loadoutModifiers` legitimately gets a new
 * reference on almost every non-'mod'/'legendary' candidate (some source
 * genuinely changed), but a damage-IRRELEVANT change (an inert consumable,
 * a mutation with no engine-effective modifiers — `variants.ts`'s
 * mutation/consumable loops emit every one, unfiltered) often leaves this
 * exact filtered SEQUENCE untouched. Collapsing those cases to the same
 * reference is what lets `computeScenarios` itself be skipped for them
 * (see evaluate.ts's `computeSnapshot`).
 */
function nonWeaponStatModifiersFor(loadoutModifiers: Modifier[], memo?: LoadoutMemo): Modifier[] {
  const filtered = cached(memo?.nonWeaponStatModifiers, [loadoutModifiers], () =>
    loadoutModifiers.filter(
      (m) =>
        !WEAPON_STAT_BUCKETS.has(m.bucket) &&
        !SUSTAIN_CHANCE_BUCKETS.has(m.bucket) &&
        !EFFECTIVE_WEAPON_BOOTSTRAP_BUCKETS.has(m.bucket),
    ),
  );
  return cached(memo?.nonWeaponStatModifiersCanonical, filtered, () => filtered);
}

/**
 * The complement of `nonWeaponStatModifiersFor`'s filter — exactly the
 * `loadoutModifiers` buildEffectiveWeapon can actually see, per its own
 * source (src/lib/engine/effective-weapon.ts): every fold it runs over
 * `loadoutModifiers` (`statModifiers` = the WEAPON_STAT_BUCKETS/
 * SUSTAIN_CHANCE_BUCKETS subset; the 6 EFFECTIVE_WEAPON_BOOTSTRAP_BUCKETS
 * bootstrap folds) goes through `resolve.ts`'s `foldBucket`, which only
 * looks at entries whose OWN `.bucket` matches the bucket being folded — so
 * a modifier whose bucket is in none of these 3 sets can never affect
 * buildEffectiveWeapon's output, regardless of its value or conditions.
 *
 * Canonicalized the same way `weaponRelevantModifiers`'s own elements are:
 * two different (by reference) `loadoutModifiers` arrays whose relevant
 * subset is elementwise the SAME sequence of Modifier object references
 * (true whenever every contributing source that changed doesn't touch these
 * 3 bucket sets — e.g. a Rifleman-family perk rank-up, which only emits
 * `dbm`/`critDbm`) collapse to the SAME array reference, letting
 * `buildEffectiveWeapon`'s own cache (keyed on this) skip a rerun whose real
 * inputs didn't change even though the raw `loadoutModifiers` reference did.
 * Never a false HIT: distinct object references can only coincide here by
 * actually being the same object, so this can't mask a real change.
 */
function weaponRelevantModifiersFor(loadoutModifiers: Modifier[], memo?: LoadoutMemo): Modifier[] {
  const relevant = loadoutModifiers.filter(
    (m) =>
      WEAPON_STAT_BUCKETS.has(m.bucket) ||
      SUSTAIN_CHANCE_BUCKETS.has(m.bucket) ||
      EFFECTIVE_WEAPON_BOOTSTRAP_BUCKETS.has(m.bucket),
  );
  return cached(memo?.weaponRelevantModifiers, relevant, () => relevant);
}

/** Effective weapon (OMODs applied) + the full modifier list — shared by resolveLoadout and resolveStats. */
function assemble(
  playerConfig: PlayerConfig,
  enemyConfig: EnemyConfig,
  mode: GameMode,
  memo?: LoadoutMemo,
  // Opt-in bucket-read recorder — see ResolveContext.bucketReads's doc-comment
  // (resolve.ts). Threaded only by resolveLoadout's throwaway recording call
  // (src/lib/suggest/evaluate.ts); undefined for every other caller. NOTE:
  // when `memo` is also given and hits `memo.effectiveWeapon`'s cache,
  // buildEffectiveWeapon (and its bucketReads recording) is skipped — callers
  // that need bucketReads populated must not reuse a warm memo.
  bucketReads?: Set<Bucket>,
): {
  weapon: Weapon | undefined;
  modifiers: Modifier[];
  conditions: PlayerConditions;
  enemyTypeIds: readonly string[];
} {
  const baseWeapon = playerConfig.weapon
    ? getWeapons(mode)[playerConfig.weapon.weaponId]
    : undefined;

  // Enemy-type identity of the selected target (race edid + ActorType*
  // keywords) — resolved ONCE from bodyparts data and threaded to every
  // ResolveContext, so enemyType/enemyTypeAny gates (Assassin's, Zealot's,
  // Prime receivers, Paranormal Mod) see the same match set everywhere.
  const enemyTypeIds = cached(memo?.enemyTypeIds, [enemyConfig.conditions.targetRace], () =>
    getEnemyTypeIds(mode, enemyConfig.conditions.targetRace),
  );

  // Derived gates resolved ONCE over the stored conditions: strangeInNumbers
  // (SiN card + teammate) and classFreakRank (equipped ClassFreak rank) both
  // gate modifiers folded here (Speed Demon's reload, mutation penalty
  // tiers) and downstream (SPECIAL folds, the engine) — every consumer must
  // see the same derived values, never the stored synthetic-test defaults.
  const conditions = deriveConditionsFor(mode, playerConfig, memo);

  // Perk/legendary-perk/buff modifiers, gathered BEFORE the effective weapon
  // is built so their weapon-stat buckets (reloadSpeed, fireRateSpeed, …)
  // fold into it alongside OMOD stats — Guerrilla Expert's reload is inert if
  // this runs after buildEffectiveWeapon (docs/assumptions.md "Onslaught",
  // Guerrilla Expert's reload-speed bullet).
  const loadoutModifiers = loadoutModifiersFor(mode, playerConfig, conditions, memo);

  // Apply equipped OMODs (standard slots + legendary effects) to the weapon.
  let weapon: Weapon | undefined;
  let omodModifiers: Modifier[] = [];
  if (baseWeapon && playerConfig.weapon) {
    const equippedOmods = equippedOmodsFor(mode, baseWeapon, playerConfig.weapon, memo);
    // Cache key uses `weaponRelevantModifiersFor`'s canonicalized subset, NOT
    // the raw `loadoutModifiers` — see that function's doc-comment for why
    // this is exact, not approximate. `buildEffectiveWeapon` itself still
    // gets the full `loadoutModifiers` (its own internal filtering is
    // unchanged).
    const built = cached(
      memo?.effectiveWeapon,
      [
        playerConfig.weapon,
        playerConfig.itemLevel,
        conditions,
        enemyConfig.conditions,
        weaponRelevantModifiersFor(loadoutModifiers, memo),
        enemyTypeIds,
      ],
      () =>
        buildEffectiveWeapon(
          baseWeapon,
          equippedOmods,
          playerConfig.itemLevel,
          conditions,
          enemyConfig.conditions,
          loadoutModifiers,
          enemyTypeIds,
          bucketReads,
        ),
    );
    weapon = built.weapon;
    omodModifiers = built.modifiers;
  }

  const modifiers = [
    // Weapon-intrinsic modifiers (Weapon.modifiers — the WEAP's own
    // Contact-delivery Enchantment chase, e.g. Cremator's built-in fire
    // DoT). Sourced `kind: 'weapon'`; today only feeds `dotDamage` (folded
    // as the intrinsic base by paper-damage.ts's `computeDotDps`), which
    // isn't a WEAPON_STAT_BUCKETS bucket, so no effective-weapon folding is
    // needed before it joins the modifier list.
    ...(baseWeapon?.modifiers ?? []),
    ...omodModifiers,
    // Weapon-stat buckets were consumed by the effective-weapon fold above —
    // dropping them mirrors what buildEffectiveWeapon does to OMOD modifiers
    // and keeps them from double-counting if a damage term ever folds them.
    ...nonWeaponStatModifiersFor(loadoutModifiers, memo),
  ];

  return {
    weapon,
    // Canonicalized elementwise (same trick as `weaponRelevantModifiersFor`):
    // `baseWeapon.modifiers` is static per weapon, `omodModifiers` is
    // `buildEffectiveWeapon`'s own (often cache-hit, see above) `.modifiers`
    // field, and `nonWeaponStatModifiersFor` is already canonicalized — so
    // whenever every piece is unchanged, this collapses to the exact
    // previous `modifiers` reference despite the fresh `[...]` allocation.
    // That stable reference is what lets `evaluateSuggestions` skip
    // `computeScenarios` entirely for a damage-irrelevant candidate.
    modifiers: cached(memo?.modifiersCanonical, modifiers, () => modifiers),
    conditions,
    enemyTypeIds,
  };
}

/**
 * Derived stats (effective SPECIAL + max HP) for the Build column's stat
 * summary — same assembly and derivation as `resolveLoadout`, but works
 * without an equipped weapon (weapon-gated stat modifiers just don't match).
 */
export function resolveStats(
  playerConfig: PlayerConfig,
  enemyConfig: EnemyConfig,
  mode: GameMode,
): DerivedPlayerStats {
  const { weapon, modifiers, conditions, enemyTypeIds } = assemble(playerConfig, enemyConfig, mode);
  return derivePlayerStats(
    modifiers,
    baseSpecialOf(playerConfig),
    conditions,
    enemyConfig.conditions,
    weapon,
    playerConfig.itemLevel,
    enemyTypeIds,
    getSpecialClamp(mode),
  );
}

/**
 * Resolves a player build ("loadout") into engine-ready input: the effective
 * weapon plus the full modifier list assembled from every damage source.
 *
 * This is the one sanctioned bridge from the data layer (`@/data`) to the
 * damage engine (`@/lib/engine`, which stays data-adapter-free). Both the
 * `useScenarioResults` hook and the golden-case harness go through here, so
 * the assembly — which OMOD ids get collected, in what order, from which
 * config fields — lives in exactly one testable place.
 *
 * `memo` is an OPT-IN cache for the suggestions sweep
 * (src/lib/suggest/evaluate.ts's `evaluateSuggestions`, which calls this
 * ~600+ times per config change for one baseline + one BuildAction each):
 * every other caller omits it and gets the identical unmemoized computation
 * this always did (see src/lib/loadout-memo.ts's doc-comment).
 *
 * Returns null when the config has no equipped weapon (nothing to compute).
 */
export function resolveLoadout(
  playerConfig: PlayerConfig,
  enemyConfig: EnemyConfig,
  mode: GameMode,
  memo?: LoadoutMemo,
  // Opt-in bucket-read recorder — see ResolveContext.bucketReads's doc-comment
  // (resolve.ts) and assemble()'s doc-comment above for the memo-cache-hit
  // caveat. Stamped onto the returned ScenarioInput so computeScenarios keeps
  // recording into the SAME set. Threaded only by evaluateSuggestions'
  // throwaway recording call (src/lib/suggest/evaluate.ts); undefined
  // everywhere else.
  bucketReads?: Set<Bucket>,
): ScenarioInput | null {
  const { weapon, modifiers, conditions, enemyTypeIds } = assemble(
    playerConfig,
    enemyConfig,
    mode,
    memo,
    bucketReads,
  );
  if (!weapon) return null;

  // Effective SPECIAL (base + SPECIAL-bucket buffs: Buffout +2 STR...) and
  // derived max HP (245 + 5×END + maxHealth bucket: Lifegiver...) — shared
  // derivation with the Build column's stat summary (src/lib/player-stats.ts).
  // STR feeds the melee term, LCK the crit meter, END the HP formula,
  // maxHealth the healthCurrent curve input (Juggernaut's). `conditions`
  // carries the derived strangeInNumbers/classFreakRank gates the
  // condition-aware SPECIAL folds read.
  //
  // Memoized on (modifiers, legendaryPerks, playerConfig.conditions,
  // conditions, weapon) — the exact inputs baseSpecialOf/derivePlayerStats
  // read (enemy/itemLevel/enemyTypeIds/clamp are invariant for the whole
  // sweep, so they're safe to leave out of the key — see loadout-memo.ts).
  const { special, maxHealth, lockpickSkill } = cached(
    memo?.derivedPlayerStats,
    [modifiers, playerConfig.legendaryPerks, playerConfig.conditions, conditions, weapon],
    () =>
      derivePlayerStats(
        modifiers,
        baseSpecialOf(playerConfig),
        conditions,
        enemyConfig.conditions,
        weapon,
        playerConfig.itemLevel,
        enemyTypeIds,
        getSpecialClamp(mode),
        bucketReads,
      ),
  );
  // Canonicalized as a unit: whenever `conditions`, the derived
  // special/maxHealth (bundled together above — both cache hits together or
  // both miss together), and the mutations/consumables slices that feed the
  // 3 fields below are all unchanged, this collapses to the SAME `player`
  // reference — which, combined with `modifiers`/`weapon` also being stable
  // (see assemble()), lets `evaluateSuggestions` skip `computeScenarios`
  // entirely for a candidate with no real damage effect.
  const player = cached(
    memo?.player,
    [conditions, special, maxHealth, lockpickSkill, playerConfig.mutations, playerConfig.consumables],
    () => ({
      // Derived-gate view of the stored conditions (strangeInNumbers,
      // classFreakRank — see assemble()).
      ...conditions,
      ...special,
      maxHealth,
      lockpickSkill,
      // Mutant's curve input: the selected mutation list IS the mutation count.
      mutationCount: playerConfig.conditions.mutationCount ?? playerConfig.mutations.length,
      // Ghoul Glow meter: clamp to the derived max HP (max Glow = max HP) so a
      // stored value from a since-shrunk build never reads above the cap.
      glow: Math.min(playerConfig.conditions.glow ?? 0, maxHealth),
      // Gourmand's curve input: the two meter tiers sum to the HungerThirstTier AV.
      hungerThirstTier: deriveHungerThirstTier(playerConfig.conditions),
      // Junkie's curve input: selected addictions minus ones suppressed by an
      // active addictive consumable (any category — docs/assumptions.md
      // "Consumable stacking & addictions"). Unconditional override: the
      // stored conditions value only feeds synthetic engine tests.
      addictionCount: deriveAddictionCount(
        playerConfig.addictions,
        suppressedAddictionsFor(mode, playerConfig.consumables, memo),
      ),
    }),
  );

  // Body-part mult + location axis: the Target section's race + part pick
  // resolves through BPTD data; without one the custom multiplier applies
  // and the location axis falls back to the engine's legacy mult-derived
  // category (resolveTargetBodyPart — single source of truth, also used by
  // the aim-point UI readouts).
  const { targetRace, targetBodyPart, targetLevel, epicRank } = enemyConfig.conditions;
  const resolvedTarget = cached(
    memo?.targetBodyPart,
    [targetRace, targetBodyPart, playerConfig.weakpointMult],
    () => resolveTargetBodyPart(mode, targetRace, targetBodyPart, playerConfig.weakpointMult),
  );

  // Enemy defenses (Phase 2 — Enemy defenses): resolves the same npc row the
  // body-part picker already joins via `targetRace`, at the stored (or
  // default-to-max) level. `getEnemyDefenses` returns null without a race
  // selected or a race with no npc data, which threads through as `undefined`
  // on ScenarioInput — scenarios.ts's `effective` field just stays absent.
  // `epicRank` is the Target section's ★ toggle (ignored by getEnemyDefenses
  // for races with a forced rank, and for non-epicAllowed races).
  const targetNpc = cached(memo?.targetNpc, [targetRace], () =>
    targetRace ? getNpc(mode, targetRace) : undefined,
  );
  const resolvedLevel = resolveTargetLevel(targetNpc, targetLevel);
  const enemyDefenses =
    cached(memo?.enemyDefenses, [targetRace, resolvedLevel, epicRank], () =>
      getEnemyDefenses(mode, targetRace, resolvedLevel, epicRank),
    ) ?? undefined;

  return {
    mode,
    weapon,
    itemLevel: playerConfig.itemLevel,
    modifiers,
    player,
    enemy: enemyConfig.conditions,
    enemyTypeIds,
    weakpointMult: resolvedTarget.mult,
    targetIsTorso: resolvedTarget.isTorso,
    // critRate omitted → computed from the crit meter (LCK, Crit Savvy,
    // Limit Breaking, weapon crit charge bonus).
    chargeTimeSec: playerConfig.chargeTimeSec,
    enemyDefenses,
    mitigationConstants: getMitigationConstants(mode),
    engineConstants: {
      vatsCrit: getVatsCritConstants(mode),
      actionPoints: getActionPointConstants(mode),
      bulletStorm: getBulletStormConstants(mode),
      distance: getDistanceConstants(mode),
    },
    bucketReads,
  };
}
