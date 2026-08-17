import type { WireDictionary } from './wire-dictionary/types';
import addictions from './wire-dictionary/addictions.json';
import armorEffects from './wire-dictionary/armor-effects.json';
import attachPoints from './wire-dictionary/attach-points.json';
import challengeIds from './wire-dictionary/challenge-ids.json';
import consumables from './wire-dictionary/consumables.json';
import mutations from './wire-dictionary/mutations.json';
import omods from './wire-dictionary/omods.json';
import perks from './wire-dictionary/perks.json';
import targetBodyParts from './wire-dictionary/target-body-parts.json';
import targetRaces from './wire-dictionary/target-races.json';
import weapons from './wire-dictionary/weapons.json';

export type WireDomain =
  | 'weapon'
  | 'omod'
  | 'attachPoint'
  | 'armorEffect'
  | 'perk'
  | 'mutation'
  | 'consumable'
  | 'addiction'
  | 'targetRace'
  | 'targetBodyPart'
  | 'challengeId';

const dictionaries: Record<WireDomain, WireDictionary> = {
  weapon: weapons,
  omod: omods,
  attachPoint: attachPoints,
  armorEffect: armorEffects,
  perk: perks,
  mutation: mutations,
  consumable: consumables,
  addiction: addictions,
  targetRace: targetRaces,
  targetBodyPart: targetBodyParts,
  challengeId: challengeIds,
};

const reverseCaches = new Map<WireDomain, Map<number, string>>();

function reverseForDomain(domain: WireDomain): Map<number, string> {
  let cache = reverseCaches.get(domain);
  if (!cache) {
    cache = new Map<number, string>();
    for (const [id, index] of Object.entries(dictionaries[domain].ids)) {
      if (!cache.has(index)) cache.set(index, id);
    }
    reverseCaches.set(domain, cache);
  }
  return cache;
}

/** undefined = not in the compiled-in dictionary. The caller MUST fall back to the wire's
 *  literal-string escape slot — never drop the value. */
export function wireIndexForId(domain: WireDomain, id: string): number | undefined {
  return dictionaries[domain].ids[id];
}

/** undefined = this integer has no known id (stale or adversarial payload). The caller emits its
 *  existing "unknown … — removed" warning. */
export function wireIdForIndex(domain: WireDomain, index: number): string | undefined {
  return reverseForDomain(domain).get(index);
}
