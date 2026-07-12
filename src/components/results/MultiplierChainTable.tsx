import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import type { ScenarioResult } from '@/lib/engine/scenarios';
import type { BucketTrace, TraceContribution } from '@/lib/engine/trace';
import { formatDamage } from '@/lib/format';

/**
 * Renders a HitTrace as the derivation a theorycrafter can check by hand:
 * base damage → the additive bonus pool (each source named) → outer
 * multipliers → per hit → fire rate → DPS. The traced computation IS the
 * displayed number, so these rows always reconcile.
 */

function Num({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('font-mono text-xs tabular-nums', className)}>{children}</span>;
}

function Row({ label, value, indent, muted }: { label: React.ReactNode; value: React.ReactNode; indent?: boolean; muted?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-2 py-px', indent && 'pl-3', muted && 'text-muted-foreground')}>
      <span className="min-w-0 truncate text-xs">{label}</span>
      <Num>{value}</Num>
    </div>
  );
}

function signed(v: number, digits = 2): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`;
}

function contributionRows(trace: BucketTrace, keyPrefix: string) {
  const rows: React.ReactNode[] = [];
  for (const c of trace.overriddenSets) {
    rows.push(
      <Row key={`${keyPrefix}-ov-${c.source.edid}`} indent muted label={<s>{c.source.name} = {c.value.toFixed(2)} (overridden)</s>} value="" />
    );
  }
  if (trace.set) {
    rows.push(<Row key={`${keyPrefix}-set`} indent label={`${trace.set.source.name} (sets base)`} value={trace.set.value.toFixed(2)} />);
  }
  for (const c of trace.mulAdd) {
    rows.push(
      <Row key={`${keyPrefix}-mul-${c.source.edid}-${c.source.rank ?? 0}`} indent label={c.source.name} value={`${signed(c.value * 100, 0)}% of base`} />
    );
  }
  for (const c of trace.add) {
    rows.push(<Row key={`${keyPrefix}-add-${c.source.edid}-${c.source.rank ?? 0}`} indent label={c.source.name} value={signed(c.value)} />);
  }
  return rows;
}

function wholeDamageRows(contributions: TraceContribution[]) {
  return contributions.map(c => (
    <Row key={`wd-${c.source.edid}`} indent label={c.source.name} value={`×${(1 + c.value).toFixed(2)}`} />
  ));
}

export function MultiplierChainTable({ result }: { result: ScenarioResult }) {
  const explain = result.explain;
  if (!explain) return null;
  const trace = explain.nonCrit;
  const multi = trace.components.length > 1;

  return (
    <div className="space-y-1.5">
      {trace.components.map((component, i) => {
        const componentHit = result.perHit.components[i];
        const poolBase = component.dbm.base;
        return (
          // Index-qualified: a multi-component weapon can spawn more than one
          // 'explosive' twin (one per payload-bearing component), so
          // damageType alone is not a stable/unique key.
          <Fragment key={`${component.damageType}-${i}`}>
            {multi && (
              <p className="font-condensed text-muted-foreground pt-1 text-[10px] font-semibold uppercase tracking-wide">
                {component.damageType}
              </p>
            )}
            <Row label="Base damage" value={formatDamage(componentHit.base)} />
            {contributionRows(component.baseDamage, `bd-${i}`)}
            <Row label={`Bonus pool (weapon base ${poolBase.toFixed(2)})`} value={`Σ ${component.dbm.result.toFixed(2)}`} />
            {contributionRows(component.dbm, `dbm-${i}`)}
          </Fragment>
        );
      })}

      {trace.strTerm > 0 && <Row indent label="Strength (melee)" value={signed(trace.strTerm)} />}
      {trace.sneak && (
        <>
          <Row label="Sneak attack" value={signed(trace.sneak.base.result + trace.sneak.bonus.result - 1)} />
          {contributionRows(trace.sneak.base, 'sb')}
          {contributionRows(trace.sneak.bonus, 'sn')}
        </>
      )}
      {trace.powerAttack && (
        <>
          <Row label="Power attack" value={signed(trace.powerAttack.result)} />
          {contributionRows(trace.powerAttack, 'pa')}
        </>
      )}

      {trace.wholeDamage.length > 0 && (
        <>
          <Row label="Whole-damage multipliers" value="" />
          {wholeDamageRows(trace.wholeDamage)}
        </>
      )}
      {trace.bodyPartMult !== 1 && (
        <Row
          label={trace.bodyPartMult > 1 ? 'Body part (weakpoint)' : 'Body part (limb)'}
          value={`×${trace.bodyPartMult.toFixed(2)}`}
        />
      )}
      {trace.weakpointBonus && trace.weakpointBonus.result !== 0 && (
        <>
          <Row label="Weakpoint bonus" value={`×${(1 + trace.weakpointBonus.result).toFixed(2)}`} />
          {contributionRows(trace.weakpointBonus, 'wp')}
        </>
      )}

      {explain.crit?.crit && result.critRate !== undefined && result.critRate > 0 && (
        <>
          <Row
            label={`Critical hits (${Math.round(result.critRate * 100)}% of shots)`}
            value={signed(explain.crit.crit.base.result + explain.crit.crit.bonus.result - 1)}
          />
          {contributionRows(explain.crit.crit.base, 'cb')}
          {contributionRows(explain.crit.crit.bonus, 'cn')}
        </>
      )}

      <div className="border-border/50 mt-1 border-t pt-1">
        <Row label="Average per hit" value={formatDamage(result.perHit.total)} />
        <Row label="Fire rate (approx.)" value={`×${result.fireRate.toFixed(2)}/s`} />
        <Row label="Burst DPS" value={formatDamage(result.burstDps)} />
        {result.sustain.reloadSec > 0 && (
          <>
            <Row
              muted
              label={`Mag cycle: ${result.sustain.shotsPerMag} shots / ${result.sustain.magDumpSec.toFixed(1)}s + ${result.sustain.reloadSec.toFixed(1)}s reload`}
              value=""
            />
            <Row label="Sustained DPS" value={formatDamage(result.sustain.sustainedDps)} />
          </>
        )}
      </div>
    </div>
  );
}
