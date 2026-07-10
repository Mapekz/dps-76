import * as React from 'react';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild } from '@/state/BuildProvider';
import { useScenarioResults } from '@/state/useScenarioResults';
import { evaluateSuggestions } from '@/lib/suggest/evaluate';
import type { SuggestionReport } from '@/lib/suggest/types';

const RECOMPUTE_DEBOUNCE_MS = 300;

/**
 * Debounced full what-if sweep (~400 evals ≈ 2ms, benched). While a recompute
 * is pending the previous report is returned with `stale: true` so the panel
 * can dim instead of flickering empty.
 */
export function useSuggestions(): { report: SuggestionReport | null; stale: boolean } {
  const { mode } = useGameMode();
  const state = useBuild();
  const { emphasized } = useScenarioResults();

  const [report, setReport] = React.useState<SuggestionReport | null>(null);
  const [stale, setStale] = React.useState(false);

  React.useEffect(() => {
    setStale(true);
    const timer = window.setTimeout(() => {
      setReport(evaluateSuggestions(state, mode, emphasized));
      setStale(false);
    }, RECOMPUTE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [state, mode, emphasized]);

  return { report, stale };
}
