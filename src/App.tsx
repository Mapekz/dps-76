import * as React from 'react';
import { GameModeProvider, useGameMode } from '@/hooks/useGameMode';
import { useDamageCalc } from '@/hooks/useDamageCalc';
import { Header } from '@/components/layout/Header';
import { ThreeColumnLayout } from '@/components/layout/ThreeColumnLayout';
import { BuildUrlInput } from '@/components/layout/BuildUrlInput';
import { PlayerColumn } from '@/components/player/PlayerColumn';
import { EnemyColumn } from '@/components/enemy/EnemyColumn';
import { DamageStatsColumn } from '@/components/stats/DamageStatsColumn';
import { parsedPerksToLoadout } from '@/lib/nukes-dragons';
import { createDefaultPlayerConfig, createDefaultEnemyConfig, type PlayerConfig, type EnemyConfig, type ParsedPerk } from '@/types';
import './App.css';

function DPSCalculator() {
  const { mode } = useGameMode();
  const [playerConfig, setPlayerConfig] = React.useState<PlayerConfig>(createDefaultPlayerConfig());
  const [parsedPerks, setParsedPerks] = React.useState<ParsedPerk[]>([]);
  const [buildName, setBuildName] = React.useState<string | null>(null);
  const [enemyConfig, setEnemyConfig] = React.useState<EnemyConfig>(createDefaultEnemyConfig());

  const { playerToEnemy, enemyToPlayer } = useDamageCalc(playerConfig, enemyConfig, mode);

  const handlePerksLoaded = React.useCallback((perks: ParsedPerk[], name: string | null) => {
    setParsedPerks(perks);
    setBuildName(name);
    setPlayerConfig((prev) => ({ ...prev, perks: parsedPerksToLoadout(perks) }));
  }, []);

  return (
    <div className="bg-background min-h-screen">
      <Header />
      <ThreeColumnLayout
        topContent={
          <div className="mx-auto max-w-2xl space-y-2">
            <BuildUrlInput onPerksLoaded={handlePerksLoaded} />
            {buildName && <p className="text-muted-foreground text-center text-sm">Build: <span className="font-medium">{buildName}</span></p>}
          </div>
        }
        leftColumn={<PlayerColumn config={playerConfig} parsedPerks={parsedPerks} onConfigChange={setPlayerConfig} />}
        centerColumn={<DamageStatsColumn playerToEnemy={playerToEnemy} enemyToPlayer={enemyToPlayer} />}
        rightColumn={<EnemyColumn config={enemyConfig} onConfigChange={setEnemyConfig} />}
      />
    </div>
  );
}

function App() {
  return (
    <GameModeProvider>
      <DPSCalculator />
    </GameModeProvider>
  );
}

export default App;
