import type { GameMode, Perk, PerkId, Enemy, EnemyMutation, Weapon } from '@/types';
import type { GeneratedAddiction, GeneratedBodyPartRace, GeneratedConstants, GeneratedNpc, GeneratedOmod, GeneratedBuff, GeneratedPerk, GeneratedUnique } from '@/types/generated';
import type { Modifier } from '@/types/modifiers';

import { weapons as weaponsLive, generatedWeaponsRaw as generatedWeaponsRawLive } from './live/weapons';
import { perks as perkNamesLive } from './live/perks';
import {
  enemies as enemiesLive,
  enemyMutations as enemyMutationsLive,
  legendaryRankModifiers as legendaryRankModifiersLive,
} from './live/enemies';
import { bodyArmor as bodyArmorLive } from './live/armor';
import { powerArmor as powerArmorLive } from './live/power-armor';
import { generatedNpcsRaw as generatedNpcsRawLive } from './live/npcs';

import { weapons as weaponsPts, generatedWeaponsRaw as generatedWeaponsRawPts } from './pts/weapons';
import { perks as perkNamesPts } from './pts/perks';
import {
  enemies as enemiesPts,
  enemyMutations as enemyMutationsPts,
  legendaryRankModifiers as legendaryRankModifiersPts,
} from './pts/enemies';
import { bodyArmor as bodyArmorPts } from './pts/armor';
import { powerArmor as powerArmorPts } from './pts/power-armor';

import { legendaryValueOverrides } from './overrides/legendary-values';
import { armorLegendaryValueOverrides } from './overrides/armor-values';
import { buffValueOverrides } from './overrides/buff-overrides';
import {
  omodModifierAdditions,
  omodNameOverrides,
  weaponCorrections,
  hiddenWeaponIds,
  forceVisibleWeaponIds,
  hiddenOmodIds,
  forceVisibleOmodIds,
  hiddenArmorOmodIds,
  omodBadgeOverrides,
  omodWeaponRestrictions,
  hiddenConsumableIds,
  forceVisibleConsumableIds,
} from './overrides/corrections';
import { perkFamilyOverrides, extraPerkModifiers } from './overrides/perk-overrides';
import { npcOverrides } from './overrides/npc-overrides';
import { derivePerkRegistry, type PerkNameEntry } from './perk-cards';
import generatedOmodsLive from './live/generated/omods.json';
import generatedArmorOmodsLive from './live/generated/armor-omods.json';
import generatedPerksLive from './live/generated/perks.json';
import generatedMutationsLive from './live/generated/mutations.json';
import generatedConsumablesLive from './live/generated/consumables.json';
import generatedAddictionsLive from './live/generated/addictions.json';
import generatedBodyPartsLive from './live/generated/bodyparts.json';
import generatedUniquesLive from './live/generated/uniques.json';
import generatedConstantsLive from './live/generated/constants.json';

/**
 * The single merged, mode-resolved view of the game data, and the one home
 * for the Overlay contract even though not every overlay applies AT this
 * chokepoint:
 *
 * - VALUE overlays (`legendaryValueOverrides`, `buffValueOverrides`,
 *   `omodModifierAdditions`) are folded into `.modifiers` right here in
 *   `buildDataset`, so every accessor reads already-merged modifiers.
 * - VISIBILITY overlays (`hidden*`/`forceVisible*`) are NOT folded here —
 *   they're applied downstream, in the mode-aware accessor for each
 *   collection (`live/weapons.ts`, `buffs.ts`, `omods.ts`), by design: hidden
 *   omods/consumables must stay fully computable for a build that already
 *   selected one (only the picker should stop offering them), while hidden
 *   *weapon* records are dropped entirely (they were never real player
 *   content). One shape can't serve both rules, so each accessor applies its
 *   own — sharing the predicate (`./overlay.ts`'s `isRecordVisible`), not the
 *   application site. `getUnresolvedOverrideKeys` below is what keeps this
 *   split honest: it validates every overlay table (value AND visibility)
 *   against the mode's real generated ids, wherever it's actually applied.
 * - FIELD overlays (`weaponCorrections`) apply in the adapter layer
 *   (`adaptWeapon`, `live/weapons.ts`) per ADR-0001 — that's the sanctioned
 *   `GeneratedWeapon → Weapon` transform, not this chokepoint's job.
 *
 * This is the one place the live/pts split is decided. Only a single ESM is
 * extracted today, so both modes resolve to the same live-backed dataset; when
 * a PTS dump lands (`pnpm extract --mode pts`), build a pts dataset here and
 * this is the only edit.
 */

