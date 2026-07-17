import { CrosshairIcon, EyeOffIcon } from 'lucide-react';
import { ToggleChips } from '@/components/ui/toggle-chips';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { useGameMode } from '@/hooks/useGameMode';
import { getDefaultBodyPart, resolveTargetBodyPart } from '@/data/bodyparts';

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
  const defaultPart = getDefaultBodyPart(mode, enemy.conditions.targetRace);
  const target = resolveTargetBodyPart(mode, enemy.conditions.targetRace, enemy.conditions.targetBodyPart, player.weakpointMult);
  const defaultName = defaultPart?.name ?? 'Torso';
  const targetLabel = isAiming ? `${target.name} ×${target.mult.toFixed(2)}` : defaultName;
  const targetTitle = isAiming
    ? `Target body part: ${target.name} ×${target.mult.toFixed(2)} — click to hit torso instead`
    : `Target body part: ${defaultName} ×1.00 (default) — click to aim at the last-picked body part`;

  return (
    <ToggleChips
      aria-label="Scenario toggles"
      size="xs"
      compact={compact}
      options={[
        { value: 'isSneaking' as const, label: 'Sneaking', icon: EyeOffIcon, active: player.conditions.isSneaking },
        {
          value: 'isAimingAtWeakpoint' as const,
          label: targetLabel,
          compactLabel: isAiming ? `×${target.mult.toFixed(2)}` : undefined,
          title: targetTitle,
          icon: CrosshairIcon,
          active: isAiming,
        },
      ]}
      onToggle={(key, wasActive) => dispatch({ type: 'condition/set', key, value: !wasActive })}
    />
  );
}
