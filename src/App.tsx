import * as React from 'react';
import { GameModeProvider, useGameMode } from '@/hooks/useGameMode';
import { useDamageCalc } from '@/hooks/useDamageCalc';
import { Header } from '@/components/layout/Header';
import { ThreeColumnLayout } from '@/components/layout/ThreeColumnLayout';
import { BuildUrlInput } from '@/components/layout/BuildUrlInput';
import { PlayerColumn } from '@/components/player/PlayerColumn';
import { DamageStatsColumn } from '@/components/stats/DamageStatsColumn';
import { parsedPerksToLoadout, isLegendaryPerkKey } from '@/lib/nukes-dragons';
import {
  createDefaultPlayerConfig,
  createDefaultEnemyConfig,
  type PlayerConfig,
  type EnemyConfig,
  type ParsedPerk,
} from '@/types';
import './App.css';

// EnemyColumn is kept in the tree as scaffolding but not rendered for MVP.
// Re-enable in the enemy-defenses week (todos/enemy-defenses.md).
// import { EnemyColumn } from '@/components/enemy/EnemyColumn';

function DPSCalculator() {
  const { mode } = useGameMode();
  const [playerConfig, setPlayerConfig] = React.useState<PlayerConfig>(createDefaultPlayerConfig());
  const [parsedPerks, setParsedPerks] = React.useState<ParsedPerk[]>([]);
  const [buildName, setBuildName] = React.useState<string | null>(null);
  const [enemyConfig] = React.useState<EnemyConfig>(createDefaultEnemyConfig());

  const { playerToEnemy } = useDamageCalc(playerConfig, enemyConfig, mode);

  const handlePerksLoaded = React.useCallback((perks: ParsedPerk[], name: string | null) => {
    setParsedPerks(perks);
    setBuildName(name);

    // Split parsed perks into regular vs legendary by N&D key prefix.
    // Legendary perk keys all start with "0" in the nukesDragonsPerks map.
    const regularPerks = perks.filter(p => !isLegendaryPerkKey(p.key));
    const leggoPerks   = perks.filter(p =>  isLegendaryPerkKey(p.key));

    setPlayerConfig(prev => ({
      ...prev,
      perks:         parsedPerksToLoadout(regularPerks),
      legendaryPerks: parsedPerksToLoadout(leggoPerks),
    }));
  }, []);

  return (
    <div className="bg-background min-h-screen">
      <Header />
      <ThreeColumnLayout
        topContent={
          <div className="mx-auto max-w-2xl space-y-2">
            <BuildUrlInput onPerksLoaded={handlePerksLoaded} />
            {buildName && (
              <p className="text-muted-foreground text-center text-sm">
                Build: <span className="font-medium">{buildName}</span>
              </p>
            )}
          </div>
        }
        leftColumn={
          <PlayerColumn
            config={playerConfig}
            parsedPerks={parsedPerks}
            onConfigChange={setPlayerConfig}
          />
        }
        centerColumn={<DamageStatsColumn stats={playerToEnemy} />}
        rightColumn={<div />}
      />
    </div>
  );
}

function App() {
  // Default to Live mode for MVP. PTS toggle re-enabled in todos/pts-toggle.md.
  return (
    <GameModeProvider defaultMode="live">
      <DPSCalculator />
    </GameModeProvider>
  );
}

export default App;
