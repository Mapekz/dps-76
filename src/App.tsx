import { useState } from 'react';
import { GameModeProvider, useGameMode } from '@/hooks/useGameMode';
import { ThemeProvider } from '@/hooks/useTheme';
import { BuildProvider } from '@/state/BuildProvider';
import { usePersistence } from '@/state/usePersistence';
import { AppShell } from '@/components/layout/AppShell';
import { Banner } from '@/components/ui/banner';
import './App.css';

/** Boot hydration (URL hash > localStorage > defaults) + debounced autosave. */
function PersistenceGate({ children }: { children: React.ReactNode }) {
  const { mode } = useGameMode();
  const { hydrated, warnings } = usePersistence(mode);
  const [dismissed, setDismissed] = useState(false);
  // Render nothing until hydration resolves so the first paint is the real build.
  if (!hydrated) return null;
  return (
    <>
      {warnings.length > 0 && !dismissed && (
        <Banner messages={warnings} onDismiss={() => setDismissed(true)} />
      )}
      {children}
    </>
  );
}

function App() {
  // Default to Live mode for MVP. PTS toggle wiring tracked as issue #40
  // (Mapekz/dps-76) — the Header switch stays disabled until it ships.
  return (
    <ThemeProvider>
      <GameModeProvider defaultMode="live">
        <BuildProvider>
          <PersistenceGate>
            <AppShell />
          </PersistenceGate>
        </BuildProvider>
      </GameModeProvider>
    </ThemeProvider>
  );
}

export default App;
