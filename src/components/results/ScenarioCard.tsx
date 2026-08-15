import { cn } from '@/lib/utils';
import { formatDamage, formatTtk } from '@/lib/format';
import type { ScenarioResult } from '@/lib/engine/scenarios';
import type { ScenarioKey } from '@/state/build-reducer';
import { useBuildDispatch } from '@/state/BuildProvider';
import { DeltaFlash } from './DeltaFlash';
import { CritGauge } from './CritGauge';

const formatUptimePct = (uptime: number) => `${Math.round(uptime * 100)}%`;

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
 *
 * Slimmed from the original 11-row/9-tooltip version (2026-08-10 design
 * critique — the card's whole body was a `<button>`, and Base UI tooltip
 * triggers can't legally nest inside one). Burst, hit chance, reload, and
 * DoT moved to `BreakdownPanel`'s ledger, where they already mostly lived
 * anyway; `retained` was dropped as pure derivation (mitigated ÷ pre-resist,
 * both already on the card). With zero tooltips left, the card has zero
 * focusable descendants — no restructuring needed, the root stays a
 * `<button>` and the full-card hit target survives.
 *
 * Headline is post-resist DPS labeled plainly `DPS` (not "mitigated dps" —
 * that's engine jargon) whenever a target is selected; `pre-resist` demotes
 * to a secondary line. Verified in scenarios.ts (`applyMitigation` runs once
 * over the same body-part-blended `cycleHit` that produces the pre-resist
 * number), so resist is the ONLY thing separating the two — future
 * enemy-defense work changes the resist formula, not this card. With no
 * target, `result.effective` is absent and the headline falls back to the
 * pre-resist number with no secondary line — there's nothing to compare yet.
 */
export function ScenarioCard({
  scenarioKey,
  label,
  result,
  emphasized,
  targetName,
  targetLevel,
}: ScenarioCardProps) {
  const dispatch = useBuildDispatch();
  const preResistDps = result.ap?.apLimitedDps ?? result.sustain.sustainedDps;
  const headlineDps = result.effective?.sustainedDps ?? preResistDps;

  return (
    <button
      type="button"
      onClick={() => dispatch({ type: 'view/set', view: { emphasized: scenarioKey } })}
      aria-pressed={emphasized}
      data-emphasized={emphasized}
      className="vats-brackets focus-visible:ring-ring flex-1 space-y-1 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2"
    >
      <p
        className={cn(
          'font-condensed text-xs font-semibold uppercase tracking-[0.14em]',
          emphasized ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        {label}
      </p>
      <p className="text-2xl font-semibold leading-none">
        <DeltaFlash value={headlineDps} />
      </p>
      <p className="text-muted-foreground text-micro uppercase tracking-wide">DPS</p>
      {result.effective && (
        <div className="text-muted-foreground flex items-baseline justify-between gap-2 text-xs">
          <span>pre-resist</span>
          <DeltaFlash
            className="text-foreground text-sm"
            value={preResistDps}
            format={formatDamage}
          />
        </div>
      )}
      {result.ap && result.ap.uptime < 1 && (
        <div className="text-muted-foreground flex items-baseline justify-between gap-2 text-xs">
          <span>vats uptime</span>
          <DeltaFlash
            className="text-foreground text-sm"
            value={result.ap.uptime}
            format={formatUptimePct}
          />
        </div>
      )}
      {result.critMeter && (
        <div className="pt-1">
          <CritGauge critMeter={result.critMeter} />
        </div>
      )}
      {result.effective && targetName && (
        <div className="border-border/60 mt-1 space-y-1 border-t pt-1.5">
          <p className="text-muted-foreground truncate text-micro uppercase tracking-wide">
            vs {targetName} (Lv {targetLevel ?? '?'})
          </p>
          <div className="text-muted-foreground flex items-baseline justify-between gap-2 text-xs">
            <span>time to kill</span>
            <span className="text-foreground text-sm tabular-nums">
              {formatTtk(result.effective.ttk)}
            </span>
          </div>
        </div>
      )}
    </button>
  );
}
