import { useGameMode } from '@/hooks/useGameMode';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function Header() {
  const { isLive } = useGameMode();

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">FO76 DPS Calculator</h1>
          <span className="text-muted-foreground text-sm">v0.1</span>
          <Badge>Alpha</Badge>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-3 cursor-not-allowed opacity-60">
                <Label htmlFor="game-mode-toggle" className={`text-sm font-medium transition-colors ${isLive ? 'text-foreground' : 'text-muted-foreground'}`}>Live</Label>
                <Switch id="game-mode-toggle" checked={true} disabled aria-label="Toggle between Live and PTS" />
                <Label htmlFor="game-mode-toggle" className={`text-sm font-medium transition-colors ${!isLive ? 'text-foreground' : 'text-muted-foreground'}`}>PTS</Label>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Live mode is still being implemented</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </header>
  );
}
