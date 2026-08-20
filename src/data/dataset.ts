import type { GameMode, Perk, PerkId, Weapon } from '@/types';
import type {
  GeneratedAddiction,
  GeneratedBodyPartRace,
  GeneratedConstants,
  GeneratedHealingItem,
  GeneratedNpc,
  GeneratedOmod,
  GeneratedBuff,
  GeneratedPerk,
  GeneratedUnique,
  GeneratedWeapon,
} from '@/types/generated';
import type { Modifier } from '@/types/modifiers';

import { buildWeapons, generatedWeaponsRaw as generatedWeaponsRawLive } from './live/weapons';
import { perks as perkNamesLive } from './live/perks';
import { bodyArmor as bodyArmorLive } from './live/armor';
import { powerArmor as powerArmorLive } from './live/power-armor';
import { generatedNpcsRaw as generatedNpcsRawLive } from './live/npcs';

import { generatedWeaponsRaw as generatedWeaponsRawPts } from './pts/weapons';
import { perks as perkNamesPts } from './pts/perks';
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
  splashReliantWeaponIds,
  buildSplashReliantCorrections,
  hiddenOmodIds,
  forceVisibleOmodIds,
  hiddenArmorOmodIds,
  forceVisibleArmorOmodIds,
  omodBadgeOverrides,
  omodWeaponRestrictions,
  perWeaponSlotLabelOverrides,
  hiddenConsumableIds,
  forceVisibleConsumableIds,
  consumableDescriptionOverrides,
  omodDescriptionOverrides,
} from './overrides/corrections';
import { perkFamilyOverrides, extraPerkModifiers } from './overrides/perk-overrides';
import { npcOverrides } from './overrides/npc-overrides';
import { armorPieceOverrides } from './overrides/armor-piece-overrides';
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
import generatedHealingItemsLive from './live/generated/healing-items.json';

/**
 * The single merged, mode-resolved view of the game data, and the one home
 * for the Overlay contract even though not every overlay applies AT this
 * chokepoint:
 *
 * - VALUE overlays (`legendaryValueOverrides`, `buffValueOverrides`,
 *   `omodModifierAdditions`) are folded into `.modifiers` right here in
 *   `buildDataset`, so every accessor reads already-merged modifiers.
 * - VISIBILITY overlay sets (`hidden*`/`forceVisible*`) are mode-resolved
 *   fields on the Dataset but are NOT folded into records here — they're
 *   applied downstream, in the mode-aware accessor for each
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
 * a PTS dump lands (`bun run extract --mode pts`), build a pts dataset here and
 * this is the only edit.
 */

/** Replace an item's `.modifiers` when an override is keyed by its id (omods, buffs). */
export function applyModifierOverride<T extends { id: string; modifiers: Modifier[] }>(
  items: T[],
  overridesById: Readonly<Record<string, Modifier[]>>,
): T[] {
  return items.map((item) => {
    const override = overridesById[item.id];
    return override ? { ...item, modifiers: override } : item;
  });
}

/** Replace the ESM-derived fallback `description` when keyed by the item's id (consumables, omods). */
export function applyDescriptionOverride<T extends { id: string; description?: string }>(
  items: T[],
  overridesById: Readonly<Record<string, string>>,
): T[] {
  return items.map((item) => {
    const override = overridesById[item.id];
    return override ? { ...item, description: override } : item;
  });
}

/** Concatenate additional modifiers onto an item's `.modifiers` when keyed by its id (omods). */
export function applyModifierAddition<T extends { id: string; modifiers: Modifier[] }>(
  items: T[],
  additionsById: Readonly<Record<string, Modifier[]>>,
): T[] {
  return items.map((item) => {
    const addition = additionsById[item.id];
    return addition ? { ...item, modifiers: [...item.modifiers, ...addition] } : item;
  });
}

/** Replace an item's display `.name` when an override is keyed by its id (omods — see omodNameOverrides). */
export function applyNameOverride<T extends { id: string; name: string }>(
  items: T[],
  namesById: Readonly<Record<string, string>>,
): T[] {
  return items.map((item) => {
    const name = namesById[item.id];
    return name ? { ...item, name } : item;
  });
}

