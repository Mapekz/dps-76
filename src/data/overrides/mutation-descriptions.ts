import { CARNIVORE_MUTATION_ID, HERBIVORE_MUTATION_ID } from '@/lib/diet-mutations';

/**
 * Hand-authored description text for mutations that carry ZERO modifiers of
 * their own — `describeBuffModifiers` has nothing to derive from, so without
 * this override the Mutations section shows no explanation at all for an
 * implemented, engine-effective mutation.
 *
 * Herbivore/Carnivore realize their entire effect by rescaling OTHER
 * consumables' modifiers (`src/lib/diet-mutations.ts`'s `applyDietScaling`),
 * not via a modifier on the mutation record itself — ESM-proven mechanism
 * (see that file's header comment), just not expressible through the normal
 * per-modifier description path. `isDietMutation` already exempts both from
 * the "no effect yet" badge; this is the matching description text.
 */
export const mutationDescriptionOverrides: Readonly<Record<string, string>> = {
  [CARNIVORE_MUTATION_ID]:
    'Doubles meat-tagged food/drink effects (×2, or ×2.5 with Strange in Numbers); zeroes vegetable-tagged ones.',
  [HERBIVORE_MUTATION_ID]:
    'Doubles vegetable/herb/fruit-tagged food/drink effects (×2, or ×2.5 with Strange in Numbers); zeroes meat-tagged ones.',
};
