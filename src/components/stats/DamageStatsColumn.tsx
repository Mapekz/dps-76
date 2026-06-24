import * as React from 'react';
import type { DamageStats } from '@/types';

interface DamageStatsColumnProps {
  stats: DamageStats;
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground mb-1 text-xs font-semibold uppercase tracking-wider">
      {children}
    </p>
  );
}

export function DamageStatsColumn({ stats }: DamageStatsColumnProps) {
  const hasData = stats.fireRate > 0;

  return (
    <div className="w-full max-w-[280px] space-y-6 p-3 pt-12">

      {/* Fire Rate */}
      <div>
        <SectionLabel>Fire Rate</SectionLabel>
        <StatRow label="Shots / sec" value={stats.fireRate} />
      </div>

      {/* Normal */}
      <div>
        <SectionLabel>Normal</SectionLabel>
        <StatRow label="Dmg / hit" value={stats.normalPerHit} />
        <StatRow label="DPS"       value={stats.normalDps} />
      </div>

      {/* Weakpoint */}
      <div>
        <SectionLabel>Weakpoint</SectionLabel>
        <StatRow label="Dmg / hit" value={stats.weakpointPerHit} />
        <StatRow label="DPS"       value={stats.weakpointDps} />
      </div>

      {/* Manual aim caveat */}
      {hasData && (
        <p className="text-muted-foreground border-muted border-t pt-4 text-xs leading-relaxed">
          <strong>Manual aim note:</strong> Assumes 100% hit rate and max fire rate.
          Realistically, expect to miss 30–70% of shots depending on movement and
          target size, and recoil/spread may reduce effective fire rate by 30–50%,
          cutting practical DPS proportionally.
        </p>
      )}
    </div>
  );
}
