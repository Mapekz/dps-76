import type { PlayerConditions } from '@/types';
import type { Modifier } from '@/types/modifiers';

/**
 * Public team bonuses: a team-size-scaled SPECIAL fortify granted by public
 * teams (ESM-confirmed). `PT_PublicTeamBonuses_Perk` (0x005B7584) grants
 * ability spells gated on team type + bond score (1-4); only two of those
 * spells are damage-relevant SPECIAL grants (the rest are XP/condition-loss,
 * out of scope):
 *
 * - Casual (TeamType 6) → spell `PT_CasualTeamBonus` (0x005B7585) → mgef
 *   `AbFortifyIntelligence` (0x0004C938), fortifying AV Intelligence
 *   (0x000002C6) by +1..+4 per bond score.
 * - Exploration (TeamType 4) → spell `PT_ExplorationTeamBonus` (0x005B7587)
 *   → mgef `AbFortifyEndurance` (0x00169559), fortifying AV Endurance
 *   (0x000002C4) by +1..+4 per bond score.
 *
 * Bond score has no separate UI input in this app — it's modeled as team
 * size including self: `min(teammateCount + 1, 4)` (documented
 * simplification; the real bond score depends on time-teamed/actions, not
 * just headcount).
 */

/** The SPECIAL ADD modifier for the selected public team type, scaled by team size (bond-score proxy). */
export function getPublicTeamModifiers(
  publicTeamType: PlayerConditions['publicTeamType'],
  teammateCount: number,
): Modifier[] {
  const bondScore = Math.min(teammateCount + 1, 4);

  if (publicTeamType === 'casual') {
    return [
      {
        id: 'publicTeam:casual',
        source: {
          kind: 'perk',
          formId: '0x005B7585',
          edid: 'PT_CasualTeamBonus',
          name: 'Public Team — Casual',
        },
        bucket: 'specialIntelligence',
        op: 'ADD',
        value: bondScore,
        conditions: [],
      },
    ];
  }

  if (publicTeamType === 'exploration') {
    return [
      {
        id: 'publicTeam:exploration',
        source: {
          kind: 'perk',
          formId: '0x005B7587',
          edid: 'PT_ExplorationTeamBonus',
          name: 'Public Team — Exploration',
        },
        bucket: 'specialEndurance',
        op: 'ADD',
        value: bondScore,
        conditions: [],
      },
    ];
  }

  return [];
}
