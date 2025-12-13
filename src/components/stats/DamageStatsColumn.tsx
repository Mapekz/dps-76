import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ArrowDownIcon } from 'lucide-react';
import type { DamageStats } from '@/types';

interface DamageStatsColumnProps {
  playerToEnemy: DamageStats;
  enemyToPlayer: DamageStats;
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="font-mono font-medium">{value.toFixed(1)}</span>
    </div>
  );
}

export function DamageStatsColumn({ playerToEnemy, enemyToPlayer }: DamageStatsColumnProps) {
  return (
    <Card className="w-full max-w-[280px]">
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2 text-sm font-medium">
            <span>Player</span><ArrowDownIcon className="size-4 rotate-[-90deg]" /><span>Enemy</span>
          </div>
          <div className="space-y-2">
            <StatRow label="DPS" value={playerToEnemy.dps} />
            <StatRow label="Torso Hit" value={playerToEnemy.torsoHitDamage} />
            <StatRow label="Weak Point" value={playerToEnemy.weakpointDamage} />
            <StatRow label="VATS Crit" value={playerToEnemy.vatsCritDamage} />
          </div>
        </div>
        <Separator className="my-4" />
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2 text-sm font-medium">
            <span>Enemy</span><ArrowDownIcon className="size-4 rotate-[-90deg]" /><span>Player</span>
          </div>
          <div className="space-y-2">
            <StatRow label="DPS" value={enemyToPlayer.dps} />
            <StatRow label="Torso Hit" value={enemyToPlayer.torsoHitDamage} />
            <StatRow label="Weak Point" value={enemyToPlayer.weakpointDamage} />
          </div>
        </div>
        <div className="text-muted-foreground mt-4 text-center text-xs"><p>v1: Incoming damage focus</p></div>
      </CardContent>
    </Card>
  );
}