/** Attach a picker badge override when keyed by omod id (omodBadgeOverrides). */
export function applyBadgeOverride<T extends { id: string }>(
  items: T[],
  badgesById: Readonly<Record<string, 'inert' | 'pendingMechanic'>>,
): (T & { badgeOverride?: 'inert' | 'pendingMechanic' })[] {
  return items.map((item) => {
    const badgeOverride = badgesById[item.id];
    return badgeOverride ? { ...item, badgeOverride } : item;
  });
}

/** Attach weapon-restriction rescue ids when keyed by omod id (omodWeaponRestrictions). */
export function applyWeaponRestrictions<T extends { id: string }>(
  items: T[],
  restrictionsById: Readonly<Record<string, readonly string[]>>,
): (T & { restrictedToWeaponIds?: readonly string[] })[] {
  return items.map((item) => {
    const restrictedToWeaponIds = restrictionsById[item.id];
    return restrictedToWeaponIds ? { ...item, restrictedToWeaponIds } : item;
  });
}

/** A generated OMOD with its id-keyed Overlays already applied — see buildDataset. */
export type MergedOmod = GeneratedOmod & {
  /** From omodBadgeOverrides: forces a picker badge for effects whose data can't move numbers yet. */
  badgeOverride?: 'inert' | 'pendingMechanic';
  /** From omodWeaponRestrictions: weapon edids this mod is rescued onto when it has no ESM-derivable tie. */
  restrictedToWeaponIds?: readonly string[];
};

/** Replace an npc record wholesale when an override targets its id (npc-overrides.ts REPLACES, not patches — see that file's header). */
export function applyNpcOverrides(
  items: GeneratedNpc[],
  overridesById: Readonly<Record<string, GeneratedNpc>>,
): GeneratedNpc[] {
  return items.map((item) => overridesById[item.id] ?? item);
}

type BodyArmor = typeof bodyArmorLive;
type PowerArmor = typeof powerArmorLive;

export interface Dataset {
  weapons: Record<string, Weapon>;
  omods: MergedOmod[];
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
  bodyArmor: BodyArmor;
  powerArmor: PowerArmor;
  /** Game-wide scalar constants (extract-constants.ts) — e.g. the SPECIAL clamp read via `getSpecialClamp`. */
  constants: GeneratedConstants;
  /** ESM-extracted base heal profiles for Stimpak/RadAway-adjacent items — see `getHealingItems`. */
  healingItems: GeneratedHealingItem[];
  hiddenWeaponIds: ReadonlySet<string>;
  forceVisibleWeaponIds: ReadonlySet<string>;
  hiddenOmodIds: ReadonlySet<string>;
  forceVisibleOmodIds: ReadonlySet<string>;
  hiddenArmorOmodIds: ReadonlySet<string>;
  forceVisibleArmorOmodIds: ReadonlySet<string>;
  hiddenConsumableIds: ReadonlySet<string>;
  forceVisibleConsumableIds: ReadonlySet<string>;
  /** Weapon × attach-point slot labels — not omod-keyed, so it cannot ride MergedOmod. */
  perWeaponSlotLabelOverrides: Readonly<Record<string, Readonly<Record<string, string>>>>;
  omodModifierAdditions: Readonly<Record<string, Modifier[]>>;
}

/** Hand-authored collections that would diverge per mode once a PTS dump exists. */
export interface HandAuthored {
  /** Name-only PerkId registry; `perkRegistry` (special/maxRank/costs) is DERIVED below (perk-cards.ts). */
  perkNames: Record<PerkId, PerkNameEntry>;
  bodyArmor: BodyArmor;
  powerArmor: PowerArmor;
}

