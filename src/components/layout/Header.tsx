import { useGameMode } from '@/hooks/useGameMode';
import { useBuild } from '@/state/BuildProvider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Title } from '@/components/ui/typography';
import { BuildUrlInput } from './BuildUrlInput';
import { ThemeToggle } from './ThemeToggle';

export function Header() {
  const { isLive, toggleMode } = useGameMode();
  const { buildName } = useBuild();

  return (
    <header className="border-b bg-card sticky top-0 z-40">
      <div className="container mx-auto flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <div className="flex items-center gap-3">
          <Title level={1}>DPS-76</Title>
          <Badge variant="secondary">Alpha</Badge>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-md">
          <BuildUrlInput />
          {buildName && (
            <Badge
              variant="outline"
              className="hidden max-w-40 truncate sm:inline-flex"
              title={buildName}
            >
              {buildName}
            </Badge>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden cursor-not-allowed items-center gap-2 opacity-60 sm:flex">
            <Label
              htmlFor="game-mode-toggle"
              className={`text-sm ${isLive ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              Live
            </Label>
            <Switch
              id="game-mode-toggle"
              checked={isLive}
              onCheckedChange={toggleMode}
              // Stays locked to Live until a genuinely new PTS dump is
              // extracted (see docs/agents/issue-tracker.md #40) — the
              // handler is wired now so re-enabling later is a one-line
              // change (drop this prop), not a new implementation.
              disabled
              aria-label="Toggle between Live and PTS"
            />
            <Label
              htmlFor="game-mode-toggle"
              className={`text-sm ${!isLive ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              PTS
            </Label>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
