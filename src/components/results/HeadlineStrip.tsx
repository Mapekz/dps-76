import { useScenarioResults } from '@/state/useScenarioResults';
import { useBuild } from '@/state/BuildProvider';
import { useGameMode } from '@/hooks/useGameMode';
import { getWeapons } from '@/data';
import { effectiveWeaponName } from '@/data/omods';
import { getBodyPartRace } from '@/data/bodyparts';
import { getNpc } from '@/data/npcs';
import { resolveTargetLevel } from '@/lib/enemy-defenses';
import { cn } from '@/lib/utils';
import { formatDamage } from '@/lib/format';
import { DeltaFlash } from './DeltaFlash';
import { ScenarioCard } from './ScenarioCard';
import { ScenarioChips } from './ScenarioChips';

interface HeadlineStripProps {
  variant?: 'full' | 'condensed';
}

const LABELS = { freeAim: 'Free Aim', vats: 'VATS' } as const;

/**
 * The instrument cluster. Full variant: two bracket-framed scenario cards +
 * the sneak/weakpoint chips. Condensed variant: a one-line sticky readout for
 * mobile so the tweak→flash loop survives the single-column collapse.
 */
export function HeadlineStrip({ variant = 'full' }: HeadlineStripProps) {
  const { scenarios, emphasized } = useScenarioResults();
  const { mode } = useGameMode();
  const { player, enemy } = useBuild();
  const weaponConfig = player.weapon;
  const equippedWeapon = weaponConfig ? getWeapons(mode)[weaponConfig.weaponId] : undefined;
  const weaponName = weaponConfig && equippedWeapon ? effectiveWeaponName(mode, equippedWeapon, weaponConfig.mods) : undefined;
  const raceName = enemy.conditions.targetRace
    ? getBodyPartRace(mode, enemy.conditions.targetRace)?.name
    : undefined;
  // Level context for ScenarioCard's "vs {race} (Lv N)" block — same
  // resolution (stored value or race-max default) TargetSection's slider and
  // resolveLoadout use, so the number shown always matches what fed the engine.
  const targetNpc = enemy.conditions.targetRace ? getNpc(mode, enemy.conditions.targetRace) : undefined;
  const targetLevel = resolveTargetLevel(targetNpc, enemy.conditions.targetLevel);

  if (variant === 'condensed') {
    if (!scenarios) return <p className="text-muted-foreground text-sm">Pick a weapon to see DPS.</p>;
    const keys = emphasized === 'vats' ? (['vats', 'freeAim'] as const) : (['freeAim', 'vats'] as const);
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-4 overflow-x-auto">
          {keys.map((key, i) => (
            <span key={key} className="flex items-baseline gap-1.5 whitespace-nowrap">
              <span
                className={cn(
                  'font-condensed text-[11px] font-semibold uppercase tracking-[0.12em]',
                  i === 0 ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {LABELS[key]}
              </span>
              <DeltaFlash className="text-sm font-semibold" value={scenarios[key].sustain.sustainedDps} format={formatDamage} />
            </span>
          ))}
        </div>
        <ScenarioChips compact />
      </div>
    );
  }

  if (!scenarios) return null;

  return (
    <div className="space-y-2">
      {weaponName && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground truncate text-xs font-medium">{weaponName}</p>
          {raceName && <p className="text-muted-foreground shrink-0 text-xs">vs {raceName}</p>}
        </div>
      )}
      <div className="flex items-center justify-between">
        <p className="font-condensed text-muted-foreground text-xs font-semibold uppercase tracking-[0.14em]">
          Damage output
        </p>
        <ScenarioChips />
      </div>
      <div className="flex gap-2 max-sm:flex-col">
        {(['freeAim', 'vats'] as const).map(key => (
          <ScenarioCard
            key={key}
            scenarioKey={key}
            label={LABELS[key]}
            result={scenarios[key]}
            emphasized={emphasized === key}
            targetName={raceName}
            targetLevel={targetLevel}
          />
        ))}
      </div>
      <p className="text-muted-foreground text-[11px] leading-relaxed">
        Effective DPS folds in reload and your hit chance; burst is the every-shot-hits ceiling. Fire rate and the
        reload model are approximate/unverified in-game.
      </p>
    </div>
  );
}
