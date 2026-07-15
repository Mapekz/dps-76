import type { Modifier } from '@/types/modifiers';

/**
 * Hand-authored modifiers for mutations/consumables whose ESM magnitudes are
 * script-computed. Keyed by buff id (SPEL/ALCH edid); when present these
 * REPLACE the extracted modifiers. Values pending golden validation
 * (docs/assumptions.md).
 */
export const buffValueOverrides: Readonly<Record<string, Modifier[]>> = {
  // Tesla Science 5 (Magazine_TeslaScience05_Potion 0x00432D07): EP-172
  // "Mod Ammo Used Count" ×0 with GetRandomPercent<=20 — the extractor now
  // emits ammoFreeChance but leaves GetRandomPercent as an unresolved condition
  // and carries no heavy-gun gate (the perk effect has only the random roll).
  // Description-sourced: "Heavy guns have a 20% chance to not consume ammo."
  Magazine_TeslaScience05_Potion: [
    {
      id: 'override:Magazine_TeslaScience05_Potion',
      source: {
        kind: 'consumable',
        formId: '0x00432D07',
        edid: 'Magazine_TeslaScience05_Potion',
        name: 'Tesla Science 5',
      },
      bucket: 'ammoFreeChance',
      op: 'ADD',
      value: 0.2,
      conditions: [{ kind: 'weaponClass', classes: ['heavy'] }],
    },
  ],
};
