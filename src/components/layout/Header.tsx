import { useGameMode } from '@/hooks/useGameMode';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

export function Header() {
  const { mode, toggleMode, isLive } = useGameMode();

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">FO76 DPS Calculator</h1>
          <span className="text-muted-foreground text-sm">v1.0</span>
          <Badge>Alpha</Badge>
        </div>
        <div className="flex items-center gap-3">
          <Label htmlFor="game-mode-toggle" className={`text-sm font-medium transition-colors ${isLive ? 'text-foreground' : 'text-muted-foreground'}`}>Live</Label>
          <Switch id="game-mode-toggle" checked={mode === 'pts'} onCheckedChange={toggleMode} aria-label="Toggle between Live and PTS" />
          <Label htmlFor="game-mode-toggle" className={`text-sm font-medium transition-colors ${!isLive ? 'text-foreground' : 'text-muted-foreground'}`}>PTS</Label>
        </div>
      </div>
    </header>
  );
}