/** Replace an item's `.modifiers` when an override is keyed by its id (omods, buffs). */
export function applyModifierOverride<T extends { id: string; modifiers: Modifier[] }>(
  items: T[],
  overridesById: Readonly<Record<string, Modifier[]>>
): T[] {
  return items.map(item => {
    const override = overridesById[item.id];
    return override ? { ...item, modifiers: override } : item;
  });
}

/** Concatenate additional modifiers onto an item's `.modifiers` when keyed by its id (omods). */
export function applyModifierAddition<T extends { id: string; modifiers: Modifier[] }>(
  items: T[],
  additionsById: Readonly<Record<string, Modifier[]>>
): T[] {
  return items.map(item => {
    const addition = additionsById[item.id];
    return addition ? { ...item, modifiers: [...item.modifiers, ...addition] } : item;
  });
}

/** Replace an item's display `.name` when an override is keyed by its id (omods — see omodNameOverrides). */
export function applyNameOverride<T extends { id: string; name: string }>(
  items: T[],
  namesById: Readonly<Record<string, string>>
): T[] {
  return items.map(item => {
    const name = namesById[item.id];
    return name ? { ...item, name } : item;
  });
}

/** Replace an npc record wholesale when an override targets its id (npc-overrides.ts REPLACES, not patches — see that file's header). */
export function applyNpcOverrides(items: GeneratedNpc[], overridesById: Readonly<Record<string, GeneratedNpc>>): GeneratedNpc[] {
  return items.map(item => overridesById[item.id] ?? item);
}

type LegendaryRankModifiers = typeof legendaryRankModifiersLive;
type BodyArmor = typeof bodyArmorLive;
type PowerArmor = typeof powerArmorLive;

export interface Dataset {
  weapons: Record<string, Weapon>;
  omods: GeneratedOmod[];
  /** Armor/power-armor OMODs (Phase 3 armor pipeline) — feeds src/data/armor-modifiers.ts, not the weapon mod pickers. */
  armorOmods: GeneratedOmod[];
  uniques: GeneratedUnique[];
  perks: GeneratedPerk[];
  perkRegistry: Record<PerkId, Perk>;
  mutations: GeneratedBuff[];
  consumables: GeneratedBuff[];
  /** Mode-wide addiction catalog (obtainable-only, see extract-buffs.ts) — mode-shared like mutations today. */
  addictions: GeneratedAddiction[];
  bodyPartRaces: GeneratedBodyPartRace[];
  npcs: GeneratedNpc[];
  enemies: Record<string, Enemy>;
  enemyMutations: Record<string, EnemyMutation>;
  legendaryRankModifiers: LegendaryRankModifiers;
  bodyArmor: BodyArmor;
  powerArmor: PowerArmor;
  /** Game-wide scalar constants (extract-constants.ts) — e.g. the SPECIAL clamp read via `getSpecialClamp`. */
  constants: GeneratedConstants;
}

/** Hand-authored collections that would diverge per mode once a PTS dump exists. */
interface HandAuthored {
  weapons: Record<string, Weapon>;
  /** Name-only PerkId registry; `perkRegistry` (special/maxRank/costs) is DERIVED below (perk-cards.ts). */
  perkNames: Record<PerkId, PerkNameEntry>;
  enemies: Record<string, Enemy>;
  enemyMutations: Record<string, EnemyMutation>;
  legendaryRankModifiers: LegendaryRankModifiers;
  bodyArmor: BodyArmor;
  powerArmor: PowerArmor;
}

