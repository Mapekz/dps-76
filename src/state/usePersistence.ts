import * as React from 'react';
import type { GameMode } from '@/types';
import { decodeBuild, encodeBuild } from '@/lib/persist/codec';
import { useBuild, useBuildDispatch } from './BuildProvider';

const STORAGE_KEY = 'dps76:build';
const HASH_PARAM = 'b';
const WRITE_DEBOUNCE_MS = 400;

function readHash(): string | null {
  const match = new URLSearchParams(window.location.hash.replace(/^#/, '')).get(HASH_PARAM);
  return match || null;
}

/**
 * Boot hydration + debounced autosave.
 *
 * Precedence on load: URL hash `#b=…` (shared links always win over stale
 * autosaves) > localStorage > defaults. On every state change, the encoded
 * build is written to both the hash (history.replaceState — no nav entries)
 * and localStorage. Decode warnings are surfaced via the returned array.
 */
export function usePersistence(mode: GameMode): { warnings: string[]; hydrated: boolean } {
  const state = useBuild();
  const dispatch = useBuildDispatch();
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [hydrated, setHydrated] = React.useState(false);
  const skipNextWrite = React.useRef(true);

  // Boot: hydrate once from URL > localStorage.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const candidates = [readHash(), window.localStorage.getItem(STORAGE_KEY)];
      for (const encoded of candidates) {
        if (!encoded) continue;
        const decoded = await decodeBuild(encoded, mode);
        if (decoded && !cancelled) {
          skipNextWrite.current = true;
          dispatch({ type: 'build/hydrate', state: decoded.state });
          setWarnings(decoded.warnings);
          break;
        }
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // Boot-only by design; mode is fixed for the session today — the Header
    // Live/PTS switch is disabled (issue #40). If #40 ever wires setMode,
    // revisit this empty dep array: re-hydrating on a live mode flip would
    // clobber in-progress edits, so it can't just add `mode` as-is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave: debounce writes; skip the write caused by hydration itself.
  React.useEffect(() => {
    if (!hydrated) return;
    if (skipNextWrite.current) {
      skipNextWrite.current = false;
      return;
    }
    const timer = window.setTimeout(async () => {
      const encoded = await encodeBuild(state);
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      params.set(HASH_PARAM, encoded);
      window.history.replaceState(null, '', `#${params.toString()}`);
      window.localStorage.setItem(STORAGE_KEY, encoded);
    }, WRITE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [state, hydrated]);

  return { warnings, hydrated };
}
