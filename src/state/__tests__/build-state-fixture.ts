import { PerkId } from '@/data/perk-ids';
import {
  createDefaultBuildState,
  makeBuildReducer,
  type BuildAction,
  type BuildState,
} from '@/state/build-reducer';

export const buildReducer = makeBuildReducer('live');

export function stateFrom(
  actions: readonly BuildAction[],
  from: BuildState = createDefaultBuildState(),
): BuildState {
  return actions.reduce(buildReducer, from);
}

/** The Fixer on an otherwise default build (every SPECIAL at 1). */
export function fixerOnlyState(): BuildState {
  return stateFrom([{ type: 'weapon/select', weaponId: 'CombatRifle_Fixer' }]);
}

/** The Fixer plus Center Masochist rank 1, spending base Perception's single card point. */
export function fixerCenterMasochistState(): BuildState {
  return stateFrom([
    { type: 'weapon/select', weaponId: 'CombatRifle_Fixer' },
    { type: 'perk/add', perkId: PerkId.CenterMasochist, rank: 1, legendary: false },
  ]);
}