// Generated (ESM-extracted) collections + overlays. Single ESM today, so these
// are shared across modes; per-mode generated data would be threaded here.
const mergedOmods = applyNameOverride(
  applyModifierAddition(
    applyModifierOverride(generatedOmodsLive as GeneratedOmod[], legendaryValueOverrides),
    omodModifierAdditions
  ),
  omodNameOverrides
);
// Armor/PA OMODs get the same value-override treatment as weapon omods
// (armorLegendaryValueOverrides — condition-shape fixes, see that file's
// header) but no name/addition overlays exist for this collection yet.
const mergedArmorOmods = applyModifierOverride(
  generatedArmorOmodsLive as GeneratedOmod[],
  armorLegendaryValueOverrides
);
const mergedMutations = applyModifierOverride(generatedMutationsLive as GeneratedBuff[], buffValueOverrides);
const mergedConsumables = applyModifierOverride(generatedConsumablesLive as GeneratedBuff[], buffValueOverrides);
const generatedPerks = generatedPerksLive as GeneratedPerk[];
const generatedAddictions = generatedAddictionsLive as GeneratedAddiction[];
const generatedBodyParts = generatedBodyPartsLive as GeneratedBodyPartRace[];
const generatedUniques = generatedUniquesLive as unknown as GeneratedUnique[];
const mergedNpcs = applyNpcOverrides(generatedNpcsRawLive, npcOverrides);

function buildDataset(hand: HandAuthored): Dataset {
  const { perkNames, ...rest } = hand;
  return {
    ...rest,
    omods: mergedOmods,
    armorOmods: mergedArmorOmods,
    uniques: generatedUniques,
    perks: generatedPerks,
    perkRegistry: derivePerkRegistry(perkNames, generatedPerks),
    mutations: mergedMutations,
    consumables: mergedConsumables,
    addictions: generatedAddictions,
    bodyPartRaces: generatedBodyParts,
    npcs: mergedNpcs,
    constants: generatedConstantsLive as GeneratedConstants,
  };
}

const datasets: Record<GameMode, Dataset> = {
  live: buildDataset({
    weapons: weaponsLive,
    perkNames: perkNamesLive,
    enemies: enemiesLive,
    enemyMutations: enemyMutationsLive,
    legendaryRankModifiers: legendaryRankModifiersLive,
    bodyArmor: bodyArmorLive,
    powerArmor: powerArmorLive,
  }),
  pts: buildDataset({
    weapons: weaponsPts,
    perkNames: perkNamesPts,
    enemies: enemiesPts,
    enemyMutations: enemyMutationsPts,
    legendaryRankModifiers: legendaryRankModifiersPts,
    bodyArmor: bodyArmorPts,
    powerArmor: powerArmorPts,
  }),
};

export function getDataset(mode: GameMode): Dataset {
  return datasets[mode];
}

// ── Overlay reviewer ─────────────────────────────────────────────────────
//
// Every overlay table above is keyed by a generated id (edid) that can go
// stale on re-extraction: an ESM rename orphans the override silently — it
// just stops applying, with no error. Per-mode because the same override can
// resolve on Live and drift on PTS (or vice versa) once PTS gets its own
// extraction; each side needs to be checked against ITS OWN generated ids so
// a Live-only or PTS-only break is attributable. Report-and-warn, not
// throw: a stale key means "this one override is inert", not "the app is
// broken" — see docs/adr/0002 (Mode is a comparison axis) for why the app
// must keep running per-mode while the underlying data is fixed.

export interface UnresolvedOverrideKey {
  /** The overlay table (export name in overrides/*.ts) the stale key lives in. */
  overlay: string;
  /** The id that no longer resolves to a generated record for this mode. */
  key: string;
}

