import * as React from 'react';
import type { GameMode } from '@/types';

interface GameModeContextValue {
  mode: GameMode;
  setMode: (mode: GameMode) => void;
  toggleMode: () => void;
  isLive: boolean;
  isPTS: boolean;
}

const GameModeContext = React.createContext<GameModeContextValue | undefined>(undefined);

interface GameModeProviderProps {
  children: React.ReactNode;
  defaultMode?: GameMode;
}

export function GameModeProvider({ children, defaultMode = 'live' }: GameModeProviderProps) {
  const [mode, setMode] = React.useState<GameMode>(defaultMode);
  const toggleMode = React.useCallback(() => {
    setMode((prev) => (prev === 'live' ? 'pts' : 'live'));
  }, []);

  const value = React.useMemo<GameModeContextValue>(
    () => ({ mode, setMode, toggleMode, isLive: mode === 'live', isPTS: mode === 'pts' }),
    [mode, toggleMode]
  );

  return <GameModeContext.Provider value={value}>{children}</GameModeContext.Provider>;
}

export function useGameMode(): GameModeContextValue {
  const context = React.useContext(GameModeContext);
  if (context === undefined) {
    throw new Error('useGameMode must be used within a GameModeProvider');
  }
  return context;
}
