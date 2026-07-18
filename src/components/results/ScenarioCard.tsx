import { cn } from '@/lib/utils';
import { formatDamage } from '@/lib/format';
import type { ScenarioResult } from '@/lib/engine/scenarios';
import type { ScenarioKey } from '@/state/build-reducer';
import { useBuildDispatch } from '@/state/BuildProvider';
import { DeltaFlash } from './DeltaFlash';
import { CritGauge } from './CritGauge';

const formatDotDps = (value: number) => `+${formatDamage(value)}/s`;
const formatUptimePct = (uptime: number) => `${Math.round(uptime * 100)}% uptime`;
const formatHitRatePct = (value: number) => `${Math.round(value)}%`;
const formatRetainedPct = (value: number) => `${Math.round(value)}%`;
const formatTtk = (ttkSec: number) => (Number.isFinite(ttkSec) ? `${ttkSec.toFixed(1)}s` : '∞');

const EFFECTIVE_DPS_DEFINITION =
  'Reload-aware sustained DPS × your hit chance — the realistic damage you deal over time.';
const BURST_DPS_DEFINITION =
  'Theoretical ceiling: per-hit × fire rate, trigger held down continuously with no reload and every shot landing.';
const HIT_CHANCE_DEFINITION =
  'Share of shots that land — your Free-aim/VATS hit-rate setting. A miss still costs the shot but deals no damage.';
const MITIGATED_DPS_DEFINITION =
  'Sustained DPS after the target\'s resists (Phase 2 mitigation): (damage × 0.15 / Resist)^0.365, applied once to the crit-weighted blended hit (Option A) — see docs/assumptions.md "Resist mitigation".';
const RETAINED_DEFINITION = 'Share of paper damage that gets through the target\'s resists (100% = fully penetrated).';
const TTK_DEFINITION = "Target HP ÷ mitigated sustained DPS for this scenario.";

interface ScenarioCardProps {
  scenarioKey: ScenarioKey;
  label: string;
  result: ScenarioResult;
  emphasized: boolean;
  /** Selected target's display name, for the "vs {name} (Lv N)" block below — undefined hides it even if `result.effective` is somehow set. */
  targetName?: string;
  targetLevel?: number;
}

/**
 * One instrument-cluster card. Clicking emphasizes it — the gold brackets
 * move, and that selection becomes the suggestions metric and the lead
 * number on the condensed mobile bar.
 */
export function ScenarioCard({ scenarioKey, label, result, emphasized, targetName, targetLevel }: ScenarioCardProps) {
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
        <DeltaFlash value={result.sustain.sustainedDps} />
      </p>
      <p className="text-muted-foreground text-[11px] uppercase tracking-wide" title={EFFECTIVE_DPS_DEFINITION}>
        effective dps
      </p>
      <div className="text-muted-foreground flex items-baseline justify-between gap-2 text-xs">
        <span title={BURST_DPS_DEFINITION}>burst</span>
        <DeltaFlash className="text-foreground text-sm" value={result.burstDps} />
      </div>
      <div className="text-muted-foreground flex items-baseline justify-between gap-2 text-xs">
        <span title={HIT_CHANCE_DEFINITION}>hit chance</span>
        <DeltaFlash className="text-foreground text-sm" value={result.hitRatePct} format={formatHitRatePct} />
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
      {result.effective && targetName && (
        <div className="border-border/60 mt-1 space-y-1 border-t pt-1.5">
          <p className="text-muted-foreground truncate text-[11px] uppercase tracking-wide">
            vs {targetName} (Lv {targetLevel ?? '?'})
          </p>
          <div className="text-muted-foreground flex items-baseline justify-between gap-2 text-xs">
            <span title={MITIGATED_DPS_DEFINITION}>mitigated dps</span>
            <DeltaFlash className="text-foreground text-sm" value={result.effective.sustainedDps} format={formatDamage} />
          </div>
          <div className="text-muted-foreground flex items-baseline justify-between gap-2 text-xs">
            <span title={RETAINED_DEFINITION}>retained</span>
            <DeltaFlash className="text-foreground text-sm" value={result.effective.retainedPct} format={formatRetainedPct} />
          </div>
          <div className="text-muted-foreground flex items-baseline justify-between gap-2 text-xs">
            <span title={TTK_DEFINITION}>ttk</span>
            <span className="text-foreground text-sm tabular-nums">{formatTtk(result.effective.ttk)}</span>
          </div>
        </div>
      )}
    </button>
  );
}
