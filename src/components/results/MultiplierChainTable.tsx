import { Fragment } from 'react';
import type { ScenarioResult } from '@/lib/engine/scenarios';
import { formatDamage } from '@/lib/format';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SectionLabel } from '@/components/ui/typography';
import { Row } from './breakdown-row';
import { contributionRows, formatSeconds, signed, wholeDamageRows } from './trace-rows';

/** A ledger row label that opens a definition on hover/keyboard focus. */
function DefinitionLabel({
  children,
  definition,
}: {
  children: React.ReactNode;
  definition: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="cursor-help" />}>{children}</TooltipTrigger>
      <TooltipContent>{definition}</TooltipContent>
    </Tooltip>
  );
}

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
            {multi && <SectionLabel className="pt-1">{component.damageType}</SectionLabel>}
            <Row label="Base damage" value={formatDamage(componentHit.base)} />
            {contributionRows(component.baseDamage, `bd-${i}`)}
            <Row label="Damage Bonus Mult" value={`×${component.dbm.result.toFixed(2)}`} />
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
        <>
          <Row
            label={trace.bodyPartMult > 1 ? 'Body part (weakpoint)' : 'Body part (limb)'}
            value={`×${trace.bodyPartMult.toFixed(2)}`}
          />
          {/*
           * VATS resolves the aimed part directly; Free Aim doesn't — a
           * fraction of shots land the aimed part and the rest hit
           * center-mass at ×1.00 (bodyPartBlendedHit, scenarios.ts), so this
           * row is already the blended result, not a straight multiplier.
           * Free Aim is the only scenario without result.ap.
           */}
          {!result.ap && (
            <p className="text-muted-foreground text-3xs pl-3">
              Free aim blends aimed-part hits with center-mass (×1.00) hits at your body-part hit
              rate — VATS resolves the aimed part directly.
            </p>
          )}
        </>
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
          label={
            <DefinitionLabel definition="Theoretical ceiling: per-hit × fire rate, trigger held down continuously with no reload and every shot landing.">
              Burst DPS
            </DefinitionLabel>
          }
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
            {/*
             * Data-confidence flag, not a definition — reload time comes
             * from the ESM animation length ÷ folded reload speed, never
             * measured in-game (sustain.ts's reloadApproximate is
             * unconditionally true whenever a reload model applies at all).
             * A visible marker, not a hover, per the design critique.
             */}
            <p className="text-muted-foreground text-3xs pl-3">
              Reload time is from the ESM animation length ÷ folded reload speed — unverified
              in-game.
            </p>
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
            label={
              <DefinitionLabel definition="Your Free-aim/VATS hit-rate setting — a miss still costs the shot but deals no damage.">
                Hit chance
              </DefinitionLabel>
            }
            value={`×${(result.hitRatePct / 100).toFixed(2)}`}
          />
        )}
        <Row
          label={
            <DefinitionLabel definition="Reload-aware sustained DPS × your hit chance — the realistic damage dealt over time.">
              Effective DPS
            </DefinitionLabel>
          }
          value={formatDamage(result.sustain.sustainedDps)}
        />
        {result.dotDps > 0 && (
          <Row
            muted
            label={
              <DefinitionLabel definition="Steady-state damage-over-time while continuously attacking. Not mitigated by enemy resist in this version — see docs/assumptions.md.">
                DoT
              </DefinitionLabel>
            }
            value={`+${formatDamage(result.dotDps)}/s`}
          />
        )}
      </div>
    </div>
  );
}
