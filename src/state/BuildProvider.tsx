import * as React from 'react';
import { buildReducer, createDefaultBuildState, type BuildAction, type BuildState } from './build-reducer';

/**
 * State and dispatch contexts are split so components that only dispatch
 * (config inputs) can be memoized without re-rendering on every state change.
 */
const BuildStateContext = React.createContext<BuildState | null>(null);
const BuildDispatchContext = React.createContext<React.Dispatch<BuildAction> | null>(null);

export function BuildProvider({ children, initialState }: { children: React.ReactNode; initialState?: BuildState }) {
  const [state, dispatch] = React.useReducer(buildReducer, initialState, init => init ?? createDefaultBuildState());
  return (
    <BuildStateContext.Provider value={state}>
      <BuildDispatchContext.Provider value={dispatch}>{children}</BuildDispatchContext.Provider>
    </BuildStateContext.Provider>
  );
}

// Provider + hooks in one file is the established pattern here (useGameMode).
// eslint-disable-next-line react-refresh/only-export-components
export function useBuild(): BuildState {
  const state = React.useContext(BuildStateContext);
  if (!state) throw new Error('useBuild must be used within BuildProvider');
  return state;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBuildDispatch(): React.Dispatch<BuildAction> {
  const dispatch = React.useContext(BuildDispatchContext);
  if (!dispatch) throw new Error('useBuildDispatch must be used within BuildProvider');
  return dispatch;
}
