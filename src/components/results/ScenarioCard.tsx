import { cn } from '@/lib/utils';
import { formatDamage } from '@/lib/format';
import type { ScenarioResult } from '@/lib/engine/scenarios';
import type { ScenarioKey } from '@/state/build-reducer';
import { useBuildDispatch } from '@/state/BuildProvider';
import { DeltaFlash } from './DeltaFlash';
import { CritGauge } from './CritGauge';

const formatDotDps = (value: number) => `+${formatDamage(value)}/s`;
const formatUptimePct = (uptime: number) => `${Math.round(uptime * 100)}% uptime`;

interface ScenarioCardProps {
  scenarioKey: ScenarioKey;
  label: string;
  result: ScenarioResult;
  emphasized: boolean;
}

/**
 * One instrument-cluster card. Clicking emphasizes it — the gold brackets
 * move, and that selection becomes the suggestions metric and the lead
 * number on the condensed mobile bar.
 */
export function ScenarioCard({ scenarioKey, label, result, emphasized }: ScenarioCardProps) {
  const dispatch = useBuildDispatch();
  const hasReloadModel = result.sustain.reloadSec > 0;

  return (
    <button
      type="button"
      onClick={() => dispatch({ type: 'view/set', view: { emphasized: scenarioKey } })}
      aria-pressed={emphasized}
      data-emphasized={emphasized}
      className="vats-brackets focus-visible:ring-ring flex-1 space-y-1 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2"
    >
      <p className={cn('font-condensed text-xs font-semibold uppercase tracking-[0.14em]', emphasized ? 'text-primary' : 'text-muted-foreground')}>
        {label}
      </p>
      <p className="text-2xl font-semibold leading-none">
        <DeltaFlash value={result.burstDps} />
      </p>
      <p className="text-muted-foreground text-[11px] uppercase tracking-wide">burst dps</p>
      <div className="text-muted-foreground flex items-baseline justify-between gap-2 text-xs">
        <span>{hasReloadModel ? 'sustained' : 'per hit'}</span>
        <DeltaFlash
          className="text-foreground text-sm"
          value={hasReloadModel ? result.sustain.sustainedDps : result.perHit.total}
        />
      </div>
      {hasReloadModel && (
        <div className="text-muted-foreground flex items-baseline justify-between gap-2 text-xs">
          <span>reload</span>
          <span
            className="text-foreground text-sm tabular-nums"
            title={
              result.sustain.reloadApproximate
                ? 'Reload time from the ESM animation length (per-shell weapons: × rounds), divided by the folded reload speed — unverified in-game.'
                : undefined
            }
          >
            {result.sustain.reloadSec.toFixed(2)}s
          </span>
        </div>
      )}
      {result.dotDps > 0 && (
        <div className="text-muted-foreground flex items-baseline justify-between gap-2 text-xs">
          <span>dot</span>
          <DeltaFlash className="text-foreground text-sm" value={result.dotDps} format={formatDotDps} />
        </div>
      )}
      {result.ap && result.ap.uptime < 1 && (
        <div className="text-muted-foreground flex items-baseline justify-between gap-2 text-xs">
          <span title="Passive AP regen doesn't tick during sustained VATS fire — only in-combat restores (Conductor's, etc.) and passive regen during reload downtime (after a 1s delay) count toward uptime.">
            ap-limited ({formatUptimePct(result.ap.uptime)})
          </span>
          <DeltaFlash className="text-foreground text-sm" value={result.ap.apLimitedDps} format={formatDamage} />
        </div>
      )}
      {result.critMeter && (
        <div className="pt-1">
          <CritGauge critMeter={result.critMeter} />
        </div>
      )}
    </button>
  );
}
