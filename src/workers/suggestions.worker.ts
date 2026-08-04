/// <reference lib="webworker" />

import { evaluateSuggestions } from '@/lib/suggest/evaluate';
import type { GameMode } from '@/types';
import type { BuildState, ScenarioKey } from '@/state/build-reducer';
import type { SuggestionReport } from '@/lib/suggest/types';

/**
 * L3 backstop for #76 (bring the suggestions eval sweep under the 8ms
 * budget): L1 (bucket-indexed folds) measured as a net regression and was
 * reverted; L2 (bucket-relevance candidate pruning, `evaluate.ts`) is sound
 * but only cuts the sweep by ~5-10% for a typical build — nowhere near the
 * 8ms bench tier. Moving the sweep off the main thread removes the budget
 * question entirely rather than reducing its cost; `useSuggestions.ts` is the
 * only caller, dispatching one `EvaluateRequest` per debounced build change
 * and matching responses back by `id` so a superseded (stale) response never
 * overwrites a newer one — see that file's doc-comment.
 *
 * `BuildState` is structured-clone-safe (it round-trips through the persist
 * codec, `src/lib/persist/codec.ts`), so no serialization layer is needed
 * beyond `postMessage`'s own structured clone.
 */

export interface EvaluateRequest {
  type: 'evaluate';
  id: number;
  state: BuildState;
  mode: GameMode;
  metric: ScenarioKey;
}

export interface EvaluateResponse {
  type: 'result';
  id: number;
  report: SuggestionReport;
}

self.onmessage = (event: MessageEvent<EvaluateRequest>) => {
  const { id, state, mode, metric } = event.data;
  const report = evaluateSuggestions(state, mode, metric);
  const response: EvaluateResponse = { type: 'result', id, report };
  self.postMessage(response);
};
