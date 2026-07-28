import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import type { ScenarioResult } from '@/lib/engine/scenarios';
import type { BucketTrace, TraceContribution } from '@/lib/engine/trace';
import { formatDamage } from '@/lib/format';

const formatSeconds = (value: number) => `${value.toFixed(1)}s`;

/**
 * Renders a HitTrace as the derivation a theorycrafter can check by hand:
 * base damage → the additive bonus pool (each source named) → outer
 * multipliers → per hit → fire rate → DPS. The traced computation IS the
 * displayed number, so these rows always reconcile.
 *
 * Sneak and body-part multipliers are recorded once at the weapon level in
 * the trace but don't apply to explosive components (paper-damage.ts) — the
 * shared rows below are hidden/qualified per-component so reconciliation
 * still holds on a weapon with an explosive twin or launcher payload.
 */

function Num({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('shrink-0 font-mono text-xs tabular-nums text-right', className)}>
      {children}
    </span>
  );
}

function Row({
  label,
  value,
  indent,
  muted,
  title,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  indent?: boolean;
  muted?: boolean;
  /** Falls back to `label` when it's a plain string; pass explicitly when `label` is JSX. */
  title?: string;
}) {
  const titleText = title ?? (typeof label === 'string' ? label : undefined);
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-2 py-px',
        indent && 'pl-3',
        muted && 'text-muted-foreground',
      )}
    >
      <span className="min-w-0 truncate text-xs" title={titleText}>
        {label}
      </span>
      <Num>{value}</Num>
    </div>
  );
}

