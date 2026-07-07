import type { Modifier } from '@/types/modifiers';

/**
 * Hand-authored modifiers for mutations/consumables whose ESM magnitudes are
 * script-computed. Keyed by buff id (SPEL/ALCH edid); when present these
 * REPLACE the extracted modifiers. Values pending golden validation
 * (docs/assumptions.md).
 */
export const buffValueOverrides: Readonly<Record<string, Modifier[]>> = {
  // Adrenal Reaction (post-overhaul): +damage per KILL STREAK stack. The kill
  // streak counter caps at 10 (user-confirmed; the legendary Adrenal curve's
  // x-domain also ends at 10). ESM curves Mutation_Adrenal_Normal (1→5,
  // 20→100) / _Super (1→6.25, 20→125) are linear 5%/stack (6.25 with Strange
  // in Numbers) — the x range past 10 is unreachable.
  //
  // RETIRE AFTER ESM-CLI FIX: hand-carried because of a confirmed esm-parser
  // bug that associates the curves with the wrong effects on this record
  // (they belong to the two abPerkFortifyDmgAll effects, #6/#7). The user is
  // fixing the parser separately — once fixed, re-run `pnpm extract --only
  // buffs`, verify Mutation_AdrenalReaction emits the two curve modifiers,
  // and delete this entry (overrides REPLACE extracted modifiers, so keeping
  // it too long is safe but hides the extracted values).
  Mutation_AdrenalReaction: [
    {
      id: 'override:AdrenalReaction:normal',
      source: { kind: 'mutation', formId: 'Mutation_AdrenalReaction', edid: 'Mutation_AdrenalReaction', name: 'Adrenal Reaction' },
      bucket: 'dbm', op: 'ADD', value: 0.05,
      conditions: [
        { kind: 'stacks', counter: 'adrenaline', max: 10 },
        { kind: 'strangeInNumbers', value: false },
      ],
    },
    {
      id: 'override:AdrenalReaction:super',
      source: { kind: 'mutation', formId: 'Mutation_AdrenalReaction', edid: 'Mutation_AdrenalReaction', name: 'Adrenal Reaction' },
      bucket: 'dbm', op: 'ADD', value: 0.0625,
      conditions: [
        { kind: 'stacks', counter: 'adrenaline', max: 10 },
        { kind: 'strangeInNumbers', value: true },
      ],
    },
  ],
};
