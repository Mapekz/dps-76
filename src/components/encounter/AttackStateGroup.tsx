import { Badge } from '@/components/ui/badge';
import { HelperText } from '@/components/ui/helper-text';
import { SwitchRow } from '@/components/ui/switch-row';
import { SectionLabel } from '@/components/ui/typography';
import { buildDeltaCount } from '@/lib/build-delta';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import type { PlayerInput } from '@/types';
import { knobActiveBadgeObjects } from '@/types/knob-registry';

/** Fight-state toggles for the moment of attack, distinct from ConditionsSection's steady-state groups. */
export function AttackStateGroup() {
  const { player, enemy } = useBuild();
  const dispatch = useBuildDispatch();
  const conditions = player.conditions;
  const isGhoul = conditions.isGhoul ?? false;
  const set = (key: keyof PlayerInput, value: PlayerInput[keyof PlayerInput]) =>
    dispatch({ type: 'condition/set', key, value });

  const { value: badgeValues, defaults: badgeDefaults } = knobActiveBadgeObjects(
    'attack-state',
    conditions,
    enemy.conditions,
  );
  const activeCount = buildDeltaCount(badgeValues, badgeDefaults);

  return (
    <div>
      <div className="flex items-center justify-between">
        <SectionLabel level={3}>Attack state</SectionLabel>
        {activeCount > 0 && <Badge variant="secondary">{activeCount} active</Badge>}
      </div>
      <div className="mt-2 space-y-3">
        {!isGhoul && (
          <div className="space-y-1.5">
            <SwitchRow
              id="char-hydrated"
              label="Fully hydrated"
              checked={conditions.hydrated ?? true}
              onCheckedChange={(v) => set('hydrated', v)}
            />
            <HelperText>
              Fully hydrated grants +35% AP regen (45/60% with Rejuvenated). Ghouls have no
              hydration.
            </HelperText>
          </div>
        )}

        <SwitchRow
          id="char-power-attack"
          label="Power attacking (melee)"
          checked={conditions.isPowerAttacking}
          onCheckedChange={(v) => set('isPowerAttacking', v)}
        />

        <SwitchRow
          id="char-last-shot"
          label="Firing the magazine's last round"
          checked={conditions.isLastShot ?? false}
          onCheckedChange={(v) => set('isLastShot', v)}
        />

        <SwitchRow
          id="char-ads"
          label="Aiming down sights"
          checked={conditions.isAimingDownSights ?? false}
          onCheckedChange={(v) => set('isAimingDownSights', v)}
        />
      </div>
    </div>
  );
}