function signed(v: number, digits = 2): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`;
}

/**
 * `labelSuffix` distinguishes contributors that don't act like ordinary
 * peers of the bucket's other rows (e.g. critDmgBonusScale, which scales the
 * crit-bonus rows above it rather than adding to the total directly) without
 * touching `source.name` itself — that name is shared with other UI (e.g. an
 * equipped-mods list) and shouldn't carry a breakdown-specific caveat.
 */
function contributionRows(trace: BucketTrace, keyPrefix: string, labelSuffix = '') {
  const rows: React.ReactNode[] = [];
  for (const c of trace.overriddenSets) {
    const text = `${c.source.name}${labelSuffix} = ${c.value.toFixed(2)} (overridden)`;
    rows.push(
      <Row
        key={`${keyPrefix}-ov-${c.source.edid}`}
        indent
        muted
        label={<s>{text}</s>}
        value=""
        title={text}
      />,
    );
  }
  if (trace.set) {
    rows.push(
      <Row
        key={`${keyPrefix}-set`}
        indent
        label={`${trace.set.source.name}${labelSuffix} (sets base)`}
        value={trace.set.value.toFixed(2)}
      />,
    );
  }
  for (const c of trace.mulAdd) {
    rows.push(
      <Row
        key={`${keyPrefix}-mul-${c.source.edid}-${c.source.rank ?? 0}`}
        indent
        label={`${c.source.name}${labelSuffix}`}
        value={`${signed(c.value * 100, 0)}%`}
      />,
    );
  }
  for (const c of trace.add) {
    rows.push(
      <Row
        key={`${keyPrefix}-add-${c.source.edid}-${c.source.rank ?? 0}`}
        indent
        label={`${c.source.name}${labelSuffix}`}
        value={signed(c.value)}
      />,
    );
  }
  return rows;
}

/**
 * `apRegenFlat` sources (Company Tea) are ADD-op but already percentage-points
 * on the race base's own "% of max/s" scale — shown against the `Σ N% of
 * max/s` base-rate row they add into, so they need a % suffix rather than
 * `contributionRows`'s raw-decimal convention.
 */
function flatPercentRows(trace: BucketTrace, keyPrefix: string) {
  return trace.add.map((c) => (
    <Row
      key={`${keyPrefix}-${c.source.edid}-${c.source.rank ?? 0}`}
      indent
      label={c.source.name}
      value={`${signed(c.value, 1)}%`}
    />
  ));
}

function wholeDamageRows(contributions: TraceContribution[]) {
  return contributions.map((c) => (
    <Row
      key={`wd-${c.source.edid}`}
      indent
      label={c.source.name}
      value={`×${(1 + c.value).toFixed(2)}`}
    />
  ));
}

export function MultiplierChainTable({ result }: { result: ScenarioResult }) {
  const explain = result.explain;
  if (!explain) return null;
  const trace = explain.nonCrit;
  const multi = trace.components.length > 1;
  // Sneak and body-part multipliers are recorded once at the weapon level but
  // don't apply to explosive components (launcher payloads / Explosive twins
  // land their flat payload regardless of where they strike, and aren't a
  // stealth attack). Only show those shared rows when at least one component
  // actually received them, and qualify the label on a mixed weapon so the
  // rows keep reconciling with the per-component totals above.
  const anyExplosive = trace.components.some((c) => c.isExplosion);
  const anyNonExplosive = trace.components.some((c) => !c.isExplosion);
  const mixed = anyExplosive && anyNonExplosive;

  return (
    <div className="space-y-1.5">
      {trace.components.map((component, i) => {
        const componentHit = result.perHit.components[i];
        return (
          // Index-qualified: a multi-component weapon can spawn more than one
          // explosive twin (one per payload-bearing component, each keeping
          // its PARENT's damageType rather than a shared 'explosive' label),
          // so damageType alone is not a stable/unique key.
          <Fragment key={`${component.damageType}-${i}`}>
            {multi && (
              <p className="font-condensed text-muted-foreground pt-1 text-[10px] font-semibold uppercase tracking-wide">
                {component.damageType}
              </p>
            )}
            <Row label="Base damage" value={formatDamage(componentHit.base)} />
            {contributionRows(component.baseDamage, `bd-${i}`)}
            <Row label="DMG Bonus Mult" value={`×${component.dbm.result.toFixed(2)}`} />
            {contributionRows(component.dbm, `dbm-${i}`)}
            {component.isExplosion && (
              <Row muted indent label="Explosive — ignores sneak & body part" value="" />
            )}
          </Fragment>
        );
      })}

      {trace.strTerm > 0 && <Row indent label="Strength (melee)" value={signed(trace.strTerm)} />}
      {trace.sneak &&
        anyNonExplosive &&
        (() => {
          const { base, bonus } = trace.sneak!;
          const baseRows = contributionRows(base, 'sb');
          const bonusRows = contributionRows(bonus, 'sn');
          return (
            <>
              <Row label="Sneak attack" value={signed(base.result + bonus.result - 1)} />
              {(baseRows.length > 0 || bonusRows.length > 0) && (
                <Row indent muted label="Weapon Base" value={`×${base.base.toFixed(2)}`} />
              )}
              {baseRows}
              {bonusRows}
            </>
          );
        })()}
      {trace.powerAttack && (
        <>
          <Row label="Power attack" value={signed(trace.powerAttack.result)} />
          {contributionRows(trace.powerAttack, 'pa')}
        </>
      )}

      {trace.wholeDamage.length > 0 && (
        <>
          <Row label="Damage Multipliers" value="" />
          {wholeDamageRows(trace.wholeDamage)}
        </>
      )}
      {trace.bodyPartMult !== 1 && anyNonExplosive && (
        <Row
          label={trace.bodyPartMult > 1 ? 'Body part (weakpoint)' : 'Body part (limb)'}
          value={`×${trace.bodyPartMult.toFixed(2)}`}
        />
      )}
      {trace.weakpointBonus && trace.weakpointBonus.result !== 0 && anyNonExplosive && (
        <>
          <Row
            label={mixed ? 'Weakpoint bonus (non-explosive)' : 'Weakpoint bonus'}
            value={`×${(1 + trace.weakpointBonus.result).toFixed(2)}`}
          />
          {contributionRows(trace.weakpointBonus, 'wp')}
        </>
      )}

      {explain.crit?.crit &&
        result.critRate !== undefined &&
        result.critRate > 0 &&
        (() => {
          const { base, bonus, bonusScale } = explain.crit!.crit!;
          const baseRows = contributionRows(base, 'cb');
          const bonusRows = contributionRows(bonus, 'cn');
          return (
            <>
              <Row
                label={`Crits (${Math.round(result.critRate * 100)}% of hits)`}
                value={signed(base.result + bonus.result * bonusScale.result - 1)}
              />
              {(baseRows.length > 0 || bonusRows.length > 0) && (
                <Row indent muted label="Weapon Base" value={`×${base.base.toFixed(2)}`} />
              )}
              {baseRows}
              {bonusRows}
              {contributionRows(bonusScale, 'cs', ' (avg.)')}
            </>
          );
        })()}

      <div className="border-border/50 mt-1 border-t pt-1">
        <Row label="Average per hit" value={formatDamage(result.perHit.total)} />
        {trace.charge && <Row label="Charge dmg mult" value={`×${trace.charge.mult.toFixed(1)}`} />}
        <Row label="Fire rate (approx.)" value={`×${result.fireRate.toFixed(2)}/s`} />
        <Row
          label="Burst DPS"
          title="Theoretical ceiling: per-hit × fire rate, trigger held down continuously with no reload and every shot landing."
          value={formatDamage(result.burstDps)}
        />
        {result.sustain.reloadSec > 0 && (
          <>
            <Row
              label="Mag cycle"
              value={formatSeconds(result.sustain.magDumpSec + result.sustain.reloadSec)}
            />
            <Row
              indent
              label={`Mag dump (${result.sustain.shotsPerMag} shots)`}
              value={formatSeconds(result.sustain.magDumpSec)}
            />
            <Row indent label="Reload" value={formatSeconds(result.sustain.reloadSec)} />
            {/* result.sustain.sustainedDps already has hit chance folded in (scenarios.ts) — back out the
                reload-only figure so this row reconciles with Mag cycle/Mag dump/Reload above it. */}
            <Row
              label="Sustained DPS"
              value={formatDamage(result.sustain.sustainedDps / (result.hitRatePct / 100))}
            />
          </>
        )}
        {result.hitRatePct < 100 && (
          <Row
            label="Hit chance"
            title="Your Free-aim/VATS hit-rate setting — a miss still costs the shot but deals no damage."
            value={`×${(result.hitRatePct / 100).toFixed(2)}`}
          />
        )}
        <Row
          label="Effective DPS"
          title="Reload-aware sustained DPS × your hit chance — the realistic damage you deal over time."
          value={formatDamage(result.sustain.sustainedDps)}
        />
      </div>

      {result.ap &&
        explain.apRegen &&
        (() => {
          const { agility, isInPowerArmor, poolBase, poolPerAgility, raceBasePct, flat, percent } =
            explain.apRegen;
          const baseRatePct = raceBasePct + flat.result;
          const multiplier = 1 + percent.result;
          return (
            <div className="border-border/50 mt-1 border-t pt-1">
              <Row
                muted
                label={`Base AP pool (${poolBase} + ${poolPerAgility}×${agility} AGI)`}
                value={poolBase + poolPerAgility * agility}
              />
              {contributionRows(explain.apRegen.maxAp, 'ap-max')}
              <Row label="Max AP pool" value={Math.round(result.ap.maxAp)} />

              <Row label="Base AP regen" value={`${baseRatePct.toFixed(1)}%/s`} />
              <Row
                indent
                label={`Base (${isInPowerArmor ? 'power armor' : 'human'})`}
                value={`${raceBasePct.toFixed(1)}%`}
              />
              {flatPercentRows(flat, 'ap-flat')}

              <Row label="Regen rate multiplier" value={`×${multiplier.toFixed(2)}`} />
              {contributionRows(percent, 'ap-pct')}

              <Row label="Net passive AP regen" value={`${result.ap.regenPerSec.toFixed(1)}/s`} />
              {result.ap.regenPerSec > 0 && (
                <Row
                  muted
                  label="Time to fill from empty"
                  value={formatSeconds(result.ap.maxAp / result.ap.regenPerSec)}
                />
              )}

              {result.ap.reloadRegenPerSec > 0 && (
                <>
                  <Row
                    label="Regen during reload"
                    value={`+${result.ap.reloadRegenPerSec.toFixed(1)}/s`}
                  />
                  <Row
                    indent
                    muted
                    label={`Reload window (${formatSeconds(explain.apRegen.reloadSec)} − ${explain.apRegen.regenDelaySec.toFixed(0)}s delay, per ${formatSeconds(
                      explain.apRegen.magDumpSec + explain.apRegen.reloadSec,
                    )} cycle)`}
                    value=""
                  />
                </>
              )}
            </div>
          );
        })()}
    </div>
  );
}
