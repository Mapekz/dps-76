import { cn } from '@/lib/utils';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { HelperText } from '@/components/ui/helper-text';
import { Checkbox } from '@/components/ui/checkbox';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { getMutations } from '@/data/buffs';
import { mutationDescriptionOverrides } from '@/data/overrides/mutation-descriptions';
import { deriveClassFreakRank, deriveStrangeInNumbers } from '@/lib/player-stats';
import { describeBuffModifiers } from '@/lib/buff-description';
import { CLASS_FREAK_TIER_FACTORS } from '@/lib/class-freak-mutations';
import { isDietMutation } from '@/lib/diet-mutations';
import { ActionDelta } from '@/components/diff/ActionDelta';
import type { BuildAction } from '@/state/build-reducer';
import { hasAnyEngineEffect } from '@/types/modifiers';
import { NoEffectBadge } from '../OptionBadge';
import { SectionTrigger } from '../SectionTrigger';

function CheckboxRow({
  id,
  label,
  checked,
  onCheckedChange,
  action,
  description,
  penaltyDescription,
  noEffect,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** When set, the row shows the ΔDPS of toggling it. */
  action?: BuildAction;
  /** Muted "what this does" line under the label (see describeBuffModifiers). */
  description?: string | null;
  /** Same, styled as a penalty — a mutation's Class-Freak-scaled downside. */
  penaltyDescription?: string | null;
  noEffect?: boolean;
}) {
  const hasDescription = Boolean(description) || Boolean(penaltyDescription);
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer gap-2 py-0.5 text-sm',
        hasDescription ? 'items-start' : 'items-center',
      )}
    >
      <div className={hasDescription ? 'pt-0.5' : undefined}>
        <Checkbox id={id} checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {noEffect && <NoEffectBadge />}
          {action && <ActionDelta action={action} />}
        </div>
        {description && <HelperText>{description}</HelperText>}
        {penaltyDescription && <p className="text-negative text-xs">{penaltyDescription}</p>}
      </div>
    </label>
  );
}

export function MutationsSection() {
  const { mode } = useGameMode();
  const { player } = useBuild();
  const dispatch = useBuildDispatch();
  const mutations = getMutations(mode);

  // Derived, not a toggle: the Strange in Numbers card equipped + a teammate
  // to be mutated with (same rule resolveLoadout feeds the engine).
  const sinEquipped = player.perks.some((p) => p.perkId === 'StrangeInNumbers');
  const sinActive = deriveStrangeInNumbers(player.perks, player.conditions);
  const classFreakRank = deriveClassFreakRank(player.perks);
  const classFreakReductionPct = Math.round((1 - CLASS_FREAK_TIER_FACTORS[classFreakRank]) * 100);

  return (
    <AccordionItem value="mutations">
      <AccordionTrigger>
        <SectionTrigger
          label="Mutations"
          summary={player.mutations.length === 0 ? 'none' : undefined}
          badge={
            <>
              {player.mutations.length > 0 && (
                <Badge variant="secondary">{player.mutations.length} active</Badge>
              )}
              {sinEquipped && (
                <Badge
                  variant={sinActive ? 'default' : 'outline'}
                  title={
                    sinActive
                      ? 'Strange in Numbers: mutation effects +25%'
                      : 'Strange in Numbers equipped but inactive — needs at least 1 teammate (Team section)'
                  }
                >
                  {sinActive ? 'SiN +25%' : 'SiN inactive'}
                </Badge>
              )}
              {classFreakRank > 0 && (
                <Badge
                  title={`Class Freak: mutation penalties reduced by ${classFreakReductionPct}%`}
                >
                  CF −{classFreakReductionPct}%
                </Badge>
              )}
            </>
          }
        />
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-0.5">
          {mutations.map((m) => {
            const penaltySet = new Set(m.penaltyModifierIds ?? []);
            const positives = m.modifiers.filter((mod) => !penaltySet.has(mod.id));
            const penalties = m.modifiers.filter((mod) => penaltySet.has(mod.id));
            // Herb/Carnivore realize their whole effect on OTHER consumables'
            // modifiers (diet-mutations.ts), so they carry none of their own —
            // describeBuffModifiers has nothing to derive from without this override.
            const description =
              describeBuffModifiers(
                { modifiers: positives },
                { strangeInNumbers: sinActive, classFreakRank },
              ) ??
              mutationDescriptionOverrides[m.id] ??
              null;
            const penaltyDescription = describeBuffModifiers(
              { modifiers: penalties },
              {
                strangeInNumbers: sinActive,
                classFreakRank,
                penaltyScale: CLASS_FREAK_TIER_FACTORS[classFreakRank],
              },
            );
            return (
              <CheckboxRow
                key={m.id}
                id={`mutation-${m.id}`}
                label={m.name}
                checked={player.mutations.includes(m.id)}
                onCheckedChange={() => dispatch({ type: 'mutation/toggle', id: m.id })}
                action={{ type: 'mutation/toggle', id: m.id }}
                description={description}
                penaltyDescription={penaltyDescription}
                noEffect={!hasAnyEngineEffect(m.modifiers) && !isDietMutation(m.id)}
              />
            );
          })}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
