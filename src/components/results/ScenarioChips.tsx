import { CrosshairIcon, EyeOffIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';

/**
 * Sneak / weakpoint toggles live on the strip, not in Conditions: they
 * re-frame what BOTH headline columns mean ("VATS · sneaking · headshots"),
 * so they sit directly above the numbers they redefine.
 */
export function ScenarioChips({ compact = false }: { compact?: boolean }) {
  const { player } = useBuild();
  const dispatch = useBuildDispatch();

  const chips = [
    {
      key: 'isSneaking' as const,
      label: 'Sneaking',
      icon: EyeOffIcon,
      active: player.conditions.isSneaking,
    },
    {
      key: 'isAimingAtWeakpoint' as const,
      label: 'Weakpoints',
      icon: CrosshairIcon,
      active: player.conditions.isAimingAtWeakpoint,
    },
  ];

  return (
    <div className="flex items-center gap-1.5">
      {chips.map(chip => (
        <button
          key={chip.key}
          type="button"
          aria-pressed={chip.active}
          onClick={() => dispatch({ type: 'condition/set', key: chip.key, value: !chip.active })}
          className={cn(
            'focus-visible:ring-ring inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2',
            chip.active
              ? 'border-primary text-foreground bg-primary/15'
              : 'border-border text-muted-foreground hover:text-foreground'
          )}
        >
          <chip.icon className="size-3" />
          {!compact && chip.label}
        </button>
      ))}
    </div>
  );
}
