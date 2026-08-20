import { useScenarioResults } from '@/state/useScenarioResults';
import { useBuild } from '@/state/BuildProvider';
import { useGameMode } from '@/hooks/useGameMode';
import { getWeapons } from '@/data';
import { effectiveWeaponName } from '@/data/omods';
import { getBodyPartRace } from '@/data/bodyparts';
import { SectionLabel } from '@/components/ui/typography';
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
  const weaponName =
    weaponConfig && equippedWeapon
      ? effectiveWeaponName(mode, equippedWeapon, weaponConfig.mods)
      : undefined;
  const raceName = enemy.conditions.targetRace
    ? getBodyPartRace(mode, enemy.conditions.targetRace)?.name
    : undefined;

  if (variant === 'condensed') {
    if (!scenarios)
      return <p className="text-muted-foreground text-sm">Pick a weapon to see DPS.</p>;
    const keys =
      emphasized === 'vats' ? (['vats', 'freeAim'] as const) : (['freeAim', 'vats'] as const);
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-4 overflow-x-auto">
          {keys.map((key, i) => (
            <span key={key} className="flex items-baseline gap-1.5 whitespace-nowrap">
              <SectionLabel as="span" className={i === 0 ? 'text-primary' : undefined}>
                {LABELS[key]}
              </SectionLabel>
              {/*
               * Same headline semantics as ScenarioCard — post-resist DPS
               * when a target is selected, else pre-resist. Must stay in
               * sync: this sticky strip and the card are showing the same
               * scenario's same number (DESIGN.md's Numbers-Stay-Visible
               * Rule), so a mismatch here would read as two different DPS
               * figures for one build.
               */}
              <DeltaFlash
                className="text-sm font-semibold"
                value={
                  scenarios[key].effective?.totalDps ??
                  scenarios[key].ap?.apLimitedTotalDps ??
                  scenarios[key].totalDps
                }
                format={formatDamage}
              />
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
        {/* h3, not h2: this panel is a conceptual sibling of BreakdownPanel's
            "Why these numbers", which Base UI's AccordionHeader forces to h3
            unconditionally — matching levels keeps the outline consistent
            rather than mixing h2/h3 across three sibling ResultsPane panels. */}
        <SectionLabel level={3}>Damage output</SectionLabel>
        <ScenarioChips />
      </div>
      <div className="flex gap-2 max-sm:flex-col">
        {(['freeAim', 'vats'] as const).map((key) => (
          <ScenarioCard
            key={key}
            scenarioKey={key}
            label={LABELS[key]}
            result={scenarios[key]}
            emphasized={emphasized === key}
            targetName={raceName}
          />
        ))}
      </div>
      <p className="text-muted-foreground text-3xs leading-relaxed">
        DPS is post-resist once a target is selected (pre-resist shows below it); with no target
        it's the un-mitigated figure. Burst, reload, and fire-rate detail live under "Why these
        numbers."
      </p>
    </div>
  );
}
