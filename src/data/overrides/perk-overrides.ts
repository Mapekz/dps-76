import type { Modifier } from '@/types/modifiers';
import type { Special } from '@/data/special';

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
  // The registry kept the pre-overhaul name "Bringing Out the Big Guns"; the
  // card was renamed "Bringing the Big Guns" and its ESM family is the old
  // standalone "HeavyGunnerMaster" perk repurposed as the card's home (source:
  // 20260710 ESM — the old standalone HeavyGunnerMaster perk was removed).
  BringingOutTheBigGuns: 'HeavyGunnerMaster',
};

/**
 * Last-resort card data (special/maxRank/costs) for PerkIds that join no
 * generated family AND have no perkFamilyOverrides entry, OR join a family
 * without a PCRD card. Keyed by PerkId. Seeded from whatever
 * `perk-cards.test.ts`'s drift check finds unjoined after every extraction —
 * currently empty (every non-legendary registry PerkId joins a carded family
 * once BringingOutTheBigGuns is pinned above).
 */
export const perkCardOverrides: Readonly<Record<string, { special?: Special; maxRank: number; costs: number[] }>> = {};

/**
 * Hand-authored modifiers for perks whose ESM effects are procedural and not
 * extractable as plain stat bumps. Keyed by generated family; outer index =
 * rank − 1.
 */
export const extraPerkModifiers: Readonly<Record<string, Modifier[][]>> = {
  // LifeGiver ranks 2/3 (LifeGiver02/03, formerly overridden here with flat
  // +30/+45 max HP from their descriptions) are DEAD content: the live
  // LifegiverCard PCRD (0x0000BB40) records a single rank, so those PERK
  // records are unreachable (card.rankSources caps the rank). Rank 1's
  // END-keyed max-HP curve extracts from the ESM directly.
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
  // Rejuvenated (0x003DE58F/0x003DE590): the PERK records extract empty
  // because the mechanics live on the hidden survival ability, not the perk —
  // SPEL SURV_Thirst_Ability 0x00054DF3 tiers its fully-hydrated
  // ActionPointsRateMult bonus by HasPerk(Rejuvenated0N) rows (2026-07-15
  // esm-walk): no perk 35%, rank 1 45%, rank 1+2 60% (rank 2's tier also
  // requires Rads ≤ 100). The +35% baseline every hydrated non-ghoul gets is
  // hand-authored in @/data/player-baseline; these overrides carry only the
  // DELTAS (+10% / +25%) so the two sources sum to the ESM tier values.
  // Rank 2 assumes low rads — optimal play, documented in
  // docs/assumptions.md "Hydration AP regen". Ghoul-gated like the ability
  // itself (GetIsPlayerGhoul()=0; the card is human-only anyway). The
  // parallel Well Fed tiers on SURV_Hunger carry no AP effects (food-buff
  // scope only), so nothing else routes here.
  Rejuvenated: [
    [
      {
        id: 'override:Rejuvenated:r1',
        source: { kind: 'perk', formId: '0x003DE58F', edid: 'Rejuvenated01', name: 'Rejuvenated', rank: 1 },
        bucket: 'apRegen',
        op: 'ADD',
        value: 0.1,
        conditions: [
          { kind: 'hydrated', value: true },
          { kind: 'playerIsGhoul', value: false },
        ],
      },
    ],
    [
      {
        id: 'override:Rejuvenated:r2',
        source: { kind: 'perk', formId: '0x003DE590', edid: 'Rejuvenated02', name: 'Rejuvenated', rank: 2 },
        bucket: 'apRegen',
        op: 'ADD',
        value: 0.25,
        conditions: [
          { kind: 'hydrated', value: true },
          { kind: 'playerIsGhoul', value: false },
        ],
      },
    ],
  ],
};
