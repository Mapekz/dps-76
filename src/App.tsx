import { GameModeProvider, useGameMode } from '@/hooks/useGameMode';
import { ThemeProvider } from '@/hooks/useTheme';
import { BuildProvider } from '@/state/BuildProvider';
import { usePersistence } from '@/state/usePersistence';
import { AppShell } from '@/components/layout/AppShell';
import './App.css';

/** Boot hydration (URL hash > localStorage > defaults) + debounced autosave. */
function PersistenceGate({ children }: { children: React.ReactNode }) {
  const { mode } = useGameMode();
  const { hydrated } = usePersistence(mode);
  // Render nothing until hydration resolves so the first paint is the real build.
  if (!hydrated) return null;
  return <>{children}</>;
}

function App() {
  // Default to Live mode for MVP. PTS toggle re-enabled in todos/pts-toggle.md.
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
