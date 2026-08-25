import * as React from 'react';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild } from '@/state/BuildProvider';
import { useScenarioResults } from '@/state/useScenarioResults';
import type { ScenarioKey } from '@/state/build-reducer';
import type { GameMode, PlayerConfig, EnemyConfig } from '@/types';
import type { SuggestionReport } from '@/lib/suggest/types';
import type { EvaluateRequest, EvaluateResponse } from '@/workers/suggestions.worker';

const RECOMPUTE_DEBOUNCE_MS = 300;

export interface Inputs {
  player: PlayerConfig;
  enemy: EnemyConfig;
  mode: GameMode;
  metric: ScenarioKey;
}

/** A held report plus the exact inputs the worker computed it from. */
export type HeldResult = ({ report: SuggestionReport } & Inputs) | null;

/**
 * True whenever the held report was computed from different inputs than the
 * current ones — i.e. a recompute is owed and the panel should dim.
 *
 * Comparison is by **reference identity, deliberately not deep equality**, for
 * the same reason the recompute effect keys on `player`/`enemy` rather than the
 * whole `BuildState`: the reducer's immutable updates preserve each slice's
 * identity across UI-only actions (`view/set`, `build/rename`), so identity
 * flips exactly when something build-relevant changed and never on incidental
 * UI churn. A structurally-equal-but-freshly-allocated slice therefore reads as
 * stale — correct, since the reducer only allocates a new one when it changed.
 * See `build-reducer.test.ts`'s pin of that invariant.
 */
export function isReportStale(result: HeldResult, current: Inputs): boolean {
  return (
    result === null ||
    result.player !== current.player ||
    result.enemy !== current.enemy ||
    result.mode !== current.mode ||
    result.metric !== current.metric
  );
}

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
 * `stale` is derived at render time (not effect-set state): it's true
 * whenever the inputs that produced the held report don't match the current
 * ones, by reference identity — see the derivation at the bottom of this
 * function for why that identity comparison is safe.
 */
export function useSuggestions(): { report: SuggestionReport | null; stale: boolean } {
  const { mode } = useGameMode();
  const state = useBuild();
  const { emphasized } = useScenarioResults();

  const [result, setResult] = React.useState<HeldResult>(null);

  const workerRef = React.useRef<Worker | null>(null);
  const requestIdRef = React.useRef(0);
  // Inputs for the most recently SENT request (not the most recently applied
  // one) — `onmessage` already drops any response whose id is superseded, so
  // whenever a response is actually applied this is by construction the
  // Inputs that produced it.
  const lastSentRef = React.useRef<Inputs | null>(null);

  React.useEffect(() => {
    const worker = new Worker(new URL('../workers/suggestions.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<EvaluateResponse>) => {
      const { id, report: nextReport } = event.data;
      // Drop a response superseded by a newer request already sent — see the
      // module doc-comment above.
      if (id !== requestIdRef.current) return;
      const sent = lastSentRef.current;
      if (!sent) return;
      setResult({ report: nextReport, ...sent });
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // An Effect Event reads the latest player/enemy/mode/metric non-reactively
  // — the debounce timer below is the only thing that needs to react to
  // them changing.
  const sendRequest = React.useEffectEvent(() => {
    const worker = workerRef.current;
    if (!worker) return;
    const id = ++requestIdRef.current;
    lastSentRef.current = { player: state.player, enemy: state.enemy, mode, metric: emphasized };
    const request: EvaluateRequest = { type: 'evaluate', id, state, mode, metric: emphasized };
    worker.postMessage(request);
  });

  // Keyed on `state.player`/`state.enemy` (NOT the whole BuildState): the
  // reducer's immutable updates preserve both slices' reference identity
  // across UI-only actions (`view/set`, `build/rename`), and the sweep reads
  // nothing else from the state — so breakdown toggles, dialogs, and other
  // non-build UI churn neither recompute nor flash the panel stale.
  const { player, enemy } = state;
  React.useEffect(() => {
    const timer = window.setTimeout(sendRequest, RECOMPUTE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // These deps are deliberate *triggers*, not values the body reads —
    // `sendRequest` is an Effect Event, so it reads them non-reactively and
    // the effect body references nothing else. `exhaustive-effect-dependencies`
    // therefore calls them "extra", but dropping them to `[]` would run the
    // debounce once on mount and never recompute again, which is the whole
    // feature. The rule has no way to express a restart-on-change dependency.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [player, enemy, mode, emphasized]);

  // Derived at render time, never effect-set state — see `isReportStale`.
  const stale = isReportStale(result, { player, enemy, mode, metric: emphasized });

  return { report: result?.report ?? null, stale };
}
