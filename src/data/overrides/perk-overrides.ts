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
  // NOTE: combat-overhaul renames (Hat Trick, Deal Sealer, Master Archer,
  // Scoped-Up, Smart Shot, Hardy, Bringing the Big Guns) used to be pinned
  // here while the registry kept the legacy names; the registry now carries
  // the current card names, so they join by normalized display name like
  // everything else (source: 20260710 ESM). The name-drift test in
  // perk-cards.test.ts fails loudly if a future extraction renames a card.
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
  // Tenderizer carries no player-side modifier: its stacking damage-taken
  // debuff lives on the TARGET (anyone's card can have applied it), so it is
  // modeled in @/data/target-debuffs and driven by the Target panel's stack
  // input, never by equipping the card.
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
  // Fast Fighter (PERK CommandoExpert01 0x0031AEF2): "Gain 50% of your bonus
  // movement speed as reload speed." The PERK record carries NO effects at
  // all (2026-07-15 esm chase) — the conversion is engine-native, so this
  // override is description-sourced. Modeled as a reloadSpeed ADD driven by
  // the moveSpeedBonus curve input (the bootstrap-folded Σ of the
  // moveSpeedBonus bucket — Speed Demon +0.20/+0.25 today; future sources
  // tracked in dps-todos/move-speed-sources.md). Identity curve × scale 0.5 =
  // half the bonus; the (0,0) endpoint clamp means a net move-speed PENALTY
  // grants nothing rather than slowing reload.
  CommandoExpert: [
    [
      {
        id: 'override:CommandoExpert:r1',
        source: { kind: 'perk', formId: '0x0031AEF2', edid: 'CommandoExpert01', name: 'Fast Fighter', rank: 1 },
        bucket: 'reloadSpeed',
        op: 'ADD',
        curve: {
          input: 'moveSpeedBonus',
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
        curveScale: 0.5,
        conditions: [],
      },
    ],
  ],
  // Quick Hands (PERK QuickHands01-03 0x000221FC/0x001D2478/0x003E862D): EP-182
  // "Auto Fill Weapon Clip" — 6/12/18% chance to instantly reload on empty
  // clip. Procedural; the PERK records extract empty. op is nominal —
  // foldChanceUnion reads value only. Human-locked (card race gate + defensive
  // playerIsGhoul condition for URL-imported builds).
  QuickHands: [
    [
      {
        id: 'override:QuickHands:r1',
        source: { kind: 'perk', formId: '0x000221FC', edid: 'QuickHands01', name: 'Quick Hands', rank: 1 },
        bucket: 'reloadSkipChance',
        op: 'ADD',
        value: 0.06,
        conditions: [{ kind: 'playerIsGhoul', value: false }],
      },
    ],
    [
      {
        id: 'override:QuickHands:r2',
        source: { kind: 'perk', formId: '0x001D2478', edid: 'QuickHands02', name: 'Quick Hands', rank: 2 },
        bucket: 'reloadSkipChance',
        op: 'ADD',
        value: 0.12,
        conditions: [{ kind: 'playerIsGhoul', value: false }],
      },
    ],
    [
      {
        id: 'override:QuickHands:r3',
        source: { kind: 'perk', formId: '0x003E862D', edid: 'QuickHands03', name: 'Quick Hands', rank: 3 },
        bucket: 'reloadSkipChance',
        op: 'ADD',
        value: 0.18,
        conditions: [{ kind: 'playerIsGhoul', value: false }],
      },
    ],
  ],
  // Wild West Hands (PERK GHL_WildWestHands01-03 0x00797E20/0x00797E30/
  // 0x00797E2D): same EP-182 instant-reload family, ghoul-exclusive —
  // 12/24/36%. Procedural; foldChanceUnion reads value only.
  GHL_WildWestHands: [
    [
      {
        id: 'override:GHL_WildWestHands:r1',
        source: { kind: 'perk', formId: '0x00797E20', edid: 'GHL_WildWestHands01', name: 'Wild West Hands', rank: 1 },
        bucket: 'reloadSkipChance',
        op: 'ADD',
        value: 0.12,
        conditions: [{ kind: 'playerIsGhoul', value: true }],
      },
    ],
    [
      {
        id: 'override:GHL_WildWestHands:r2',
        source: { kind: 'perk', formId: '0x00797E30', edid: 'GHL_WildWestHands02', name: 'Wild West Hands', rank: 2 },
        bucket: 'reloadSkipChance',
        op: 'ADD',
        value: 0.24,
        conditions: [{ kind: 'playerIsGhoul', value: true }],
      },
    ],
    [
      {
        id: 'override:GHL_WildWestHands:r3',
        source: { kind: 'perk', formId: '0x00797E2D', edid: 'GHL_WildWestHands03', name: 'Wild West Hands', rank: 3 },
        bucket: 'reloadSkipChance',
        op: 'ADD',
        value: 0.36,
        conditions: [{ kind: 'playerIsGhoul', value: true }],
      },
    ],
  ],
};
