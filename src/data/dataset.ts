import type { GameMode, Perk, PerkId, Enemy, EnemyMutation, Weapon } from '@/types';
import type { GeneratedAddiction, GeneratedBodyPartRace, GeneratedOmod, GeneratedBuff, GeneratedPerk } from '@/types/generated';
import type { Modifier } from '@/types/modifiers';

import { weapons as weaponsLive } from './live/weapons';
import { perks as perkRegistryLive } from './live/perks';
import {
  enemies as enemiesLive,
  enemyMutations as enemyMutationsLive,
  legendaryRankModifiers as legendaryRankModifiersLive,
} from './live/enemies';
import { bodyArmor as bodyArmorLive } from './live/armor';
import { powerArmor as powerArmorLive } from './live/power-armor';

import { weapons as weaponsPts } from './pts/weapons';
import { perks as perkRegistryPts } from './pts/perks';
import {
  enemies as enemiesPts,
  enemyMutations as enemyMutationsPts,
  legendaryRankModifiers as legendaryRankModifiersPts,
} from './pts/enemies';
import { bodyArmor as bodyArmorPts } from './pts/armor';
import { powerArmor as powerArmorPts } from './pts/power-armor';

import { legendaryValueOverrides } from './overrides/legendary-values';
import { buffValueOverrides } from './overrides/buff-overrides';
import { omodModifierAdditions } from './overrides/corrections';
import generatedOmodsLive from './live/generated/omods.json';
import generatedPerksLive from './live/generated/perks.json';
import generatedMutationsLive from './live/generated/mutations.json';
import generatedConsumablesLive from './live/generated/consumables.json';
import generatedAddictionsLive from './live/generated/addictions.json';
import generatedBodyPartsLive from './live/generated/bodyparts.json';

/**
 * The single merged, mode-resolved view of the game data. Overlays (the
 * hand-maintained overrides layer) are applied ONCE here at construction, so
 * every accessor downstream reads already-merged data — there is no raw-vs-
 * merged inconsistency to pick the wrong side of.
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

type LegendaryRankModifiers = typeof legendaryRankModifiersLive;
type BodyArmor = typeof bodyArmorLive;
type PowerArmor = typeof powerArmorLive;

export interface Dataset {
  weapons: Record<string, Weapon>;
  omods: GeneratedOmod[];
  perks: GeneratedPerk[];
  perkRegistry: Record<PerkId, Perk>;
  mutations: GeneratedBuff[];
  consumables: GeneratedBuff[];
  /** Mode-wide addiction catalog (obtainable-only, see extract-buffs.ts) — mode-shared like mutations today. */
  addictions: GeneratedAddiction[];
  bodyPartRaces: GeneratedBodyPartRace[];
  enemies: Record<string, Enemy>;
  enemyMutations: Record<string, EnemyMutation>;
  legendaryRankModifiers: LegendaryRankModifiers;
  bodyArmor: BodyArmor;
  powerArmor: PowerArmor;
}

/** Hand-authored collections that would diverge per mode once a PTS dump exists. */
interface HandAuthored {
  weapons: Record<string, Weapon>;
  perkRegistry: Record<PerkId, Perk>;
  enemies: Record<string, Enemy>;
  enemyMutations: Record<string, EnemyMutation>;
  legendaryRankModifiers: LegendaryRankModifiers;
  bodyArmor: BodyArmor;
  powerArmor: PowerArmor;
}

// Generated (ESM-extracted) collections + overlays. Single ESM today, so these
// are shared across modes; per-mode generated data would be threaded here.
const mergedOmods = applyModifierAddition(
  applyModifierOverride(generatedOmodsLive as GeneratedOmod[], legendaryValueOverrides),
  omodModifierAdditions
);
const mergedMutations = applyModifierOverride(generatedMutationsLive as GeneratedBuff[], buffValueOverrides);
const mergedConsumables = applyModifierOverride(generatedConsumablesLive as GeneratedBuff[], buffValueOverrides);
const generatedPerks = generatedPerksLive as GeneratedPerk[];
const generatedAddictions = generatedAddictionsLive as GeneratedAddiction[];
const generatedBodyParts = generatedBodyPartsLive as GeneratedBodyPartRace[];

function buildDataset(hand: HandAuthored): Dataset {
  return {
    ...hand,
    omods: mergedOmods,
    perks: generatedPerks,
    mutations: mergedMutations,
    consumables: mergedConsumables,
    addictions: generatedAddictions,
    bodyPartRaces: generatedBodyParts,
  };
}

const datasets: Record<GameMode, Dataset> = {
  live: buildDataset({
    weapons: weaponsLive,
    perkRegistry: perkRegistryLive,
    enemies: enemiesLive,
    enemyMutations: enemyMutationsLive,
    legendaryRankModifiers: legendaryRankModifiersLive,
    bodyArmor: bodyArmorLive,
    powerArmor: powerArmorLive,
  }),
  pts: buildDataset({
    weapons: weaponsPts,
    perkRegistry: perkRegistryPts,
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
