import { Badge } from '@/components/ui/badge';
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
        <SwitchRow
          id="char-sneaking"
          label="Sneaking"
          checked={conditions.isSneaking}
          onCheckedChange={(v) => set('isSneaking', v)}
        />

        <SwitchRow
          id="char-power-attack"
          label="Power attacking (melee)"
          checked={conditions.isPowerAttacking}
          onCheckedChange={(v) => set('isPowerAttacking', v)}
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
