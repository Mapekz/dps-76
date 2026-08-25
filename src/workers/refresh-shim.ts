/// <reference lib="webworker" />

/**
 * No-op React Fast Refresh globals for the Worker context. **Import this first**
 * — see `suggestions.worker.ts`.
 *
 * `@vitejs/plugin-react`'s `compiler: true` mode moves Fast Refresh injection
 * into its own transform hook, where it applies to every file it transforms
 * (`refresh: isClient && isFastRefreshEnabled()`) regardless of whether the
 * React Compiler actually compiled that file — and `isClient` is
 * `consumer !== 'server'`, which does not distinguish the main window from a
 * Worker. This worker shares most of its import graph with the app
 * (`src/state/build-reducer.ts`, `src/lib/engine/scenarios.ts`, ...), so those
 * dual-consumed modules arrive carrying `$RefreshReg$`/`$RefreshSig$` calls
 * whose runtime only ever gets injected into the main window — throwing
 * `ReferenceError: $RefreshReg$ is not defined` on worker startup.
 *
 * Defining no-ops in the worker scope is the documented remedy for exactly this
 * "plugins don't apply to child compilers" case (react-refresh-webpack-plugin's
 * TROUBLESHOOTING.md prescribes the same two assignments for Web Workers).
 * Nothing in this worker's graph renders React, so there is genuinely nothing
 * for the real refresh runtime to do here.
 *
 * Dev-only: Fast Refresh is off in production builds, so the whole block is
 * dead code that Rolldown drops. Delete this file (and its import) once
 * upstream fixes the check — tracked in dps-76#87.
 */
if (import.meta.env.DEV) {
  const scope = self as unknown as Record<string, unknown>;
  scope.$RefreshReg$ = () => {};
  // react-refresh calls the result with the component and expects it back.
  scope.$RefreshSig$ = () => (type: unknown) => type;
}