export interface DatasetSource {
  generatedWeapons: GeneratedWeapon[];
  generatedOmods: GeneratedOmod[];
  generatedArmorOmods: GeneratedOmod[];
  generatedPerks: GeneratedPerk[];
  generatedMutations: GeneratedBuff[];
  generatedConsumables: GeneratedBuff[];
  generatedAddictions: GeneratedAddiction[];
  generatedBodyParts: GeneratedBodyPartRace[];
  generatedUniques: GeneratedUnique[];
  generatedNpcs: GeneratedNpc[];
  constants: GeneratedConstants;
  /** Optional so synthetic test sources (dataset-build.test.ts) omit it. */
  healingItems?: GeneratedHealingItem[];
  legendaryValueOverrides: Readonly<Record<string, Modifier[]>>;
  armorLegendaryValueOverrides: Readonly<Record<string, Modifier[]>>;
  buffValueOverrides: Readonly<Record<string, Modifier[]>>;
  npcOverrides: Readonly<Record<string, GeneratedNpc>>;
  weaponCorrections: Readonly<Record<string, Partial<Weapon>>>;
  hiddenWeaponIds: ReadonlySet<string>;
  forceVisibleWeaponIds: ReadonlySet<string>;
  /** Optional so synthetic test sources (dataset-build.test.ts) omit it. */
  splashReliantWeaponIds?: ReadonlySet<string>;
  hiddenOmodIds: ReadonlySet<string>;
  forceVisibleOmodIds: ReadonlySet<string>;
  hiddenArmorOmodIds: ReadonlySet<string>;
  forceVisibleArmorOmodIds: ReadonlySet<string>;
  hiddenConsumableIds: ReadonlySet<string>;
  forceVisibleConsumableIds: ReadonlySet<string>;
  /** Optional so synthetic test sources (dataset-build.test.ts) omit it. */
  consumableDescriptionOverrides?: Readonly<Record<string, string>>;
  /** Optional so synthetic test sources (dataset-build.test.ts) omit it. */
  omodDescriptionOverrides?: Readonly<Record<string, string>>;
  omodBadgeOverrides: Readonly<Record<string, 'inert' | 'pendingMechanic'>>;
  omodWeaponRestrictions: Readonly<Record<string, readonly string[]>>;
  omodNameOverrides: Readonly<Record<string, string>>;
  perWeaponSlotLabelOverrides: Readonly<Record<string, Readonly<Record<string, string>>>>;
  omodModifierAdditions: Readonly<Record<string, Modifier[]>>;
}

/** Build one Merged Dataset from explicit generated, hand-authored, and Overlay inputs. */
export function buildDataset(hand: HandAuthored, source: DatasetSource): Dataset {
  const { perkNames, bodyArmor, powerArmor } = hand;
  const mergedOmods = applyDescriptionOverride(
    applyWeaponRestrictions(
      applyBadgeOverride(
        applyNameOverride(
          applyModifierAddition(
            applyModifierOverride(source.generatedOmods, source.legendaryValueOverrides),
            source.omodModifierAdditions,
          ),
          source.omodNameOverrides,
        ),
        source.omodBadgeOverrides,
      ),
      source.omodWeaponRestrictions,
    ),
    source.omodDescriptionOverrides ?? {},
  );
  const mergedArmorOmods = applyModifierOverride(
    source.generatedArmorOmods,
    source.armorLegendaryValueOverrides,
  );
  const mergedWeaponCorrections = {
    ...source.weaponCorrections,
    ...buildSplashReliantCorrections(source.splashReliantWeaponIds ?? new Set()),
  };
  return {
    weapons: buildWeapons(
      source.generatedWeapons,
      { hidden: source.hiddenWeaponIds, forceVisible: source.forceVisibleWeaponIds },
      mergedWeaponCorrections,
    ),
    omods: mergedOmods,
    armorOmods: mergedArmorOmods,
    uniques: source.generatedUniques,
    perks: source.generatedPerks,
    perkRegistry: derivePerkRegistry(perkNames, source.generatedPerks),
    mutations: applyModifierOverride(source.generatedMutations, source.buffValueOverrides),
    consumables: applyDescriptionOverride(
      applyModifierOverride(source.generatedConsumables, source.buffValueOverrides),
      source.consumableDescriptionOverrides ?? {},
    ),
    addictions: source.generatedAddictions,
    bodyPartRaces: source.generatedBodyParts,
    npcs: applyNpcOverrides(source.generatedNpcs, source.npcOverrides),
    bodyArmor,
    powerArmor,
    constants: source.constants,
    healingItems: source.healingItems ?? [],
    hiddenWeaponIds: source.hiddenWeaponIds,
    forceVisibleWeaponIds: source.forceVisibleWeaponIds,
    hiddenOmodIds: source.hiddenOmodIds,
    forceVisibleOmodIds: source.forceVisibleOmodIds,
    hiddenArmorOmodIds: source.hiddenArmorOmodIds,
    forceVisibleArmorOmodIds: source.forceVisibleArmorOmodIds,
    hiddenConsumableIds: source.hiddenConsumableIds,
    forceVisibleConsumableIds: source.forceVisibleConsumableIds,
    perWeaponSlotLabelOverrides: source.perWeaponSlotLabelOverrides,
    omodModifierAdditions: source.omodModifierAdditions,
  };
}

