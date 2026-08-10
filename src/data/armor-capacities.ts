import type {
  ArmorPieceClass,
  ArmorSlotGroup,
  ArmorType,
  FeasibilityFamilyKey,
} from './armor-types';

/** Per-star-tier budget: sum of worn-piece counts for all legendary effects sharing a tier must stay ≤ this. */
export const MAX_LEGENDARY_COUNT = 5;

export const GROUP_ORDER: readonly ArmorSlotGroup[] = ['lining', 'material', 'misc', 'legendary'];

const BODY_ARMOR_CAPACITIES: Readonly<Record<ArmorPieceClass, number>> = {
  torso: 1,
  arm: 2,
  leg: 2,
  helmet: 0,
  underarmorStyle: 0,
  underarmorLining: 0,
};

const POWER_ARMOR_CAPACITIES: Readonly<Record<ArmorPieceClass, number>> = {
  torso: 1,
  arm: 2,
  leg: 2,
  helmet: 1,
  underarmorStyle: 0,
  underarmorLining: 0,
};

const UNDERARMOR_STYLE_CAPACITIES: Readonly<Record<ArmorPieceClass, number>> = {
  torso: 0,
  arm: 0,
  leg: 0,
  helmet: 0,
  underarmorStyle: 1,
  underarmorLining: 0,
};

const UNDERARMOR_LINING_CAPACITIES: Readonly<Record<ArmorPieceClass, number>> = {
  torso: 0,
  arm: 0,
  leg: 0,
  helmet: 0,
  underarmorStyle: 0,
  underarmorLining: 1,
};

const FAMILY_CAPACITIES: Readonly<
  Record<FeasibilityFamilyKey, Readonly<Record<ArmorPieceClass, number>>>
> = {
  'bodyArmor:material': BODY_ARMOR_CAPACITIES,
  'bodyArmor:misc': BODY_ARMOR_CAPACITIES,
  'powerArmor:misc': POWER_ARMOR_CAPACITIES,
  underarmorStyle: UNDERARMOR_STYLE_CAPACITIES,
  underarmorLining: UNDERARMOR_LINING_CAPACITIES,
};

export function maxCountFromReach(
  reach: ReadonlySet<ArmorPieceClass>,
  armorType: ArmorType,
): number {
  if (reach.has('underarmorStyle')) return UNDERARMOR_STYLE_CAPACITIES.underarmorStyle;
  if (reach.has('underarmorLining')) return UNDERARMOR_LINING_CAPACITIES.underarmorLining;

  const capacities = armorType === 'powerArmor' ? POWER_ARMOR_CAPACITIES : BODY_ARMOR_CAPACITIES;
  let sum = 0;
  for (const cls of reach) sum += capacities[cls];
  return sum > 0 ? sum : 1;
}

export function activeClasses(
  capacities: Readonly<Record<ArmorPieceClass, number>>,
): ArmorPieceClass[] {
  return (Object.keys(capacities) as ArmorPieceClass[]).filter((c) => capacities[c] > 0);
}

export { FAMILY_CAPACITIES };