/** Raw (pre-visibility-filter) generated weapon ids for `mode` — see live/weapons.ts's `generatedWeaponsRaw`. */
function generatedWeaponIdsFor(mode: GameMode): ReadonlySet<string> {
  const raw = mode === 'live' ? generatedWeaponsRawLive : generatedWeaponsRawPts;
  return new Set(raw.map(w => w.id));
}

/**
 * Every Overlay key that no longer resolves to a live generated id for
 * `mode` — the generalization of `getUnjoinedPerkIds` (perk-modifiers.ts) to
 * every override table, in both directions the perk reviewer doesn't cover
 * (value overrides, visibility, field corrections, weapon restrictions).
 * Asserted empty by a test per mode; `buildDataset` below also dev-warns.
 */
export function getUnresolvedOverrideKeys(mode: GameMode): UnresolvedOverrideKey[] {
  const out: UnresolvedOverrideKey[] = [];
  const check = (overlay: string, keys: Iterable<string>, valid: ReadonlySet<string>) => {
    for (const key of keys) if (!valid.has(key)) out.push({ overlay, key });
  };

  const weaponIds = generatedWeaponIdsFor(mode);
  check('weaponCorrections', Object.keys(weaponCorrections), weaponIds);
  check('hiddenWeaponIds', hiddenWeaponIds, weaponIds);
  check('forceVisibleWeaponIds', forceVisibleWeaponIds, weaponIds);

  // omods/perks/mutations/consumables have no live/pts split yet (single ESM
  // — see the HandAuthored comment above); read straight off the shared
  // generated collections, same as buildDataset does.
  const omodIds = new Set(generatedOmodsLive.map(o => o.id));
  check('legendaryValueOverrides', Object.keys(legendaryValueOverrides), omodIds);
  check('omodModifierAdditions', Object.keys(omodModifierAdditions), omodIds);
  check('hiddenOmodIds', hiddenOmodIds, omodIds);
  check('forceVisibleOmodIds', forceVisibleOmodIds, omodIds);
  check('omodBadgeOverrides', Object.keys(omodBadgeOverrides), omodIds);
  check('omodNameOverrides', Object.keys(omodNameOverrides), omodIds);
  check('omodWeaponRestrictions (key)', Object.keys(omodWeaponRestrictions), omodIds);
  for (const [omodId, weaponRefs] of Object.entries(omodWeaponRestrictions)) {
    check(`omodWeaponRestrictions[${omodId}] (weapon ref)`, weaponRefs, weaponIds);
  }

  const armorOmodIds = new Set((generatedArmorOmodsLive as GeneratedOmod[]).map(o => o.id));
  check('armorLegendaryValueOverrides', Object.keys(armorLegendaryValueOverrides), armorOmodIds);
  check('hiddenArmorOmodIds', hiddenArmorOmodIds, armorOmodIds);

  const buffIds = new Set([...generatedMutationsLive, ...generatedConsumablesLive].map(b => b.id));
  check('buffValueOverrides', Object.keys(buffValueOverrides), buffIds);
  check('hiddenConsumableIds', hiddenConsumableIds, buffIds);
  check('forceVisibleConsumableIds', forceVisibleConsumableIds, buffIds);

  const familyIds = new Set(generatedPerksLive.map(p => p.family));
  check('perkFamilyOverrides (target family)', Object.values(perkFamilyOverrides), familyIds);
  check('extraPerkModifiers', Object.keys(extraPerkModifiers), familyIds);

  const npcIds = new Set(generatedNpcsRawLive.map(n => n.id));
  check('npcOverrides', Object.keys(npcOverrides), npcIds);

  return out;
}

if (import.meta.env?.DEV) {
  for (const mode of Object.keys(datasets) as GameMode[]) {
    const unresolved = getUnresolvedOverrideKeys(mode);
    if (unresolved.length > 0) {
      console.warn(
        `[dataset] ${unresolved.length} stale Overlay key(s) for mode "${mode}" — an extraction rename likely ` +
          `orphaned these (they're silently inert): ${unresolved.map(u => `${u.overlay}:${u.key}`).join(', ')}`
      );
    }
  }
}