const liveSource: DatasetSource = {
  generatedWeapons: generatedWeaponsRawLive,
  generatedOmods: generatedOmodsLive as GeneratedOmod[],
  generatedArmorOmods: generatedArmorOmodsLive as GeneratedOmod[],
  generatedPerks: generatedPerksLive as GeneratedPerk[],
  generatedMutations: generatedMutationsLive as GeneratedBuff[],
  generatedConsumables: generatedConsumablesLive as GeneratedBuff[],
  generatedAddictions: generatedAddictionsLive as GeneratedAddiction[],
  generatedBodyParts: generatedBodyPartsLive as GeneratedBodyPartRace[],
  generatedUniques: generatedUniquesLive as unknown as GeneratedUnique[],
  generatedNpcs: generatedNpcsRawLive,
  constants: generatedConstantsLive as GeneratedConstants,
  healingItems: generatedHealingItemsLive as GeneratedHealingItem[],
  legendaryValueOverrides,
  armorLegendaryValueOverrides,
  buffValueOverrides,
  npcOverrides,
  weaponCorrections,
  hiddenWeaponIds,
  forceVisibleWeaponIds,
  splashReliantWeaponIds,
  hiddenOmodIds,
  forceVisibleOmodIds,
  hiddenArmorOmodIds,
  forceVisibleArmorOmodIds,
  hiddenConsumableIds,
  forceVisibleConsumableIds,
  consumableDescriptionOverrides,
  omodDescriptionOverrides,
  omodBadgeOverrides,
  omodWeaponRestrictions,
  omodNameOverrides,
  perWeaponSlotLabelOverrides,
  omodModifierAdditions,
};

const datasets: Record<GameMode, Dataset> = {
  live: buildDataset(
    {
      perkNames: perkNamesLive,
      bodyArmor: bodyArmorLive,
      powerArmor: powerArmorLive,
    },
    liveSource,
  ),
  pts: buildDataset(
    {
      perkNames: perkNamesPts,
      bodyArmor: bodyArmorPts,
      powerArmor: powerArmorPts,
    },
    { ...liveSource, generatedWeapons: generatedWeaponsRawPts },
  ),
};

/**
 * The single mode-resolved view of all game data (CONTEXT.md's **Merged
 * Dataset**). VALUE overlays (legendary/buff/omod modifier overrides) are
 * folded in right here, so every accessor reads already-merged modifiers.
 * VISIBILITY overlay sets (hidden/forceVisible) are also reachable through
 * this function, but apply downstream, in each collection's own accessor —
 * by design: a build that already selected a since-hidden omod/consumable
 * must keep computing, only the picker should stop offering it, while a
 * hidden weapon record (never real player content) is dropped from the
 * dataset entirely. This module stays the one home for the Overlay
 * *contract* even where it isn't the one applying it.
 */
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
  /** The id that no longer resolves to a generated record for this mode, or is a no-op override. */
  key: string;
}

