import * as React from 'react';
import type { ScenarioSet } from '@/lib/engine/scenarios';
import type { HitBreakdown } from '@/lib/engine/paper-damage';

interface DamageStatsColumnProps {
  scenarios: ScenarioSet | null;
}

function StatRow({ label, value, unit = '' }: { label: string; value: number; unit?: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="font-mono font-medium tabular-nums">
        {value.toFixed(1)}{unit}
      </span>
    </div>
  );
}

function ComponentRows({ perHit }: { perHit: HitBreakdown }) {
  if (perHit.components.length <= 1) return null;
  return (
    <>
      {perHit.components.map((c, i) => (
        <div key={i} className="flex items-center justify-between py-0.5 pl-3">
          <span className="text-muted-foreground text-xs capitalize">{c.damageType}</span>
          <span className="text-muted-foreground font-mono text-xs tabular-nums">{c.damage.toFixed(1)}</span>
        </div>
      ))}
    </>
  );
}

function ScenarioSection({
  title,
  perHit,
  dps,
  critNote,
  children,
}: {
  title: string;
  perHit: HitBreakdown;
  dps: number;
  critNote?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-muted-foreground mb-1 text-xs font-semibold uppercase tracking-wider">{title}</p>
      <StatRow label="Dmg / hit" value={perHit.total} />
      <ComponentRows perHit={perHit} />
      <StatRow label="DPS" value={dps} />
      {critNote && <p className="text-muted-foreground pt-0.5 text-xs">{critNote}</p>}
      {children}
    </div>
  );
}

export function DamageStatsColumn({ scenarios }: DamageStatsColumnProps) {
  if (!scenarios) {
    return (
      <div className="w-full max-w-[280px] space-y-6 p-3 pt-12">
        <p className="text-muted-foreground text-sm">Select a weapon to see damage stats.</p>
      </div>
    );
  }

  const { manualAim, vats, vatsSneak } = scenarios;
  const critNote =
    vats.critRate && vats.critRate > 0 && Number.isFinite(vats.critRate)
      ? `Crit every ${Math.round(1 / vats.critRate)} shots`
      : 'No crits (meter never fills)';

  return (
    <div className="w-full max-w-[280px] space-y-6 p-3 pt-12">

      {/* Fire rate (approximate until animation-derived timing lands) */}
      <div>
        <p className="text-muted-foreground mb-1 text-xs font-semibold uppercase tracking-wider">
          Fire Rate <span className="normal-case font-normal">(approx.)</span>
        </p>
        <StatRow label="Shots / sec" value={manualAim.fireRate} />
      </div>

      <ScenarioSection title="Manual Aim" perHit={manualAim.perHit} dps={manualAim.sustainedDps}>
        <StatRow label="Weakpoint / hit" value={manualAim.weakpointPerHit.total} />
        <StatRow label="Weakpoint DPS" value={manualAim.weakpointDps} />
      </ScenarioSection>

      <ScenarioSection title="VATS (weakpoint)" perHit={vats.perHit} dps={vats.sustainedDps} critNote={critNote} />

      <ScenarioSection
        title="VATS + Sneak"
        perHit={vatsSneak.perHit}
        dps={vatsSneak.sustainedDps}
        critNote="Assumes every hit is an undetected sneak attack"
      />

      {/* Manual aim caveat */}
      <p className="text-muted-foreground border-muted border-t pt-4 text-xs leading-relaxed">
        <strong>Notes:</strong> Assumes 100% hit rate at max fire rate. Fire rate is
        approximate until animation timings are verified. VATS assumes weakpoint
        lock; sneak assumes never detected.
      </p>
    </div>
  );
}
