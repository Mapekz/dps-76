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
  // Two ESM families share the display name "Blood Sacrifice!": the leveled
  // legendary card (4 ranks, N&D key xf) and a 1-rank on-death team-buff
  // "fanfare" helper. Both have hasCard:true, so the name-join's first-wins
  // tiebreak is extraction-order dependent — pin the leveled card
  // (source: 20260702 ESM).
  BloodSacrifice: 'LGN_BloodSacrifice_Perk',
};

/**
 * Hand-authored modifiers for perks whose ESM effects are procedural and not
 * extractable as plain stat bumps. Keyed by generated family; outer index =
 * rank − 1.
 */
export const extraPerkModifiers: Readonly<Record<string, Modifier[][]>> = {
  // Lifegiver ranks 2/3: LifeGiver02/03 are effect-less PERK records — only
  // their descriptions state the bonus ("Gain a total of +30/+45 to your
  // maximum Health"). Rank 1's extracted END-keyed max-HP curve (SPEL
  // AbPerkLifeGiver 0x0004A0D3 → MGEF AbPerkFortifyHealth 0x00511AE4) is
  // already carried forward to ranks 2/3 by the extractor's rank-ability
  // inheritance; these overrides add only the described flat totals
  // (docs/assumptions.md "Max HP").
  LifeGiver: [
    [], // rank 1: END curve extracts from the ESM directly
    [
      {
        id: 'override:LifeGiver:r2:flat',
        source: { kind: 'perk', formId: '0x001D2465', edid: 'LifeGiver02', name: 'LifeGiver', rank: 2 },
        bucket: 'maxHealth',
        op: 'ADD',
        value: 30,
        conditions: [],
      },
    ],
    [
      {
        id: 'override:LifeGiver:r3:flat',
        source: { kind: 'perk', formId: '0x001D2467', edid: 'LifeGiver03', name: 'LifeGiver', rank: 3 },
        bucket: 'maxHealth',
        op: 'ADD',
        value: 45,
        conditions: [],
      },
    ],
  ],
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
