import * as React from 'react';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild } from '@/state/BuildProvider';
import { useScenarioResults } from '@/state/useScenarioResults';
import type { SuggestionReport } from '@/lib/suggest/types';
import type { EvaluateRequest, EvaluateResponse } from '@/workers/suggestions.worker';

const RECOMPUTE_DEBOUNCE_MS = 300;

/**
 * Debounced full what-if sweep, run on a dedicated Web Worker (#76's L3
 * backstop — bucket-indexed engine folds regressed on measurement, and sound
 * candidate pruning alone only trims the ~24ms sweep by ~5-10%, still well
 * over the bench's 8ms "plain useMemo" tier; see `evaluate.ts`'s doc-comments
 * and `scripts/bench-engine.ts`'s header for the full tier rule). Moving the
 * sweep off the main thread removes the budget question rather than reducing
 * it — the worker owns its own copy of the whole engine/data graph (Vite
 * bundles `suggestions.worker.ts` as a separate entry), so nothing here pays
 * its cost directly.
 *
 * One worker per mount, terminated on unmount. Requests carry a monotonic
 * `id`; only the response whose id matches the LATEST issued request is
 * applied — a single worker processes messages strictly in submission order,
 * so responses arrive in the same order requests were sent, and a response
 * for an id older than what's currently outstanding means a newer request
 * was already sent while that one was still computing. Comparing against the
 * latest ISSUED id (not the latest APPLIED one) matters here: it's what
 * keeps the panel dimmed through to the truly-latest result instead of
 * flashing a superseded-but-still-newer-than-nothing response on the way.
 * While a recompute is pending the previous report is returned with
 * `stale: true` so the panel can dim instead of flickering empty.
 */
export function useSuggestions(): { report: SuggestionReport | null; stale: boolean } {
  const { mode } = useGameMode();
  const state = useBuild();
  const { emphasized } = useScenarioResults();

  const [report, setReport] = React.useState<SuggestionReport | null>(null);
  const [stale, setStale] = React.useState(false);

  const workerRef = React.useRef<Worker | null>(null);
  const requestIdRef = React.useRef(0);
  // Latest full state for the worker request without making it an effect
  // dependency — the recompute effect below keys on the build-relevant
  // slices only, so UI-only dispatches (view/set breakdown toggle, renames)
  // don't re-run the sweep or dim the panel.
  const stateRef = React.useRef(state);
  stateRef.current = state;

  React.useEffect(() => {
    const worker = new Worker(new URL('../workers/suggestions.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<EvaluateResponse>) => {
      const { id, report: nextReport } = event.data;
      // Drop a response superseded by a newer request already sent — see the
      // module doc-comment above.
      if (id !== requestIdRef.current) return;
      setReport(nextReport);
      setStale(false);
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // Keyed on `state.player`/`state.enemy` (NOT the whole BuildState): the
  // reducer's immutable updates preserve both slices' reference identity
  // across UI-only actions (`view/set`, `build/rename`), and the sweep reads
  // nothing else from the state — so breakdown toggles, dialogs, and other
  // non-build UI churn neither recompute nor flash the panel stale.
  const { player, enemy } = state;
  React.useEffect(() => {
    // Immediate stale flag so the panel dims while the debounced recompute runs.
    // (Deliberate setState-in-effect; no oxlint rule for this pattern today.)
    setStale(true);
    const timer = window.setTimeout(() => {
      const worker = workerRef.current;
      if (!worker) return;
      const id = ++requestIdRef.current;
      const request: EvaluateRequest = {
        type: 'evaluate',
        id,
        state: stateRef.current,
        mode,
        metric: emphasized,
      };
      worker.postMessage(request);
    }, RECOMPUTE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [player, enemy, mode, emphasized]);

  return { report, stale };
}