/** Raw (pre-visibility-filter) generated weapon ids for `mode` — see live/weapons.ts's `generatedWeaponsRaw`. */
function generatedWeaponIdsFor(mode: GameMode): ReadonlySet<string> {
  const raw = mode === 'live' ? generatedWeaponsRawLive : generatedWeaponsRawPts;
  return new Set(raw.map((w) => w.id));
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
  // A VALUE overlay is stale when it's redundant, not just when its key is
  // gone: an entry whose value already equals what the generated record
  // holds does nothing (see the Camden Whacker/Relic Reaper omodNameOverrides
  // entries this caught — the extractor's own synthesis had converged on the
  // override's value, so the override was dead weight with no signal short
  // of a reviewer noticing by hand).
  const checkNoOpValue = <T>(
    overlay: string,
    overridesById: Readonly<Record<string, T>>,
    byId: ReadonlyMap<string, T>,
  ) => {
    for (const [key, value] of Object.entries(overridesById)) {
      if (byId.has(key) && byId.get(key) === value)
        out.push({ overlay: `${overlay} (no-op value)`, key });
    }
  };

  const weaponIds = generatedWeaponIdsFor(mode);
  check('weaponCorrections', Object.keys(weaponCorrections), weaponIds);
  check('hiddenWeaponIds', hiddenWeaponIds, weaponIds);
  check('forceVisibleWeaponIds', forceVisibleWeaponIds, weaponIds);

  // omods/perks/mutations/consumables have no live/pts split yet (single ESM
  // — see the HandAuthored comment above); read straight off the shared
  // generated collections, same as buildDataset does.
  const omodIds = new Set(generatedOmodsLive.map((o) => o.id));
  const omodNamesById = new Map(generatedOmodsLive.map((o) => [o.id, o.name]));
  check('legendaryValueOverrides', Object.keys(legendaryValueOverrides), omodIds);
  check('omodModifierAdditions', Object.keys(omodModifierAdditions), omodIds);
  check('hiddenOmodIds', hiddenOmodIds, omodIds);
  check('forceVisibleOmodIds', forceVisibleOmodIds, omodIds);
  check('omodBadgeOverrides', Object.keys(omodBadgeOverrides), omodIds);
  check('omodNameOverrides', Object.keys(omodNameOverrides), omodIds);
  checkNoOpValue('omodNameOverrides', omodNameOverrides, omodNamesById);
  check('omodWeaponRestrictions (key)', Object.keys(omodWeaponRestrictions), omodIds);
  for (const [omodId, weaponRefs] of Object.entries(omodWeaponRestrictions)) {
    check(`omodWeaponRestrictions[${omodId}] (weapon ref)`, weaponRefs, weaponIds);
  }

  const armorOmods = generatedArmorOmodsLive as GeneratedOmod[];
  const armorOmodIds = new Set(armorOmods.map((o) => o.id));
  check('armorLegendaryValueOverrides', Object.keys(armorLegendaryValueOverrides), armorOmodIds);
  check('hiddenArmorOmodIds', hiddenArmorOmodIds, armorOmodIds);
  check('forceVisibleArmorOmodIds', forceVisibleArmorOmodIds, armorOmodIds);
  const armorEffectNames = new Set(armorOmods.map((o) => o.name));
  check('armorPieceOverrides', Object.keys(armorPieceOverrides), armorEffectNames);

  const buffIds = new Set(
    [...generatedMutationsLive, ...generatedConsumablesLive].map((b) => b.id),
  );
  check('buffValueOverrides', Object.keys(buffValueOverrides), buffIds);
  check('hiddenConsumableIds', hiddenConsumableIds, buffIds);
  check('forceVisibleConsumableIds', forceVisibleConsumableIds, buffIds);
  const consumableIds = new Set(generatedConsumablesLive.map((b) => b.id));
  check(
    'consumableDescriptionOverrides',
    Object.keys(consumableDescriptionOverrides),
    consumableIds,
  );
  const generatedDescById = new Map<string, string>();
  for (const b of generatedConsumablesLive as GeneratedBuff[]) {
    if (b.description !== undefined) generatedDescById.set(b.id, b.description);
  }
  checkNoOpValue(
    'consumableDescriptionOverrides',
    consumableDescriptionOverrides,
    generatedDescById,
  );
  check('omodDescriptionOverrides', Object.keys(omodDescriptionOverrides), omodIds);
  const generatedOmodDescById = new Map(generatedOmodsLive.map((o) => [o.id, o.description]));
  checkNoOpValue('omodDescriptionOverrides', omodDescriptionOverrides, generatedOmodDescById);

  const familyIds = new Set(generatedPerksLive.map((p) => p.family));
  check('perkFamilyOverrides (target family)', Object.values(perkFamilyOverrides), familyIds);
  check('extraPerkModifiers', Object.keys(extraPerkModifiers), familyIds);

  const npcIds = new Set(generatedNpcsRawLive.map((n) => n.id));
  check('npcOverrides', Object.keys(npcOverrides), npcIds);

  return out;
}

if (import.meta.env?.DEV) {
  for (const mode of Object.keys(datasets) as GameMode[]) {
    const unresolved = getUnresolvedOverrideKeys(mode);
    if (unresolved.length > 0) {
      console.warn(
        `[dataset] ${unresolved.length} stale Overlay key(s) for mode "${mode}" — an extraction rename likely ` +
          `orphaned these (they're silently inert): ${unresolved.map((u) => `${u.overlay}:${u.key}`).join(', ')}`,
      );
    }
  }
}
