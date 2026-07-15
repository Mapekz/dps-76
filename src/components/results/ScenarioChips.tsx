import { CrosshairIcon, EyeOffIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { useGameMode } from '@/hooks/useGameMode';
import { resolveTargetBodyPart } from '@/data/bodyparts';

/**
 * Sneak / target-body-part toggles live on the strip, not in Conditions:
 * they re-frame what BOTH headline columns mean ("VATS · sneaking ·
 * headshots"), so they sit directly above the numbers they redefine.
 *
 * The second chip is a live readout, not a bare on/off switch — it names
 * whatever body part is currently applied (Torso by default, or the
 * Target section's pick/custom multiplier once armed) so aiming is never a
 * silent no-op. Clicking it toggles `isAimingAtWeakpoint`, re-arming the
 * last-picked part/multiplier rather than resetting it.
 */
export function ScenarioChips({ compact = false }: { compact?: boolean }) {
  const { mode } = useGameMode();
  const { player, enemy } = useBuild();
  const dispatch = useBuildDispatch();

  const isAiming = player.conditions.isAimingAtWeakpoint;
  const target = resolveTargetBodyPart(mode, enemy.conditions.targetRace, enemy.conditions.targetBodyPart, player.weakpointMult);
  const targetLabel = isAiming ? `${target.name} ×${target.mult.toFixed(2)}` : 'Torso';
  const targetTitle = isAiming
    ? `Target body part: ${target.name} ×${target.mult.toFixed(2)} — click to hit torso instead`
    : 'Target body part: Torso ×1.00 (default) — click to aim at the last-picked body part';

  const chips = [
    {
      key: 'isSneaking' as const,
      label: 'Sneaking',
      compactLabel: undefined as string | undefined,
      title: undefined as string | undefined,
      icon: EyeOffIcon,
      active: player.conditions.isSneaking,
    },
    {
      key: 'isAimingAtWeakpoint' as const,
      label: targetLabel,
      compactLabel: isAiming ? `×${target.mult.toFixed(2)}` : undefined,
      title: targetTitle,
      icon: CrosshairIcon,
      active: isAiming,
    },
  ];

  return (
    <div className="flex items-center gap-1.5">
      {chips.map(chip => (
        <button
          key={chip.key}
          type="button"
          aria-pressed={chip.active}
          title={chip.title}
          onClick={() => dispatch({ type: 'condition/set', key: chip.key, value: !chip.active })}
          className={cn(
            'focus-visible:ring-ring inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2',
            chip.active
              ? 'border-primary text-foreground bg-primary/15'
              : 'border-border text-muted-foreground hover:text-foreground'
          )}
        >
          <chip.icon className="size-3" />
          {compact ? chip.compactLabel : chip.label}
        </button>
      ))}
    </div>
  );
}
