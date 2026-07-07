import type { Modifier } from '@/types/modifiers';

/**
 * Hand-maintained perk overrides layered over ESM-generated perk data.
 * Survives regeneration. Every entry carries a source comment.
 */

/**
 * PerkId → generated family key, for perks whose display name doesn't join
 * automatically (the data layer joins registry names to generated families
 * by normalized display name).
 */
export const perkFamilyOverrides: Readonly<Record<string, string>> = {
  // Combat-overhaul renames: registry keeps the legacy N&D id, the ESM family
  // kept its legacy edid but the card was renamed (source: 20260702 ESM).
  RiflemanExpert: 'RiflemanExpert', // card now "Scoped-up"
  RiflemanMaster: 'RiflemanMaster', // card now "Smart Shot"
  Archer: 'Archer', // card now "Hat Trick"
  ArcherExpert: 'ArcherExpert', // card now "Deal Sealer"
  ArcherMaster: 'ArcherMaster', // card now "Master Archer"
  Fireproof: 'Fireproof', // card now "Hardy"
  // Gender-twin cards: registry uses a combined id, ESM has per-gender
  // families with identical effects — join to the Boy variant.
  ActionBoyGirl: 'ActionBoy',
  AquaBoyGirl: 'Aquaboy',
  PartyBoyGirl: 'PartyBoy',
};

/**
 * Hand-authored modifiers for perks whose ESM effects are procedural and not
 * extractable as plain stat bumps. Keyed by generated family; outer index =
 * rank − 1.
 */
export const extraPerkModifiers: Readonly<Record<string, Modifier[][]>> = {
  // Tenderizer applies PerkTenderizer01Spell on hit: a stacking +10% damage
  // taken debuff on the target (MGEF 0x003E21F7, magnitude 0.1). Stack count
  // is a manual scenario input (0–1000 per user spec, team-dependent).
  Tenderizer: [
    [
      {
        id: 'override:Tenderizer:r1',
        source: { kind: 'perk', formId: '0x003E21F4', edid: 'Tenderizer', name: 'Tenderizer', rank: 1 },
        bucket: 'dbm',
        op: 'ADD',
        value: 0.1,
        conditions: [{ kind: 'stacks', counter: 'tenderizer', max: 1000 }],
      },
    ],
  ],
};
