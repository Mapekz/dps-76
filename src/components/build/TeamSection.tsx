import { UsersIcon } from 'lucide-react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { ToggleGroup } from '@/components/ui/toggle-group';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { getPublicTeamModifiers } from '@/data/public-teams';
import { deriveStrangeInNumbers } from '@/lib/player-stats';
import type { PlayerInput } from '@/types';
import type { Bucket } from '@/types/modifiers';
import { SectionTrigger } from './SectionTrigger';

/**
 * Team-facing steady state: how many teammates are present and what public
 * team (if any) is joined, plus a live readout of the teammate-gated bonuses
 * those inputs feed — Strange in Numbers (Mutations section), United Ordeal
 * (a ghoul-only perk), and the public-team SPECIAL fortify (@/data/public-teams).
 * Race/perks/base SPECIAL live in SpecialLoadoutSection; everything else about
 * the character's steady state lives in ConditionsSection.
 */

const PUBLIC_TEAM_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'casual', label: 'Casual' },
  { value: 'exploration', label: 'Exploration' },
] as const;

/** SPECIAL abbreviation for the public-team bonus's bucket (only these two occur — see getPublicTeamModifiers). */
const SPECIAL_ABBR: Partial<Record<Bucket, string>> = {
  specialIntelligence: 'INT',
  specialEndurance: 'END',
};

export function TeamSection() {
  const { player } = useBuild();
  const dispatch = useBuildDispatch();
  const conditions = player.conditions;

  const set = (key: keyof PlayerInput, value: PlayerInput[keyof PlayerInput]) =>
    dispatch({ type: 'condition/set', key, value });

  const publicTeamType = conditions.publicTeamType ?? 'none';
  const teamBonus = getPublicTeamModifiers(publicTeamType, conditions.teammateCount)[0];
  // Plain-value only (no curve) per getPublicTeamModifiers' contract — the
  // `!teamBonus.curve` check just satisfies the ModifierValue discriminant.
  const teamBonusText =
    teamBonus && !teamBonus.curve
      ? `+${teamBonus.value} ${SPECIAL_ABBR[teamBonus.bucket] ?? teamBonus.bucket}`
      : null;

  // Derived, not stored: same rule resolveLoadout feeds the engine (see
  // deriveStrangeInNumbers) — the card must be equipped AND a teammate present.
  const sinEquipped = player.perks.some((p) => p.perkId === 'StrangeInNumbers');
  const sinActive = deriveStrangeInNumbers(player.perks, conditions);

  // United Ordeal (GHL_UnitedOrdeal): a ghoul-only perk with team bonuses —
  // "active" mirrors Strange in Numbers' teammate gate, plus the race check.
  const unitedOrdealEquipped = player.perks.some((p) => p.perkId === 'UnitedOrdeal');
  const unitedOrdealActive =
    unitedOrdealEquipped && (conditions.isGhoul ?? false) && conditions.teammateCount >= 1;

  const summary =
    conditions.teammateCount === 0 && publicTeamType === 'none'
      ? 'solo'
      : `${conditions.teammateCount} teammate${conditions.teammateCount === 1 ? '' : 's'}${
          publicTeamType !== 'none' ? ` · ${publicTeamType}` : ''
        }`;

  return (
    <AccordionItem value="team">
      <AccordionTrigger>
        <SectionTrigger
          label="Team"
          summary={summary}
          badge={
            <>
              {conditions.teammateCount > 0 && (
                <Badge
                  variant="secondary"
                  title={`${conditions.teammateCount} teammate${conditions.teammateCount === 1 ? '' : 's'}`}
                >
                  <UsersIcon />
                  {conditions.teammateCount}
                </Badge>
              )}
              {teamBonusText && (
                <Badge variant="default" title="Public-team SPECIAL fortify is active">
                  {teamBonusText}
                </Badge>
              )}
            </>
          }
        />
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Teammates</Label>
            <ToggleGroup
              aria-label="Teammates"
              options={[0, 1, 2, 3].map((n) => ({ value: n, label: String(n) }))}
              value={conditions.teammateCount}
              onValueChange={(v) => set('teammateCount', v)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Public team</Label>
            <ToggleGroup
              aria-label="Public team"
              options={PUBLIC_TEAM_OPTIONS}
              value={publicTeamType}
              onValueChange={(v) => set('publicTeamType', v)}
            />
            {teamBonusText && (
              <p className="text-muted-foreground text-xs">
                {teamBonusText} from the public-team SPECIAL fortify
              </p>
            )}
          </div>

          <p className="text-muted-foreground text-xs">
            Teammates are assumed mutated (for Strange in Numbers) and ghoul (for United Ordeal) —
            teammate identity isn't modeled.
          </p>

          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span>Strange in Numbers</span>
              <span className={sinActive ? 'font-medium' : 'text-muted-foreground'}>
                {sinEquipped ? (sinActive ? 'active' : 'inactive') : 'not equipped'}
              </span>
            </div>
            {(conditions.isGhoul ?? false) && (
              <div className="flex items-center justify-between">
                <span>United Ordeal</span>
                <span className={unitedOrdealActive ? 'font-medium' : 'text-muted-foreground'}>
                  {unitedOrdealEquipped
                    ? unitedOrdealActive
                      ? 'active'
                      : 'inactive'
                    : 'not equipped'}
                </span>
              </div>
            )}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
