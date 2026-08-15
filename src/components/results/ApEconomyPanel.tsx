import type { ScenarioResult } from '@/lib/engine/scenarios';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Row } from './breakdown-row';
import { contributionRows, flatPercentRows, formatSeconds } from './trace-rows';

/**
 * VATS AP economy derivation — max pool, passive regen, in-combat gain, drain,
 * and the resulting pool-cycle burst/pause/uptime (`ap-economy.ts` "Pool-cycle
 * uptime"). Sits under `MultiplierChainTable`'s VATS column in
 * `BreakdownPanel`; reuses that table's `Row`/`contributionRows`/
 * `flatPercentRows` conventions so the two sections read as one derivation.
 */
export function ApEconomyPanel({ result }: { result: ScenarioResult }) {
  const ap = result.ap;
  const apRegen = result.explain?.apRegen;
  if (!ap || !apRegen) return null;

  const { agility, isInPowerArmor, poolBase, poolPerAgility, raceBasePct, flat, percent, maxAp } =
    apRegen;
  const baseRatePct = raceBasePct + flat.result;
  const multiplier = 1 + percent.result;
  const shotsPerSec = ap.apCostPerShot > 0 ? ap.drainPerSec / ap.apCostPerShot : 0;

  return (
    <div className="border-border/50 mt-1 space-y-1.5 border-t pt-1">
      <p className="font-condensed text-muted-foreground pt-1 text-micro font-semibold uppercase tracking-wide">
        AP economy
      </p>

      <Row
        muted
        label={`base pool (${poolBase} + ${poolPerAgility}×${agility} agi)`}
        value={poolBase + poolPerAgility * agility}
      />
      {contributionRows(maxAp, 'ap-max')}
      <Row label="max ap" value={Math.round(ap.maxAp)} />

      <Row label="base regen rate" value={`${baseRatePct.toFixed(1)}%/s`} />
      <Row
        indent
        muted
        label="race base"
        value={`${raceBasePct.toFixed(1)}% of max/s${isInPowerArmor ? ' (power armor)' : ''}`}
      />
      {flatPercentRows(flat, 'ap-flat')}
      <Row label="regen rate multiplier" value={`×${multiplier.toFixed(2)}`} />
      {contributionRows(percent, 'ap-pct')}
      <Row label="regen/s" value={`${ap.regenPerSec.toFixed(1)}/s`} />

      {ap.critSpikePerSec > 0 && (
        <Row indent label="crit restore" value={`+${ap.critSpikePerSec.toFixed(1)}/s`} />
      )}
      {ap.critHotPerSec > 0 && (
        <Row indent label="crit hot" value={`+${ap.critHotPerSec.toFixed(1)}/s`} />
      )}
      {ap.reloadRegenPerSec > 0 && (
        <>
          <Row indent label="reload credit" value={`+${ap.reloadRegenPerSec.toFixed(1)}/s`} />
          <Row
            indent
            muted
            label={`reload window (${formatSeconds(apRegen.reloadSec)} − ${apRegen.regenDelaySec.toFixed(0)}s delay, per ${formatSeconds(
              apRegen.magDumpSec + apRegen.reloadSec,
            )} cycle)`}
            value=""
          />
        </>
      )}
      <Row label="gain/s while firing" value={`${ap.apGainPerSec.toFixed(1)}/s`} />

      <Row label="drain/s" value={`${ap.drainPerSec.toFixed(1)}/s`} />
      <Row
        indent
        muted
        label={`${ap.apCostPerShot.toFixed(1)} ap × ${shotsPerSec.toFixed(2)} shots/s`}
        value=""
      />

      {ap.uptime < 1 ? (
        <>
          {/*
           * Replaces what used to be two separate ScenarioCard tooltips
           * ("unthrottled" / "downtime fallback") — one short passage
           * covering what the VATS headline actually blends: full VATS DPS
           * while the pool holds, free-aim DPS while it refills, and how
           * long that refill takes.
           */}
          <p className="text-muted-foreground text-micro">
            The VATS headline blends full VATS DPS while the AP pool is positive with free-aim DPS
            while it regenerates — {formatSeconds(ap.secondsToEmpty ?? 0)} of fire per{' '}
            {formatSeconds(ap.pauseSec ?? 0)} of regen.
          </p>
          <Row
            label={`fire ${formatSeconds(ap.secondsToEmpty ?? 0)} · pause ${formatSeconds(ap.pauseSec ?? 0)}`}
            value={`${(ap.uptime * 100).toFixed(1)}% uptime`}
          />
          <Row
            indent
            label={
              <Tooltip>
                <TooltipTrigger render={<span className="cursor-help" />}>
                  downtime fallback (free aim)
                </TooltipTrigger>
                <TooltipContent>
                  DPS credited while the pool refills — the Free Aim scenario's sustained rate.
                </TooltipContent>
              </Tooltip>
            }
            value={`${ap.downtimeFallbackDps.toFixed(1)}/s`}
          />
        </>
      ) : (
        <Row muted label="ap never the constraint" value="" />
      )}
    </div>
  );
}
